import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ModalController, IonContent, IonHeader, IonToolbar,
  IonTitle, IonIcon, IonRange, IonList,
  IonItem, IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDown, playCircle, pauseCircle,
         playSkipBack, playSkipForward, musicalNotes,
         volumeLow, volumeHigh } from 'ionicons/icons';
import { ReproductorService } from '../../services/reproductor.service';
import { Cancion } from '../../services/musica.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-reproductor-modal',
  templateUrl: '././reproductor.modal.html',
  styleUrls: ['./reproductor.modal.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonIcon, IonRange, IonList, IonItem, IonLabel
  ]
})
export class ReproductorModal implements OnInit, OnDestroy {

  cancion: Cancion | null = null;
  cola: Cancion[] = [];
  reproduciendo = false;
  progreso = 0;
  duracion = 0;
  volumen = 1;       // 0.0 → 1.0
  arrastrando = false;
  private subs = new Subscription();

  constructor(
    private modalCtrl: ModalController,
    public reproductorService: ReproductorService
  ) {
    addIcons({ chevronDown, playCircle, pauseCircle,
               playSkipBack, playSkipForward, musicalNotes,
               volumeLow, volumeHigh });
  }

  ngOnInit() {
    this.subs.add(this.reproductorService.cancionActual$.subscribe(c => this.cancion = c));
    this.subs.add(this.reproductorService.cola$.subscribe(c => this.cola = c));
    this.subs.add(this.reproductorService.reproduciendo$.subscribe(r => this.reproduciendo = r));
    this.subs.add(this.reproductorService.duracion$.subscribe(d => this.duracion = d));
    this.subs.add(this.reproductorService.volumen$.subscribe(v => this.volumen = v));
    this.subs.add(this.reproductorService.progreso$.subscribe(p => {
      if (!this.arrastrando) this.progreso = p;
    }));
  }

  formatearTiempo(segundos: number): string {
    if (!segundos || isNaN(segundos)) return '0:00';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Barra de progreso ───
  onRangeStart()           { this.arrastrando = true; }
  onRangeChange(e: any)    { this.progreso = e.detail.value; }
  onRangeEnd(e: any)       { this.reproductorService.buscarPosicion(e.detail.value); this.arrastrando = false; }

  // ─── Control de volumen ───
  onVolumenChange(e: any)  { this.reproductorService.setVolumen(e.detail.value); }

  cerrar() { this.modalCtrl.dismiss(); }

  ngOnDestroy() { this.subs.unsubscribe(); }
}