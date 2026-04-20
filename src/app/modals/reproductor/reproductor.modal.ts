import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ModalController, IonContent, IonHeader, IonToolbar,
  IonTitle, IonIcon, IonRange, IonList,
  IonItem, IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDown, playCircle, pauseCircle,
         playSkipBack, playSkipForward, musicalNotes } from 'ionicons/icons';
import { ReproductorService } from '../../services/reproductor.service';
import { Cancion } from '../../services/musica.service';

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
export class ReproductorModal implements OnInit {

  cancion: Cancion | null = null;
  cola: Cancion[] = [];
  reproduciendo = false;
  progreso = 0;
  duracion = 0;
  arrastrando = false;

  constructor(
    private modalCtrl: ModalController,
    public reproductorService: ReproductorService
  ) {
    addIcons({ chevronDown, playCircle, pauseCircle,
               playSkipBack, playSkipForward, musicalNotes });
  }

  ngOnInit() {
    this.reproductorService.cancionActual$.subscribe(c => this.cancion = c);
    this.reproductorService.cola$.subscribe(c => this.cola = c);
    this.reproductorService.reproduciendo$.subscribe(r => this.reproduciendo = r);
    this.reproductorService.progreso$.subscribe(p => {
      if (!this.arrastrando) this.progreso = p;
    });
    this.reproductorService.duracion$.subscribe(d => this.duracion = d);
  }

  formatearTiempo(segundos: number): string {
    if (!segundos || isNaN(segundos)) return '0:00';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onRangeStart() { this.arrastrando = true; }
  onRangeChange(event: any) { this.progreso = event.detail.value; }
  onRangeEnd(event: any) {
    this.reproductorService.buscarPosicion(event.detail.value);
    this.arrastrando = false;
  }

  cerrar() { this.modalCtrl.dismiss(); }
}