import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonThumbnail, IonNote,
  IonIcon, IonSpinner, IonButton,
  AlertController, ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotes, personCircle, albums, addCircleOutline } from 'ionicons/icons';
import { MusicaService, Cancion, Playlist } from '../../services/musica.service';
import { ReproductorService } from '../../services/reproductor.service';

interface GrupoArtista { nombre: string; canciones: Cancion[]; }
interface GrupoAlbum   { nombre: string; artista: string; canciones: Cancion[]; }

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSegment, IonSegmentButton, IonLabel,
    IonList, IonItem, IonThumbnail, IonNote,
    IonIcon, IonSpinner, IonButton
  ]
})
export class InicioPage implements OnInit {

  segmentoActivo = 'todas';
  canciones: Cancion[] = [];
  artistas: GrupoArtista[] = [];
  albumes: GrupoAlbum[] = [];
  playlists: Playlist[] = [];
  cargando = true;

  constructor(
    private musicaService: MusicaService,
    private reproductorService: ReproductorService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {
    addIcons({ musicalNotes, personCircle, albums, addCircleOutline });
  }

  ngOnInit() {
    this.musicaService.getCanciones().subscribe({
      next: (data) => {
        this.canciones = data;
        this.agruparPorArtista();
        this.agruparPorAlbum();
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });

    this.musicaService.getMisPlaylists().subscribe({
      next: (data) => this.playlists = data,
      error: () => {}
    });
  }

  agruparPorArtista() {
    const mapa = new Map<string, Cancion[]>();
    this.canciones.forEach(c => {
      if (!mapa.has(c.artista)) mapa.set(c.artista, []);
      mapa.get(c.artista)!.push(c);
    });
    this.artistas = Array.from(mapa.entries()).map(([nombre, canciones]) => ({ nombre, canciones }));
  }

  agruparPorAlbum() {
    const mapa = new Map<string, GrupoAlbum>();
    this.canciones.forEach(c => {
      if (!mapa.has(c.album)) mapa.set(c.album, { nombre: c.album, artista: c.artista, canciones: [] });
      mapa.get(c.album)!.canciones.push(c);
    });
    this.albumes = Array.from(mapa.values());
  }

  cambiarSegmento(event: any) {
    this.segmentoActivo = event.detail.value;
  }

  reproducirCancion(cancion: Cancion) {
    this.reproductorService.reproducir(cancion, this.canciones);
  }

  reproducirArtista(artista: GrupoArtista) {
    this.reproductorService.reproducir(artista.canciones[0], artista.canciones);
  }

  reproducirAlbum(album: GrupoAlbum) {
    this.reproductorService.reproducir(album.canciones[0], album.canciones);
  }

  async anadirAPlaylist(cancion: Cancion, event: Event) {
    event.stopPropagation();

    if (this.playlists.length === 0) {
      const toast = await this.toastCtrl.create({
        message: 'No tienes playlists. Crea una desde tu perfil.',
        color: 'warning',
        duration: 2500,
        position: 'bottom'
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Añadir a playlist',
      message: `"${cancion.titulo}"`,
      inputs: this.playlists.map(pl => ({
        type: 'radio' as const,
        label: pl.nombre,
        value: pl.id
      })),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Añadir',
          handler: (playlistId) => {
            if (!playlistId) return false;
            this.musicaService.añadirCancionAPlaylist(playlistId, cancion.id).subscribe({
              next: async () => {
                const toast = await this.toastCtrl.create({
                  message: 'Canción añadida a la playlist',
                  color: 'success',
                  duration: 2000,
                  position: 'bottom'
                });
                await toast.present();
              },
              error: async () => {
                const toast = await this.toastCtrl.create({
                  message: 'Error al añadir la canción',
                  color: 'danger',
                  duration: 2000,
                  position: 'bottom'
                });
                await toast.present();
              }
            });
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  formatearDuracion(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}