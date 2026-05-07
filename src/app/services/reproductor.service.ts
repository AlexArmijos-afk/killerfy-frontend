import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Cancion } from './musica.service';
import { WebsocketService, ReproductorEvent } from './websocket.service';
import { AuthService } from './auth.service';
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
  // Flag para ignorar eventos WS que el propio dispositivo generó
  private ignorarEventoRemoto = false;

  constructor(
    private wsService: WebsocketService,
    private authService: AuthService
  ) {
    // Eventos del elemento Audio
    this.audio.addEventListener('timeupdate', () => {
  this._progreso.next(this.audio.currentTime);
  // Emitir posición cada 5 segundos
  if (Math.floor(this.audio.currentTime) % 5 === 0 && !this.ignorarEventoRemoto) {
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

    // Escuchar eventos WS entrantes de otros dispositivos
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
    }
  }

  // ─── Procesar evento recibido de otro dispositivo ─────
  private procesarEventoRemoto(ev: ReproductorEvent) {
  if (this.ignorarEventoRemoto) return;
  console.log('[Reproductor] Evento remoto recibido:', ev.tipo);

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
    case 'CAMBIAR_CANCION':
  if (ev.cancionId) {
    this.audio.src = `${this.BASE_URL}/api/canciones/${ev.cancionId}/stream`; // ← BASE_URL
    this.audio.play().catch(() => {});
    const todas = [
      ...this._historial.getValue(),
      ...(this._cancionActual.getValue() ? [this._cancionActual.getValue()!] : []),
      ...this._cola.getValue()
    ];
    const cancion = todas.find(c => c.id === ev.cancionId);
    if (cancion) this._cancionActual.next(cancion);
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

  // ─── Siguiente (emitirWS = false cuando viene de evento remoto) ──
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
    const ant    = historial[historial.length - 1];
    if (!ant) return;
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

  // ─── Emitir evento WS marcando flag para no procesarlo de vuelta ──
  private emitirEvento(evento: ReproductorEvent) {
    this.ignorarEventoRemoto = true;
    this.wsService.enviarEvento(evento);
    // Tras 200ms volvemos a escuchar eventos remotos
    setTimeout(() => this.ignorarEventoRemoto = false, 200);
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.audio.pause();
  }
}