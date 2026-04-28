import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonList, IonItem, IonLabel, IonIcon,
  IonButton, IonSpinner, IonAccordion,
  IonAccordionGroup, IonNote
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personCircle, musicalNotes, list,
         calendarOutline, logOutOutline, chevronDown } from 'ionicons/icons';
import { MusicaService, Playlist } from '../../services/musica.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonList, IonItem, IonLabel, IonIcon,
    IonButton, IonSpinner, IonAccordion,
    IonAccordionGroup, IonNote
  ]
})
export class PerfilPage implements OnInit, OnDestroy {

  perfil: any = null;
  playlists: Playlist[] = [];
  cargando = true;
  private subs = new Subscription();

  constructor(
    private musicaService: MusicaService,
    private authService: AuthService,
    private router: Router
  ) {
    addIcons({ personCircle, musicalNotes, list,
               calendarOutline, logOutOutline, chevronDown });
  }

  ngOnInit() {
    this.subs.add(
      this.authService.getPerfil().subscribe({
        next: (data) => { this.perfil = data; this.cargarPlaylists(); },
        error: () => { this.cargando = false; }
      })
    );
  }

  private cargarPlaylists() {
    this.subs.add(
      this.musicaService.getMisPlaylists().subscribe({
        next: (data) => { this.playlists = data; this.cargando = false; },
        error: () => { this.cargando = false; }
      })
    );
  }

  formatearFecha(fecha: string): string {
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  formatearDuracion(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  cerrarSesion() {
    this.authService.cerrarSesion().subscribe({
      next: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
  }

  ngOnDestroy() { this.subs.unsubscribe(); }
}