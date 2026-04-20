import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonList, IonItem, IonLabel, IonIcon,
  IonButton, IonSpinner, IonAccordion,
  IonAccordionGroup, IonNote, IonAvatar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personCircle, musicalNotes, list,
         calendarOutline, logOutOutline, chevronDown } from 'ionicons/icons';
import { MusicaService, Playlist, Usuario } from '../../services/musica.service';
import { AuthService } from '../../services/auth.service';

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
    IonAccordionGroup, IonNote, IonAvatar
  ]
})
export class PerfilPage implements OnInit {

  usuario: Usuario | null = null;
  // Añade esta propiedad
  fechaRegistro: string | null = null;
  playlists: Playlist[] = [];
  cargando = true;

  constructor(
    private musicaService: MusicaService,
    private authService: AuthService,
    private router: Router
  ) {
    addIcons({ personCircle, musicalNotes, list,
               calendarOutline, logOutOutline, chevronDown });
  }

  ngOnInit() {
  const datos = this.authService.obtenerUsuario();
  if (datos) {
    this.usuario = datos;
    this.musicaService.getPlaylistsUsuario(datos.id).subscribe({
      next: (data) => {
        this.playlists = data;
        // Cogemos la fecha del primer resultado de playlists
        if (data.length > 0) {
          this.fechaRegistro = data[0].usuario.fechaRegistro;
        }
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }
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
    this.authService.cerrarSesion();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}