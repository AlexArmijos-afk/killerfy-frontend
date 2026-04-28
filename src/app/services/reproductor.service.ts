import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Cancion } from './musica.service';

@Injectable({ providedIn: 'root' })
export class ReproductorService {

  private audio = new Audio();
  private readonly BASE_URL = 'http://localhost:8080';

  private _cancionActual = new BehaviorSubject<Cancion | null>(null);
  private _cola = new BehaviorSubject<Cancion[]>([]);
  private _historial = new BehaviorSubject<Cancion[]>([]);
  private _reproduciendo = new BehaviorSubject<boolean>(false);
  private _progreso = new BehaviorSubject<number>(0);
  private _duracion = new BehaviorSubject<number>(0);
  private _volumen = new BehaviorSubject<number>(1); // 0.0 a 1.0

  cancionActual$ = this._cancionActual.asObservable();
  cola$ = this._cola.asObservable();
  reproduciendo$ = this._reproduciendo.asObservable();
  progreso$ = this._progreso.asObservable();
  duracion$ = this._duracion.asObservable();
  volumen$ = this._volumen.asObservable();

  constructor() {
    this.audio.addEventListener('timeupdate', () => this._progreso.next(this.audio.currentTime));
    this.audio.addEventListener('durationchange', () => this._duracion.next(this.audio.duration || 0));
    this.audio.addEventListener('ended', () => this.siguiente());
    this.audio.addEventListener('play', () => this._reproduciendo.next(true));
    this.audio.addEventListener('pause', () => this._reproduciendo.next(false));
  }

  reproducir(cancion: Cancion, todasLasCanciones: Cancion[] = []) {
    const indice = todasLasCanciones.findIndex(c => c.id === cancion.id);
    this._cancionActual.next(cancion);
    this._cola.next(indice >= 0 ? todasLasCanciones.slice(indice + 1) : []);
    this._historial.next(indice > 0 ? todasLasCanciones.slice(0, indice) : []);
    this.audio.src = `${this.BASE_URL}${cancion.urlAudio}`;
    this.audio.play().catch(() => {});
  }

  togglePlay() {
    this.audio.paused ? this.audio.play().catch(() => {}) : this.audio.pause();
  }

  siguiente() {
    const cola = this._cola.getValue();
    const actual = this._cancionActual.getValue();
    if (!cola.length) return;
    if (actual) this._historial.next([...this._historial.getValue(), actual]);
    this._cancionActual.next(cola[0]);
    this._cola.next(cola.slice(1));
    this.audio.src = `${this.BASE_URL}${cola[0].urlAudio}`;
    this.audio.play().catch(() => {});
  }

  anterior() {
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    const historial = this._historial.getValue();
    if (!historial.length) { this.audio.currentTime = 0; return; }
    const anterior = historial[historial.length - 1];
    const actual = this._cancionActual.getValue();
    if (actual) this._cola.next([actual, ...this._cola.getValue()]);
    this._historial.next(historial.slice(0, -1));
    this._cancionActual.next(anterior);
    this.audio.src = `${this.BASE_URL}${anterior.urlAudio}`;
    this.audio.play().catch(() => {});
  }

  buscarPosicion(segundos: number) {
    this.audio.currentTime = segundos;
  }

  // ─────────────────────────────────────────────────────
  // Control de volumen (0.0 → mute, 1.0 → máximo)
  // ─────────────────────────────────────────────────────
  setVolumen(valor: number) {
    const vol = Math.min(1, Math.max(0, valor)); // clamp entre 0 y 1
    this.audio.volume = vol;
    this._volumen.next(vol);
  }

  getVolumen(): number {
    return this._volumen.getValue();
  }
}