import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Cancion, MusicaService } from './musica.service';
import { WebsocketService, ReproductorEvent } from './websocket.service';
import { AuthService } from './auth.service';
import { filter, take } from 'rxjs/operators';
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
  private dispositivosActivos = new BehaviorSubject<string[]>([]);
  private reproduciendoGlobal = new BehaviorSubject<boolean>(false);
  private progresoGlobal = new BehaviorSubject<number>(0);
  private progresoRemotoActual = 0;

  dispositivosActivos$ = this.dispositivosActivos.asObservable();
  cancionActual$ = this._cancionActual.asObservable();
  cola$ = this._cola.asObservable();
  reproduciendo$ = this.reproduciendoGlobal.asObservable();
  progreso$ = this.progresoGlobal.asObservable();
  duracion$ = this._duracion.asObservable();
  volumen$ = this._volumen.asObservable();

  private subs = new Subscription();

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
      if (
        seg % 5 === 0 &&
        seg !== this._ultimoSeekEmitido &&
        this._ignorarContador === 0
      ) {
        this._ultimoSeekEmitido = seg;
        this.emitirEvento({ tipo: 'SEEK', progreso: this.audio.currentTime });
      }
    });

    this.audio.addEventListener('durationchange', () =>
      this._duracion.next(this.audio.duration || 0),
    );
    this.audio.addEventListener('ended', () => this.siguiente(false));
    this.audio.addEventListener('play', () => this._reproduciendo.next(true));
    this.audio.addEventListener('pause', () => this._reproduciendo.next(false));

    // ── Escuchar eventos WS de otros dispositivos ─────────
    this.subs.add(
      this.wsService.evento$.subscribe((ev) => this.procesarEventoRemoto(ev)),
    );
  }

  // ─── Conectar WebSocket (llamar tras login) ───────────
  iniciarWS() {
    const token = this.authService.obtenerToken();
    const usuario = this.authService.obtenerUsuario();
    if (token && usuario?.email) {
      this.authService.reactivarDispositivo().subscribe();
      this.wsService.conectar(token, usuario.email);
      this.wsService.conectar(token, usuario.email);
      // ── Sincronizar estado al conectar ────────────────
      // Cuando el WS está listo, pedimos el último estado
      // para que el dispositivo nuevo se ponga al día
      this.wsService.conectado$
        .pipe(
          filter((conectado) => conectado),
          take(1), // solo la primera vez que conecta
        )
        .subscribe(() => {
          this.sincronizarEstadoInicial();
        });
    }
  }

  private sincronizarEstadoInicial() {
    const headers = {
      Authorization: `Bearer ${this.authService.obtenerToken()}`,
    };

    fetch(`${this.BASE_URL}/api/reproductor/estado`, { headers })
      .then((res) => {
        if (res.status === 204) return null;
        return res.json();
      })
      .then((estado: ReproductorEvent | null) => {
        if (!estado?.cancionId) return; // sin estado o sin canción, nada que hacer
        console.log('[Reproductor] Estado inicial recibido:', estado);

        // 1. Cargar el audio y los metadatos de la canción
        // Llamamos directamente sin pasar por procesarEventoRemoto
        // para evitar el guard _ignorarContador y el tipo incorrecto
        this.audio.src = `${this.BASE_URL}/api/canciones/${estado.cancionId}/stream`;

        // 2. Obtener metadatos de la canción
        this.musicaService.getCancionPorId(estado.cancionId).subscribe({
          next: (c: Cancion) => this._cancionActual.next(c),
          error: (err: any) =>
            console.error('[Reproductor] Error obteniendo canción:', err),
        });

        // 3. Aplicar progreso y estado play/pause cuando el audio esté listo
        this.audio.addEventListener(
          'loadedmetadata',
          () => {
            if (estado.progreso) {
              this.audio.currentTime = estado.progreso;
            }
            // Solo autoplay si el último estado era PLAY o SEEK (no PAUSE)
            if (estado.tipo !== 'PAUSE') {
              this.audio.play().catch(() => {});
            }
          },
          { once: true },
        );
      })
      .catch((err) =>
        console.error('[Reproductor] Error obteniendo estado inicial:', err),
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
    this.wsService.desconectar();
    this.progresoGlobal.next(0);
  }

  // ─── Procesar evento recibido de otro dispositivo ─────
  private procesarEventoRemoto(ev: ReproductorEvent) {
    // TRANSFERIR siempre pasa, los demás consumen su eco
    if (ev.tipo !== 'TRANSFERIR') {
      if (this._ignorarContador > 0) {
        this._ignorarContador--;
        return;
      }
    }

    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos: string[] =
      ev.dispositivosActivos ?? this.dispositivosActivos.getValue();
    const deboSonar = miDispositivo ? activos.includes(miDispositivo) : true;

    switch (ev.tipo) {
      case 'PLAY':
        this.reproduciendoGlobal.next(true); // ← actualiza el botón en todos los dispositivos
        if (deboSonar) this.audio.play().catch(() => {});
        break;

      case 'PAUSE':
        this.reproduciendoGlobal.next(false); // ← actualiza el botón en todos los dispositivos
        this.audio.pause();
        break;

      case 'SIGUIENTE':
        this.siguiente(false);
        break;

      case 'ANTERIOR':
        this.anterior(false);
        break;

      case 'CAMBIAR_CANCION':
        this.progresoRemotoActual = 0;
        this.reproduciendoGlobal.next(true);
        if (ev.cancionId) {
          this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
          // Solo hacer play si me toca sonar
          if (deboSonar) {
            this.audio.play().catch(() => {});
          }
          // Actualizar metadatos siempre, independientemente de si suena
          const todas = [
            ...this._historial.getValue(),
            ...(this._cancionActual.getValue()
              ? [this._cancionActual.getValue()!]
              : []),
            ...this._cola.getValue(),
          ];
          const local = todas.find((c) => c.id === ev.cancionId);
          if (local) {
            this._cancionActual.next(local);
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
  this.dispositivosActivos.next(activos);

  if (miDispositivo && activos.includes(miDispositivo)) {
    const urlDestino = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
    const yaEstaEstaCancion = this.audio.src.includes(`canciones/${ev.cancionId}`);
    const yaEstabaSonando = !this.audio.paused; // ← clave: ¿ya estaba reproduciendo?

    if (yaEstaEstaCancion) {
      // Si ya tenía esta canción cargada...
      if (yaEstabaSonando) {
        // Ya estaba sonando → NO hacer seek, simplemente continuar
        // Solo asegurarse de que sigue en play
        this.audio.play().catch(() => {});
      } else {
        // Estaba pausado (dispositivo se reactiva) → sí hacer seek al progreso remoto
        if (ev.progreso !== undefined) this.audio.currentTime = ev.progreso;
        this.audio.play().catch(() => {});
      }
    } else {
      // Canción diferente → cargar desde el progreso indicado
      this.audio.src = urlDestino;
      this.audio.addEventListener('loadedmetadata', () => {
        if (ev.progreso !== undefined) this.audio.currentTime = ev.progreso;
        this.audio.play().catch(() => {});
      }, { once: true });
    }

    if (ev.cancionId) {
      this.musicaService.getCancionPorId(ev.cancionId).subscribe({
        next: (c: Cancion) => this._cancionActual.next(c),
      });
    }

  } else {
    // No me toca sonar
    this.audio.pause();
    if (ev.cancionId) {
      this.musicaService.getCancionPorId(ev.cancionId).subscribe({
        next: (c: Cancion) => this._cancionActual.next(c),
      });
    }
    if (ev.progreso !== undefined) {
      this.audio.currentTime = ev.progreso;
      this.progresoRemotoActual = ev.progreso;
    }
  }
  break;
    }
  }

  // ─── Reproducir canción ───────────────────────────────
  reproducir(cancion: Cancion, todasLasCanciones: Cancion[] = []) {
    if (!cancion) return;
    const indice = todasLasCanciones.findIndex((c) => c.id === cancion.id);
    this._cancionActual.next(cancion);
    this._cola.next(indice >= 0 ? todasLasCanciones.slice(indice + 1) : []);
    this._historial.next(indice > 0 ? todasLasCanciones.slice(0, indice) : []);

    this.audio.src = `${this.BASE_URL}/api/canciones/${cancion.id}/stream`;
    this.audio.play().catch(() => {});

    this.emitirEvento({ tipo: 'CAMBIAR_CANCION', cancionId: cancion.id });
  }

  // ─── Play / Pausa ─────────────────────────────────────
  togglePlay() {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this.dispositivosActivos.getValue();
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
    this.audio.src = `${this.BASE_URL}/api/canciones/${siguiente.id}/stream`;
    this.audio.play().catch(() => {});

    if (emitirWS) this.emitirEvento({ tipo: 'SIGUIENTE' });
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
    this.audio.src = `${this.BASE_URL}/api/canciones/${ant.id}/stream`;
    this.audio.play().catch(() => {});

    if (emitirWS) this.emitirEvento({ tipo: 'ANTERIOR' });
  }

  // ─── Buscar posición (seek) ───────────────────────────
  buscarPosicion(segundos: number) {
    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    const activos = this.dispositivosActivos.getValue();
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

  /**
   * Emite un evento WS e incrementa el contador de eventos propios.
   * El contador se decrementa tras 500ms, margen suficiente para que
   * el eco del servidor llegue antes de que volvamos a escuchar.
   */
  private emitirEvento(evento: ReproductorEvent) {
    evento.dispositivosActivos = this.dispositivosActivos.getValue();
    evento.dispositivo = this.authService.obtenerUsuario()?.dispositivo;
    this._ignorarContador++;
    this.wsService.enviarEvento(evento);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.audio.pause();
  }
  toggleBucle() {
    const nuevo = !this.enBucle.getValue();
    this.enBucle.next(nuevo);
    this.audio.loop = nuevo;
  }

  actualizarDispositivosSonando(seleccionados: string[]) {
    const cancion = this._cancionActual.getValue();
    if (!cancion) return;

    const miDispositivo = this.authService.obtenerUsuario()?.dispositivo;
    this.dispositivosActivos.next(seleccionados);

    this.wsService.enviarEvento({
      tipo: 'TRANSFERIR',
      dispositivosActivos: seleccionados,
      cancionId: cancion.id,
      progreso: this.progresoRemotoActual,
    });

    // Si yo NO estoy en la selección, pausar localmente
    if (miDispositivo && !seleccionados.includes(miDispositivo)) {
      this.audio.pause();
    }
  }
}
