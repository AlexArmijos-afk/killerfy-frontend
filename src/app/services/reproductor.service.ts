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
  private _cola          = new BehaviorSubject<Cancion[]>([]);
  private _historial     = new BehaviorSubject<Cancion[]>([]);
  private _reproduciendo = new BehaviorSubject<boolean>(false);
  private _progreso      = new BehaviorSubject<number>(0);
  private _duracion      = new BehaviorSubject<number>(0);
  private _volumen       = new BehaviorSubject<number>(1);

  cancionActual$ = this._cancionActual.asObservable();
  cola$          = this._cola.asObservable();
  reproduciendo$ = this._reproduciendo.asObservable();
  progreso$      = this._progreso.asObservable();
  duracion$      = this._duracion.asObservable();
  volumen$       = this._volumen.asObservable();

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

  constructor(
    private wsService:    WebsocketService,
    private authService:  AuthService,
    private musicaService: MusicaService
  ) {
    // ── Eventos del elemento Audio ────────────────────────
    this.audio.addEventListener('timeupdate', () => {
      this._progreso.next(this.audio.currentTime);

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
      this._duracion.next(this.audio.duration || 0));
    this.audio.addEventListener('ended', () =>
      this.siguiente(false));
    this.audio.addEventListener('play', () =>
      this._reproduciendo.next(true));
    this.audio.addEventListener('pause', () =>
      this._reproduciendo.next(false));

    // ── Escuchar eventos WS de otros dispositivos ─────────
    this.subs.add(
      this.wsService.evento$.subscribe(ev => this.procesarEventoRemoto(ev))
    );
  }

  // ─── Conectar WebSocket (llamar tras login) ───────────
  iniciarWS() {
    const token   = this.authService.obtenerToken();
    const usuario = this.authService.obtenerUsuario();
    if (token && usuario?.email) {
      this.wsService.conectar(token, usuario.email);
      // ── Sincronizar estado al conectar ────────────────
    // Cuando el WS está listo, pedimos el último estado
    // para que el dispositivo nuevo se ponga al día
    this.wsService.conectado$.pipe(
      filter(conectado => conectado),
      take(1)                         // solo la primera vez que conecta
    ).subscribe(() => {
      this.sincronizarEstadoInicial();
    });
    }
  }

  private sincronizarEstadoInicial() {
  const headers = { Authorization: `Bearer ${this.authService.obtenerToken()}` };

  fetch(`${this.BASE_URL}/api/reproductor/estado`, { headers })
    .then(res => {
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
        error: (err: any) => console.error('[Reproductor] Error obteniendo canción:', err)
      });

      // 3. Aplicar progreso y estado play/pause cuando el audio esté listo
      this.audio.addEventListener('loadedmetadata', () => {
        if (estado.progreso) {
          this.audio.currentTime = estado.progreso;
        }
        // Solo autoplay si el último estado era PLAY o SEEK (no PAUSE)
        if (estado.tipo !== 'PAUSE') {
          this.audio.play().catch(() => {});
        }
      }, { once: true });
    })
    .catch(err => console.error('[Reproductor] Error obteniendo estado inicial:', err));
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
}

  // ─── Procesar evento recibido de otro dispositivo ─────
  private procesarEventoRemoto(ev: ReproductorEvent) {
    // Si el contador > 0 el evento lo generamos nosotros, ignorarlo
    if (this._ignorarContador > 0) return;

    console.log('[Reproductor] Evento remoto recibido:', ev.tipo, ev);

    switch (ev.tipo) {
      case 'PLAY':
        this.audio.play().catch(() => {});
        break;

      case 'PAUSE':
        this.audio.pause();
        break;

      case 'SIGUIENTE':
        this.siguiente(false);
        break;

      case 'ANTERIOR':
        this.anterior(false);
        break;

      /**
       * FIX PRINCIPAL – Sincronización Android ↔ Web
       * ─────────────────────────────────────────────
       * Antes: sólo se actualizaba _cancionActual si la canción ya existía
       *        en el estado local (cola + historial). Si el dispositivo WEB
       *        no tenía la lista cargada (caso habitual al cambiar desde
       *        Android), _cancionActual quedaba sin actualizar y el
       *        reproductor mostraba la canción anterior o null.
       *
       * Ahora: si no encontramos la canción en el estado local, hacemos
       *        un GET /api/canciones/{id} para obtener sus metadatos y
       *        actualizamos _cancionActual con la respuesta.
       *        El audio ya empieza a reproducirse de inmediato (no esperamos
       *        a la HTTP), así que no hay retardo perceptible.
       */
      case 'CAMBIAR_CANCION':
        if (ev.cancionId) {
          // 1. Iniciar stream de audio inmediatamente
          this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`;
          this.audio.play().catch(() => {});

          // 2. Buscar metadatos en estado local primero (sin coste de red)
          const todas = [
            ...this._historial.getValue(),
            ...(this._cancionActual.getValue()
              ? [this._cancionActual.getValue()!]
              : []),
            ...this._cola.getValue()
          ];
          const cancionLocal = todas.find(c => c.id === ev.cancionId);

          if (cancionLocal) {
            this._cancionActual.next(cancionLocal);
          } else {
            // 3. Fallback: pedir metadatos al backend
            //    Cubre el caso en que Android cambia de canción y el
            //    dispositivo WEB no tiene esa canción en su estado local.
            console.log('[Reproductor] Canción no encontrada localmente, obteniendo del servidor...');
            this.musicaService.getCancionPorId(ev.cancionId).subscribe({
              next: (c: Cancion) => {
                this._cancionActual.next(c);
                console.log('[Reproductor] Canción sincronizada desde servidor:', c.titulo);
              },
              error: (err: any) =>
                console.error('[Reproductor] Error obteniendo canción:', err)
            });
          }
        }
        break;

      case 'SEEK':
        if (ev.progreso !== undefined) {
          this.audio.currentTime = ev.progreso;
        }
        break;
    }
  }

  // ─── Reproducir canción ───────────────────────────────
  reproducir(cancion: Cancion, todasLasCanciones: Cancion[] = []) {
    if (!cancion) return;
    const indice = todasLasCanciones.findIndex(c => c.id === cancion.id);
    this._cancionActual.next(cancion);
    this._cola.next(indice >= 0 ? todasLasCanciones.slice(indice + 1) : []);
    this._historial.next(indice > 0 ? todasLasCanciones.slice(0, indice) : []);

    this.audio.src = `${this.BASE_URL}/api/canciones/${cancion.id}/stream`;
    this.audio.play().catch(() => {});

    this.emitirEvento({ tipo: 'CAMBIAR_CANCION', cancionId: cancion.id });
  }

  // ─── Play / Pausa ─────────────────────────────────────
  togglePlay() {
    if (this.audio.paused) {
      this.audio.play().catch(() => {});
      this.emitirEvento({ tipo: 'PLAY' });
    } else {
      this.audio.pause();
      this.emitirEvento({ tipo: 'PAUSE' });
    }
  }

  // ─── Siguiente ────────────────────────────────────────
  siguiente(emitirWS = true) {
    const cola   = this._cola.getValue();
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
    const ant    = historial[historial.length - 1];
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
    this.audio.currentTime = segundos;
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
    this._ignorarContador++;
    this.wsService.enviarEvento(evento);
    setTimeout(() => this._ignorarContador--, 500);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.audio.pause();
  }
}