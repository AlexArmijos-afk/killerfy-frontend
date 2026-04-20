import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { playCircle, pauseCircle } from 'ionicons/icons';
import { ReproductorService } from '../../services/reproductor.service';
import { Cancion } from '../../services/musica.service';
import { ReproductorModal } from '../../modals/reproductor/reproductor.modal';

@Component({
  selector: 'app-mini-player',
  templateUrl: '././mini-player.component.html',
  styleUrls: ['./mini-player.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class MiniPlayerComponent implements OnInit {

  cancion: Cancion | null = null;
  reproduciendo = false;
  progreso = 0;
  duracion = 0;

  constructor(
    private reproductorService: ReproductorService,
    private modalCtrl: ModalController
  ) {
    addIcons({ playCircle, pauseCircle });
  }

  ngOnInit() {
    this.reproductorService.cancionActual$.subscribe(c => this.cancion = c);
    this.reproductorService.reproduciendo$.subscribe(r => this.reproduciendo = r);
    this.reproductorService.progreso$.subscribe(p => this.progreso = p);
    this.reproductorService.duracion$.subscribe(d => this.duracion = d);
  }

  get porcentaje(): number {
    return this.duracion > 0 ? (this.progreso / this.duracion) * 100 : 0;
  }

  togglePlay(event: Event) {
    event.stopPropagation();
    this.reproductorService.togglePlay();
  }

  async abrirReproductor() {
    const modal = await this.modalCtrl.create({
      component: ReproductorModal,
      initialBreakpoint: 1,
      breakpoints: [0, 1]
    });
    await modal.present();
  }
}