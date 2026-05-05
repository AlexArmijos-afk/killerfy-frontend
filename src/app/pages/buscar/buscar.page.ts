import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonList, IonItem, IonIcon,
  IonNote, IonSpinner, IonLabel, IonButton,
  AlertController, ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotes, addCircleOutline, playCircle } from 'ionicons/icons';
import { Subject, forkJoin, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MusicaService, Cancion, Playlist } from '../../services/musica.service';
import { ReproductorService } from '../../services/reproductor.service';

@Component({
  selector: 'app-buscar',
  templateUrl: './buscar.page.html',
  styleUrls: ['./buscar.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonList, IonItem, IonIcon,
    IonNote, IonSpinner, IonLabel, IonButton
  ]
})
export class BuscarPage implements OnInit {

  terminoBusqueda = '';
  resultados: Cancion[] = [];
  cargando = false;
  buscado = false;
  playlists: Playlist[] = [];

  private busqueda$ = new Subject<string>();

  constructor(
    private musicaService: MusicaService,
    private reproductorService: ReproductorService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {
    addIcons({ musicalNotes, addCircleOutline, playCircle });
  }

  ngOnInit() {
    // Cargar playlists del usuario al entrar
    this.musicaService.getMisPlaylists().subscribe({
      next: (data) => this.playlists = data,
      error: () => {}
    });

    this.busqueda$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(termino => {
        if (!termino.trim()) {
          this.resultados = [];
          this.buscado = false;
          this.cargando = false;
          return of([[], []]);
        }
        this.cargando = true;
        return forkJoin([
          this.musicaService.buscarPorTitulo(termino),
          this.musicaService.buscarPorArtista(termino)
        ]);
      })
    ).subscribe({
      next: (data: any) => {
        if (Array.isArray(data) && data.length === 2) {
          const combinados = [...data[0], ...data[1]];
          this.resultados = combinados.filter(
            (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
          );
          this.buscado = true;
        }
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
        this.buscado = true;
      }
    });
  }

  onInput(event: any) {
    this.terminoBusqueda = event.detail.value;
    this.busqueda$.next(this.terminoBusqueda);
  }

  reproducirCancion(cancion: Cancion) {
    this.reproductorService.reproducir(cancion, this.resultados);
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