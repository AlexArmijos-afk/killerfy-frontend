import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ModalController,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonIcon,
  IonRange,
  IonList,
  IonItem,
  IonLabel,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronDown,
  playCircle,
  pauseCircle,
  playSkipBack,
  playSkipForward,
  musicalNotes,
  volumeLow,
  volumeHigh,
  phonePortraitOutline,
  desktopOutline,
  globeOutline,
  checkmarkCircle,
  repeat,
} from 'ionicons/icons';
import { ReproductorService } from '../../services/reproductor.service';
import { MusicaService, Cancion } from '../../services/musica.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { WebsocketService } from 'src/app/services/websocket.service';

@Component({
  selector: 'app-reproductor-modal',
  templateUrl: './reproductor.modal.html',
  styleUrls: ['./reproductor.modal.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    IonRange,
    IonList,
    IonItem,
    IonLabel,
  ],
})
export class ReproductorModal implements OnInit, OnDestroy {
  cancion: Cancion | null = null;
  cola: Cancion[] = [];
  reproduciendo = false;
  progreso = 0;
  duracion = 0;
  volumen = 1;
  arrastrando = false;
  enBucle = false;
  dispositivos: any[] = [];
  dispositivosSeleccionados: string[] = [];
  private subs = new Subscription();

  constructor(
    private modalCtrl: ModalController,
    public reproductorService: ReproductorService,
    private alertCtrl: AlertController,
    private musicaService: MusicaService,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private wsService: WebsocketService,
  ) {}

  ngOnInit() {
    addIcons({
      chevronDown,
      playCircle,
      pauseCircle,
      playSkipBack,
      playSkipForward,
      musicalNotes,
      volumeLow,
      volumeHigh,
      phonePortraitOutline,
      desktopOutline,
      globeOutline,
      checkmarkCircle,
      repeat,
    });

    this.subs.add(
      this.reproductorService.cancionActual$.subscribe(
        (c) => (this.cancion = c),
      ),
    );
    this.subs.add(
      this.reproductorService.cola$.subscribe((c) => (this.cola = c)),
    );
    this.subs.add(
      this.reproductorService.reproduciendo$.subscribe((r) => {
        this.reproduciendo = r;
        this.cdr.detectChanges(); // ← forzar actualización de la vista
      }),
    );
    this.subs.add(
      this.reproductorService.duracion$.subscribe((d) => (this.duracion = d)),
    );
    this.subs.add(
      this.reproductorService.volumen$.subscribe((v) => (this.volumen = v)),
    );
    this.subs.add(
      this.reproductorService.progreso$.subscribe((p) => {
        if (!this.arrastrando) this.progreso = p;
      }),
    );
    this.subs.add(
      this.reproductorService.enBucle$.subscribe((b) => (this.enBucle = b)),
    );
    // ── dispositivosActivos → quién está sonando ──────────────────────────────
this.subs.add(
  this.reproductorService.dispositivosActivos$.subscribe((activos) => {
    this.dispositivosSeleccionados = activos;
    this.cdr.detectChanges();
  }),  // ← coma + cierre del subs.add que faltaba
);

// ── Refrescar chips disponibles ante eventos relevantes ───────────────────
this.subs.add(  // ← faltaba el subs.add
  this.wsService.evento$.subscribe((ev) => {
    if (['TRANSFERIR', 'PLAY', 'PAUSE', 'CAMBIAR_CANCION'].includes(ev.tipo)) {
      this.cargarDispositivos();
    }
  }),
);

    // Carga inicial
    setTimeout(() => {
  this.cargarDispositivos();
  this.cdr.detectChanges();
}, 300);
  }

  formatearTiempo(segundos: number): string {
    if (!segundos || isNaN(segundos)) return '0:00';
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  private cargarDispositivos() {
  this.authService.getMisDispositivos().subscribe({
    next: (data: any[]) => {
      this.dispositivos = data.filter((d: any) => d.dispositivoActivo);
      // ← eliminadas las líneas que sobreescribían dispositivosSeleccionados
      // La fuente de verdad es dispositivosActivos$ del servicio
      this.cdr.detectChanges();
    }
  });
}
  onRangeStart() {
    this.arrastrando = true;
  }
  onRangeChange(e: any) {
    this.progreso = e.detail.value;
  }
  onRangeEnd(e: any) {
    this.reproductorService.buscarPosicion(e.detail.value);
    this.arrastrando = false;
  }
  onVolumenChange(e: any) {
    this.reproductorService.setVolumen(e.detail.value);
  }
  cerrar() {
    this.modalCtrl.dismiss();
  }
  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  async anadirAPlaylist() {
    const cancion = this.cancion;
    if (!cancion) return;
    const playlists = await firstValueFrom(
      this.musicaService.getMisPlaylists(),
    );
    const alert = await this.alertCtrl.create({
      header: 'Añadir a playlist',
      message: `"${cancion.titulo}"`,
      inputs: playlists.map((pl) => ({
        type: 'radio' as const,
        label: pl.nombre,
        value: pl.id,
      })),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Añadir',
          handler: (playlistId) => {
            if (!playlistId) return false;
            this.musicaService
              .añadirCancionAPlaylist(playlistId, cancion.id)
              .subscribe({
                next: async () => {
                  const toast = await this.toastCtrl.create({
                    message: 'Canción añadida a la playlist',
                    color: 'success',
                    duration: 2000,
                    position: 'bottom',
                  });
                  await toast.present();
                },
                error: async () => {
                  const toast = await this.toastCtrl.create({
                    message: 'Error al añadir la canción',
                    color: 'danger',
                    duration: 2000,
                    position: 'bottom',
                  });
                  await toast.present();
                },
              });
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  toggleDispositivo(tipo: string) {
  if (!tipo) return;
  if (this.estaSeleccionado(tipo)) return; // Ya está sonando, no hacer nada

  // ✅ Transferir exclusivamente a este dispositivo (solo uno puede sonar)
  this.reproductorService.actualizarDispositivosSonando([tipo]);

  // Actualización optimista local mientras el WS confirma
  this.dispositivosSeleccionados = [tipo];
  this.reproductorService.setDispositivosActivos([tipo]);
  this.cdr.detectChanges();
}

  estaSeleccionado(tipo: string): boolean {
    return this.dispositivosSeleccionados.includes(tipo);
  }
}
