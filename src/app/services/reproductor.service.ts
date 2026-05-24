import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Cancion, MusicaService } from './musica.service';
import { WebsocketService, ReproductorEvent } from './websocket.service';
import { AuthService } from './auth.service';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReproductorService implements OnDestroy {
  private audio = new Audio();
  private readonly BASE_URL = environment.apiUrl;

  private _cancionActual = new BehaviorSubject<Cancion | null>(null);
  private _cola = new BehaviorSubject<Cancion[]>([]);
  private _historial = new BehaviorSubject<Cancion[]>([]);
  private _reproduciendo = new BehaviorSubject<boolean>(false);
  private _progreso = new BehaviorSubject<number>(0);
  private _duracion = new BehaviorSubject<number>(0);
  private _volumen = new BehaviorSubject<number>(1);
  private _dispositivosActivos = new BehaviorSubject<string[]>([]);
  private reproduciendoGlobal = new BehaviorSubject<boolean>(false);
  private progresoGlobal = new BehaviorSubject<number>(0);
  private progresoRemotoActual = 0;

  dispositivosActivos$ = this._dispositivosActivos.asObservable();
  cancionActual$ = this._cancionActual.asObservable();
  cola$ = this._cola.asObservable();
  reproduciendo$ = this.reproduciendoGlobal.asObservable();
  progreso$ = this.progresoGlobal.asObservable();
  duracion$ = this._duracion.asObservable();
  volumen$ = this._volumen.asObservable();

  private subs = new Subscription();
  private wsSyncSub?: Subscription;
  // Catálogo completo de canciones cargado la primera vez que se llama a
  // reproducir(). Se usa para resolver IDs de cola recibidos por WS sin
  // tener que hacer N peticiones HTTP por cada canción en la cola.
  private _catalogo: Cancion[] = [];

  /**
   * Contador de eventos propios en vuelo.
   * Usamos un contador en lugar de un booleano para evitar que un timeout
   * del primer evento desactive el flag mientras el segundo evento aún viaja.
   * Se incrementa al emitir y se decrementa tras 500ms (margen suficiente
   * para cubrir latencias Android ↔ servidor ↔ Web).
   */
  private _ignorarContador = 0;

  /**
   * Último segundo (entero) para el que ya se emitió un SEEK.
   * Evita la ráfaga de mensajes que se producía porque timeupdate dispara
   * ~4 veces por segundo y Math.floor(t) % 5 === 0 se mantiene true
   * durante ~1 segundo completo.
   */
  private _ultimoSeekEmitido = -1;
  private enBucle = new BehaviorSubject<boolean>(false);
  enBucle$ = this.enBucle.asObservable();

  constructor(
    private wsService: WebsocketService,
    private authService: AuthService,
    private musicaService: MusicaService,
  ) {
    // ── Eventos del elemento Audio ────────────────────────
    this.audio.addEventListener('timeupdate', () => {
      this._progreso.next(this.audio.currentTime); // interno (para el SEEK local)
      this.progresoGlobal.next(this.audio.currentTime); // público (para la barra UI)
      this.progresoRemotoActual = this.audio.currentTime;
      // Emitir posición SEEK exactamente una vez por cada múltiplo de 5 s
      const seg = Math.floor(this.audio.currentTime);
      if (seg % 5 === 0 && seg !== this._ultimoSeekEmitido) {
        this._ultimoSeekEmitido = seg;
        this.emitirEvento({ tipo: 'SEEK', progreso: this.audio.currentTime });
      }
    });

    this.audio.addEventListener('durationchange', () =>
      this._duracion.next(this.audio.duration || 0),
    );
    // Cada vez que se carga un nuevo recurso (cambio de canción local o remoto)
    // reseteamos el último SEEK emitido para que el primer múltiplo de 5 s de
    // la nueva canción genere un evento, incluso si coincide con el último de
    // la canción anterior.
    this.audio.addEventListener('loadstart', () => {
      this._ultimoSeekEmitido = -1;
    });
    this.audio.addEventListener('ended', () => this.siguiente(false));
    this.audio.addEventListener('play', () => this._reproduciendo.next(true));
    this.audio.addEventListener('pause', () => this._reproduciendo.next(false));
    setInterval(() => {
      if (!this.reproduciendoGlobal.getValue()) return; // nada reproduce globalmente
      if (!this.audio.paused) return; // este dispositivo suena → el audio lo gestiona él solo

      // Duración: preferimos la del elemento Audio, pero si no está cargado
      // usamos duracionSegundos de los metadatos de la canción.
      const duracion =
        this._duracion.getValue() ||
        (this._cancionActual.getValue()?.duracionSegundos ?? 0);

      const progreso = this.progresoGlobal.getValue();
      if (duracion > 0 && progreso < duracion) {
        this.progresoGlobal.next(Math.min(progreso + 1, duracion));
      }
    }, 1000);
    // ── Escuchar eventos WS de otros dispositivos ─────────
    this.subs.add(
      this.wsService.evento$.subscribe((ev) => this.procesarEventoRemoto(ev)),
    );
  }

  // ─── Conectar WebSocket (llamar tras login) ───────────
  iniciarWS() {
    const token = this.authService.obtenerToken();
    const usuario = this.authService.obtenerUsuario();
    if (!token || !usuario?.email) return;

    // Primero reactivar el dispositivo en el servidor,
    // luego conectar el WS para que el estado ya sea válido
    // cuando sincronizarEstadoInicial intente cargar el stream.
    this.authService.reactivarDispositivo().subscribe({
      next: () => this._conectarWS(token, usuario.email),
      error: () => this._conectarWS(token, usuario.email), // conectar igualmente aunque falle
    });
  }
  private _conectarWS(token: string, email: string) {
    this.wsService.conectar(token, email); // idempotente

    // Resincronizar cada vez que pasemos de desconectado→conectado.
    // Antes era take(1): al perderse la conexión (idle, app en background,
    // proxy) los eventos publicados al topic mientras estábamos offline se
    // descartaban y este dispositivo quedaba desfasado hasta recibir un
    // evento nuevo estando online.
    this.wsSyncSub?.unsubscribe();
    this.wsSyncSub = this.wsService.conectado$
      .pipe(
        distinctUntilChanged(),
        filter((conectado) => conectado),
      )
      .subscribe(() => this.sincronizarEstadoInicial());
  }
  private sincronizarEstadoInicial() {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    this.authService.getMisDispositivos().subscribe({
      next: (sesiones: any[]) => {
        // ← antes filtraba por dispositivoActivo (conectado), no por reproduciendo (sonando)
        const reproduciendo = sesiones
          .filter((s: any) => s.reproduciendo)
          .map((s: any) => s.dispositivo?.tipo as string);

        if (reproduciendo.length > 0) {
          this._dispositivosActivos.next(reproduciendo);
        } else if (miDispositivo) {
          this._dispositivosActivos.next([miDispositivo]);
        }
        this.cargarEstadoDelServidor();
      },
      error: () => {
        if (miDispositivo) this._dispositivosActivos.next([miDispositivo]);
        this.cargarEstadoDelServidor();
      },
    });
  }

  private cargarEstadoDelServidor() {
    const headers = {
      Authorization: 'Bearer ' + this.authService.obtenerToken(),
    };
    fetch(this.BASE_URL + '/api/reproductor/estado', { headers })
      .then((res) => {
        if (res.status === 204) return null;
        return res.json();
      })
      .then((estado: any | null) => {
        if (!estado?.cancionId) return;
        console.log('Reproductor: Estado recibido', estado);

        const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
        const activos = this._dispositivosActivos.getValue();
        const deboSonar = miDispositivo
          ? activos.includes(miDispositivo)
          : true;
        const estaSonando = estado.tipo !== 'PAUSE';

        // Metadatos: solo refetch si la canción local no coincide
        const actualLocal = this._cancionActual.getValue();
        if (actualLocal?.id !== estado.cancionId) {
          this.musicaService.getCancionPorId(estado.cancionId).subscribe({
            next: (c: any) => this._cancionActual.next(c),
            error: (err: any) =>
              console.error('Reproductor: Error obteniendo canción', err),
          });
        }

        // Restaurar la cola si el servidor la guardó (solo CAMBIAR_CANCION la persiste)
        if (Array.isArray(estado.cola) && estado.cola.length > 0) {
          this._cola.next(estado.cola as Cancion[]);
        }

        const urlEsperada = `${this.BASE_URL}/api/canciones/${estado.cancionId}/stream`;
        const yaEnEstaCancion =
          this.audio.src === urlEsperada ||
          this.audio.src.endsWith(`/canciones/${estado.cancionId}/stream`);

        const aplicarEstado = () => {
          if (typeof estado.progreso === 'number') {
            const diff = Math.abs(this.audio.currentTime - estado.progreso);
            if (diff > 3 && deboSonar) {
              this.audio.currentTime = estado.progreso;
            }
            this.progresoGlobal.next(estado.progreso);
            this.progresoRemotoActual = estado.progreso;
          }
          if (deboSonar && estaSonando) {
            this.audio.play().catch(() => {});
          } else {
            this.audio.pause();
          }
          this.reproduciendoGlobal.next(estaSonando);
        };

        if (yaEnEstaCancion) {
          // No reasignamos src para no cortar la reproducción en curso
          aplicarEstado();
        } else {
          this.audio.pause();
          this.audio.src = urlEsperada;
          this._ultimoSeekEmitido = -1;
          this.audio.addEventListener('loadedmetadata', aplicarEstado, {
            once: true,
          });
        }
      })
      .catch((err: any) =>
        console.error('Reproductor: Error obteniendo estado inicial', err),
      );
  }

  detener() {
    this.audio.pause();
    this.audio.src = '';
    this._cancionActual.next(null);
    this._cola.next([]);
    this._historial.next([]);
    this._reproduciendo.next(false);
    this._progreso.next(0);
    this._duracion.next(0);
    this._ignorarContador = 0;
    this._ultimoSeekEmitido = -1;
    this.wsSyncSub?.unsubscribe();
    this.wsSyncSub = undefined;
    this.wsService.desconectar();
    this.progresoGlobal.next(0);
  }

  // ─── Procesar evento recibido de otro dispositivo ─────
  private procesarEventoRemoto(ev: ReproductorEvent) {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    if (ev.tipo !== 'TRANSFERIR' && ev.dispositivo === miDispositivo) {
      return; // es el eco de mi propio evento, ignorar
    }
    const activos: string[] =
      ev.dispositivosActivos ?? this._dispositivosActivos.getValue();
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    // Mantener _dispositivosActivos sincronizado en todos los dispositivos.
    // Sin esto, un receptor de CAMBIAR_CANCION con dispositivosActivos=['DESKTOP']
    // procesa deboSonar bien para ese evento, pero su _dispositivosActivos sigue
    // siendo ['WEB']. La próxima vez que emite SIGUIENTE usaría el valor viejo,
    // transfiriendo la reproducción al dispositivo incorrecto.
    if (ev.dispositivosActivos && ev.dispositivosActivos.length > 0) {
      this._dispositivosActivos.next(activos);
    }

    switch (ev.tipo) {
      case 'PLAY':
        this.reproduciendoGlobal.next(true); // ← actualiza el botón en todos los dispositivos
        if (deboSonar) this.audio.play().catch(() => {});
        break;

      case 'PAUSE':
        this.reproduciendoGlobal.next(false);
        this.audio.pause();
        // dispositivosActivos vacío explícito = PAUSE por desconexión → limpiar selector
        if (Array.isArray(ev.dispositivosActivos) && ev.dispositivosActivos.length === 0) {
          this._dispositivosActivos.next([]);
        }
        break;

      case 'SIGUIENTE': {
        // Guardar canción actual en historial antes de cambiar
        const actualAntes = this._cancionActual.getValue();
        if (actualAntes) {
          this._historial.next([...this._historial.getValue(), actualAntes]);
        }
        if (ev.cola !== undefined) {
          this._cola.next(ev.cola as Cancion[]);
        }
        if (ev.cancionId) {
          // Buscar en catálogo local para evitar petición HTTP
          const cancionSig = this._resolverCancionDeEvento({ id: ev.cancionId });
          if (cancionSig) {
            this._cancionActual.next(cancionSig);
          } else {
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => this._cancionActual.next(c),
            });
          }
          if (deboSonar) {
            this.audio.pause();
            this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
            this.audio.addEventListener(
              'canplay',
              () => { this.audio.play().catch(() => {}); },
              { once: true },
            );
            this.reproduciendoGlobal.next(true);
          }
        } else {
          this.siguiente(false);
        }
        break;
      }

      case 'ANTERIOR': {
        if (ev.cola !== undefined) {
          this._cola.next(ev.cola as Cancion[]);
        }
        const histAntes = this._historial.getValue();
        this._historial.next(histAntes.slice(0, -1));
        if (ev.cancionId) {
          const cancionAnt =
            histAntes.find((c) => c.id === ev.cancionId) ??
            this._resolverCancionDeEvento({ id: ev.cancionId });
          if (cancionAnt) {
            this._cancionActual.next(cancionAnt);
          } else {
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => this._cancionActual.next(c),
            });
          }
          if (deboSonar) {
            this.audio.pause();
            this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
            this.audio.addEventListener(
              'canplay',
              () => { this.audio.play().catch(() => {}); },
              { once: true },
            );
            this.reproduciendoGlobal.next(true);
          }
        } else {
          this.anterior(false);
        }
        break;
      }

      case 'CAMBIAR_CANCION':
        this.progresoRemotoActual = 0;
        this.reproduciendoGlobal.next(true);
        if (ev.cola !== undefined) {
          this._cola.next(ev.cola as Cancion[]);
        }
        if (ev.cancionId) {
          this.audio.pause();
          this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
          if (deboSonar) {
            this.audio.addEventListener(
              'canplay',
              () => { this.audio.play().catch(() => {}); },
              { once: true },
            );
          }
          // Buscar en catálogo local para evitar petición HTTP
          const cancionCambiada = this._resolverCancionDeEvento({ id: ev.cancionId });
          if (cancionCambiada) {
            this._cancionActual.next(cancionCambiada);
          } else {
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => this._cancionActual.next(c),
              error: (err: any) =>
                console.error('Reproductor: Error canción remota', err),
            });
          }
        }
        break;

      case 'SEEK':
        if (ev.progreso !== undefined) {
          const diff = Math.abs(this.audio.currentTime - ev.progreso);
          if (diff > 3) {
            this.audio.currentTime = ev.progreso;
          }
          // Actualizar la barra visual en TODOS los dispositivos, suenen o no
          this.progresoGlobal.next(ev.progreso);
          this.progresoRemotoActual = ev.progreso;
        }
        break;

      case 'TRANSFERIR':
        this._dispositivosActivos.next(activos);
        const estabaReproduciendo = this.reproduciendoGlobal.getValue();
        if (miDispositivo && activos.includes(miDispositivo)) {
          if (!ev.cancionId) break;
          const urlDestino = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
          const yaEstaEstaCancion = this.audio.src.includes(
            `canciones/${ev.cancionId}/stream`,
          );
          const yaEstaSonando = !this.audio.paused;
          if (yaEstaEstaCancion && yaEstaSonando) {
            // ya suena la canción correcta, no interrumpir
          } else if (yaEstaEstaCancion && !yaEstaSonando) {
            if (ev.progreso !== undefined) this.audio.currentTime = ev.progreso;
            if (estabaReproduciendo) this.audio.play().catch(() => {});
          } else {
            this.audio.src = urlDestino;
            this.audio.addEventListener(
              'loadedmetadata',
              () => {
                if (ev.progreso !== undefined)
                  this.audio.currentTime = ev.progreso;
                if (estabaReproduciendo) this.audio.play().catch(() => {});
              },
              { once: true },
            );
          }
          if (ev.cancionId) {
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => this._cancionActual.next(c),
            });
          }
        } else {
          this.audio.pause();
          if (ev.cancionId) {
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => this._cancionActual.next(c),
            });
          }
          if (ev.progreso !== undefined) {
            this.progresoRemotoActual = ev.progreso;
            this.progresoGlobal.next(ev.progreso);
          }
        }
        break; // ← aquí, fuera del if/else
    }
  }

  // ─── Reproducir canción ───────────────────────────────
  reproducir(cancion: Cancion, todasLasCanciones: Cancion[]) {
    if (!cancion) return;

    // Actualizar catálogo local para resolver IDs de WS sin peticiones HTTP
    if (todasLasCanciones.length > 0) this._catalogo = todasLasCanciones;

    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    let activos = this._dispositivosActivos.getValue();
    // Sin dispositivo seleccionado → reproducir en este dispositivo
    if (miDispositivo && activos.length === 0) {
      activos = [miDispositivo];
      this._dispositivosActivos.next(activos);
    }
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    const indice = todasLasCanciones.findIndex((c) => c.id === cancion.id);
    this._cancionActual.next(cancion);
    this._cola.next(indice >= 0 ? todasLasCanciones.slice(indice + 1) : []);
    this._historial.next(indice > 0 ? todasLasCanciones.slice(0, indice) : []);

    const yaEstaEstaCancion = this.audio.src.includes(
      `canciones/${cancion.id}/stream`,
    );
    const yaEstaSonando = !this.audio.paused;

    if (deboSonar) {
      // Si ya suena esta misma canción, no reiniciar
      if (!(yaEstaEstaCancion && yaEstaSonando)) {
        this.audio.src = `${this.BASE_URL}/api/canciones/${cancion.id}/stream`;
        this.audio.play().catch(() => {});
      }
    } else {
      // Este dispositivo no debe sonar: carga el src para tener los metadatos pero no reproduce
      this.audio.src = `${this.BASE_URL}/api/canciones/${cancion.id}/stream`;
      this.audio.pause();
    }

    this.reproduciendoGlobal.next(true);
    this.emitirEvento({
      tipo: 'CAMBIAR_CANCION',
      cancionId: cancion.id,
      cola: this._slimCola(this._cola.getValue()),
    });
  }

  // ─── Play / Pausa ─────────────────────────────────────
  togglePlay() {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    let activos = this._dispositivosActivos.getValue();
    // Sin dispositivo seleccionado → usar este dispositivo al reanudar
    if (miDispositivo && activos.length === 0) {
      activos = [miDispositivo];
      this._dispositivosActivos.next(activos);
    }
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;
    const estaReproduciendo = this.reproduciendoGlobal.getValue();

    if (estaReproduciendo) {
      // Pausar: siempre pausa el audio local y emite PAUSE a todos
      this.audio.pause();
      this.reproduciendoGlobal.next(false);
      this.emitirEvento({ tipo: 'PAUSE' });
    } else {
      // Play: solo arranca el audio local si me toca sonar
      if (deboSonar) {
        this.audio.play().catch(() => {});
      }
      this.reproduciendoGlobal.next(true);
      this.emitirEvento({ tipo: 'PLAY' });
    }
  }

  // ─── Siguiente ────────────────────────────────────────
  siguiente(emitirWS = true) {
    const cola = this._cola.getValue();
    const actual = this._cancionActual.getValue();
    if (!cola.length) return;

    if (actual) {
      this._historial.next([...this._historial.getValue(), actual]);
    }
    const siguiente = cola[0];
    this._cancionActual.next(siguiente);
    this._cola.next(cola.slice(1));

    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this._dispositivosActivos.getValue();
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    this.audio.pause(); // ← para el audio anterior ANTES de cambiar src
    this.audio.src = `${this.BASE_URL}/api/canciones/${siguiente.id}/stream`;

    if (deboSonar) {
      this.audio.addEventListener(
        'canplay',
        () => {
          this.audio.play().catch(() => {});
        },
        { once: true },
      );
    }

    this.reproduciendoGlobal.next(true);
    if (emitirWS)
      this.emitirEvento({
        tipo: 'SIGUIENTE',
        cancionId: siguiente.id,
        cola: this._slimCola(this._cola.getValue()),
      });
  }

  // ─── Anterior ─────────────────────────────────────────
  anterior(emitirWS = true) {
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const historial = this._historial.getValue();
    if (!historial.length) {
      this.audio.currentTime = 0;
      return;
    }
    const ant = historial[historial.length - 1];
    const actual = this._cancionActual.getValue();
    if (actual) {
      this._cola.next([actual, ...this._cola.getValue()]);
    }
    this._historial.next(historial.slice(0, -1));
    this._cancionActual.next(ant);

    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this._dispositivosActivos.getValue();
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    this.audio.pause(); // ← para el audio anterior ANTES de cambiar src
    this.audio.src = `${this.BASE_URL}/api/canciones/${ant.id}/stream`;

    if (deboSonar) {
      this.audio.addEventListener(
        'canplay',
        () => {
          this.audio.play().catch(() => {});
        },
        { once: true },
      );
    }

    this.reproduciendoGlobal.next(true);
    if (emitirWS)
      this.emitirEvento({
        tipo: 'ANTERIOR',
        cancionId: ant.id,
        cola: this._slimCola(this._cola.getValue()),
      });
  }

  // ─── Buscar posición (seek) ───────────────────────────
  buscarPosicion(segundos: number) {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this._dispositivosActivos.getValue();
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    // Actualizar la barra visual inmediatamente en este dispositivo
    this.progresoGlobal.next(segundos);

    // Mover el audio solo si este dispositivo debe sonar
    if (deboSonar) {
      this.audio.currentTime = segundos;
    }

    // Emitir a todos los demás dispositivos
    this.emitirEvento({ tipo: 'SEEK', progreso: segundos });
  }

  // ─── Volumen ──────────────────────────────────────────
  setVolumen(valor: number) {
    const vol = Math.min(1, Math.max(0, valor));
    this.audio.volume = vol;
    this._volumen.next(vol);
  }

  getVolumen(): number {
    return this._volumen.getValue();
  }

  // Versión reducida de la cola para enviar por WS: solo los campos necesarios
  // para mostrar "Siguientes canciones". Excluye nombreArchivo (campo de servidor,
  // nunca usado por el frontend) para reducir el tamaño del mensaje y evitar
  // el cierre code=1009 (Message Too Big) con bibliotecas grandes.
  private _slimCola(cola: Cancion[]): Partial<Cancion>[] {
    return cola.map(({ id, titulo, artista, album, duracionSegundos, urlImagen }) => ({
      id, titulo, artista, album, duracionSegundos, urlImagen,
    }));
  }

  // Reconstruye una Cancion a partir de un objeto parcial recibido por WS.
  // Busca en catálogo local primero para evitar peticiones HTTP extra.
  private _resolverCancionDeEvento(parcial: any): Cancion | null {
    if (!parcial?.id) return null;
    const local =
      this._catalogo.find((c) => c.id === parcial.id) ??
      this._historial.getValue().find((c) => c.id === parcial.id) ??
      this._cola.getValue().find((c) => c.id === parcial.id) ??
      (this._cancionActual.getValue()?.id === parcial.id
        ? this._cancionActual.getValue()
        : null);
    if (local) return local;
    // El objeto parcial que llega por WS ya contiene los campos necesarios
    // para mostrar la cola (titulo, artista, etc.), úsalo directamente.
    if (parcial.titulo) return parcial as Cancion;
    return null;
  }

  /**
   * Emite un evento WS e incrementa el contador de eventos propios.
   * El contador se decrementa tras 500ms, margen suficiente para que
   * el eco del servidor llegue antes de que volvamos a escuchar.
   */
  private emitirEvento(evento: ReproductorEvent) {
    if (evento.dispositivosActivos === undefined) {
      evento.dispositivosActivos = this._dispositivosActivos.getValue();
    }
    evento.dispositivo = this.authService.obtenerUsuario()?.dispositivo;
    this.wsService.enviarEvento(evento);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.wsSyncSub?.unsubscribe();
    this.audio.pause();
  }
  toggleBucle() {
    const nuevo = !this.enBucle.getValue();
    this.enBucle.next(nuevo);
    this.audio.loop = nuevo;
  }

  actualizarDispositivosSonando(tipos: string[]) {
    const cancion = this._cancionActual.getValue();
    if (!cancion) return;

    const progreso = !this.audio.paused
      ? this.audio.currentTime
      : this.progresoRemotoActual;

    // ✅ Actualizar local primero, así el eco no pisa nada inesperado
    this._dispositivosActivos.next(tipos);

    // dispositivosActivos ya viene en el objeto → emitirEvento no lo sobreescribirá
    this.emitirEvento({
      tipo: 'TRANSFERIR',
      dispositivosActivos: tipos,
      cancionId: cancion.id,
      progreso,
    });
  }

  setDispositivosActivos(tipos: string[]) {
    this._dispositivosActivos.next(tipos);
  }

  pausarSiEsActivo() {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this._dispositivosActivos.getValue();
    const estaReproduciendo = this.reproduciendoGlobal.getValue();

    if (miDispositivo && activos.includes(miDispositivo) && estaReproduciendo) {
      this.audio.pause();
      this.reproduciendoGlobal.next(false);
      this.emitirEvento({ tipo: 'PAUSE' });
    }
  }
}
