import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router,RouterLink } from '@angular/router';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonList, IonItem, IonLabel, IonIcon,
  IonButton, IonSpinner, IonAccordion,
  IonAccordionGroup, IonInput,
  IonButtons, AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personCircle, musicalNotes, list,
  calendarOutline, logOutOutline, chevronDown,
  createOutline, trashOutline, addCircleOutline,
  lockClosedOutline, phonePortraitOutline, checkmarkCircle,
  shieldOutline
} from 'ionicons/icons';
import { MusicaService, Playlist } from '../../services/musica.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { WebsocketService } from 'src/app/services/websocket.service';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonList, IonItem, IonLabel, IonIcon,
    IonButton, IonSpinner, IonAccordion,
    IonAccordionGroup, IonInput,
    IonButtons,RouterLink
  ]
})
export class PerfilPage implements OnInit, OnDestroy {

  perfil: any = null;
  playlists: Playlist[] = [];
  dispositivos: any[] = [];
  cargando = true;

  // Formulario editar perfil
  perfilForm: FormGroup;
  editandoPerfil = false;
  guardandoPerfil = false;

  // Formulario cambiar contraseña
  passwordForm: FormGroup;
  cambiantoPassword = false;
  guardandoPassword = false;

  private subs = new Subscription();

  constructor(
    private musicaService: MusicaService,
    private authService: AuthService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private fb: FormBuilder,
    private wsService: WebsocketService
  ) {
    addIcons({
      personCircle, musicalNotes, list,
      calendarOutline, logOutOutline, chevronDown,
      createOutline, trashOutline, addCircleOutline,
      lockClosedOutline, phonePortraitOutline, checkmarkCircle, shieldOutline
    });

    this.perfilForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      avatar: ['']
    });

    this.passwordForm = this.fb.group({
      passwordActual: ['', [Validators.required]],
      passwordNueva: ['', [Validators.required, Validators.minLength(6)]],
      passwordConfirm: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    // ── DIAGNÓSTICO TEMPORAL ──────────────────────────
  const token = this.authService.obtenerToken();
  if (token) {
    const payload = JSON.parse(atob(token.split('.')[1]));
    console.log('TOKEN PAYLOAD:', JSON.stringify(payload));
    console.log('esAdmin():', this.authService.esAdmin());
  }
  // ── FIN DIAGNÓSTICO ───────────────────────────────
    this.cargarDatos();
  }

  private cargarDatos() {
    this.cargando = true;
    this.subs.add(
      this.authService.getPerfil().subscribe({
        next: (data) => {
          this.perfil = data;
          console.log('PERFIL COMPLETO:', JSON.stringify(data)); // ← añadir esto
          this.perfilForm.patchValue({ nombre: data.nombre, avatar: data.avatar || '' });
          this.cargarPlaylists();
          this.cargarDispositivos();
        },
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

  private cargarDispositivos() {
    this.subs.add(
      this.authService.getMisDispositivos().subscribe({
        next: (data) => { this.dispositivos = data; },
        error: () => { }
      })
    );
  }

  // ─── Editar perfil ───────────────────────────────────

  toggleEditarPerfil() {
    this.editandoPerfil = !this.editandoPerfil;
    if (!this.editandoPerfil) {
      this.perfilForm.patchValue({ nombre: this.perfil.nombre, avatar: this.perfil.avatar || '' });
    }
  }

  async guardarPerfil() {
    if (this.perfilForm.invalid) return;
    this.guardandoPerfil = true;
    const { nombre, avatar } = this.perfilForm.value;
    this.authService.actualizarPerfil(nombre, avatar).subscribe({
      next: (data) => {
        this.perfil = data;
        this.editandoPerfil = false;
        this.guardandoPerfil = false;
        this.mostrarToast('Perfil actualizado correctamente', 'success');
      },
      error: () => {
        this.guardandoPerfil = false;
        this.mostrarToast('Error al actualizar el perfil', 'danger');
      }
    });
  }

  // ─── Cambiar contraseña ──────────────────────────────

  toggleCambiarPassword() {
    this.cambiantoPassword = !this.cambiantoPassword;
    this.passwordForm.reset();
  }

  async guardarPassword() {
    const { passwordActual, passwordNueva, passwordConfirm } = this.passwordForm.value;
    if (passwordNueva !== passwordConfirm) {
      this.mostrarToast('Las contraseñas nuevas no coinciden', 'warning');
      return;
    }
    if (this.passwordForm.invalid) return;
    this.guardandoPassword = true;
    this.authService.cambiarPassword(passwordActual, passwordNueva).subscribe({
      next: () => {
        this.guardandoPassword = false;
        this.cambiantoPassword = false;
        this.passwordForm.reset();
        this.mostrarToast('Contraseña actualizada correctamente', 'success');
      },
      error: (err) => {
        this.guardandoPassword = false;
        const msg = err?.error?.error || 'Error al cambiar la contraseña';
        this.mostrarToast(msg, 'danger');
      }
    });
  }

  // ─── Playlists ───────────────────────────────────────

  async crearPlaylist() {
    const alert = await this.alertCtrl.create({
      header: 'Nueva playlist',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre de la playlist' },
        { name: 'descripcion', type: 'textarea', placeholder: 'Descripción (opcional)' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Crear',
          handler: (data) => {
            if (!data.nombre?.trim()) return false;
            this.musicaService.crearPlaylist(data.nombre, data.descripcion || '').subscribe({
              next: (nueva) => {
                this.playlists = [...this.playlists, nueva];
                this.mostrarToast('Playlist creada', 'success');
              },
              error: () => this.mostrarToast('Error al crear la playlist', 'danger')
            });
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async editarPlaylist(playlist: Playlist, event: Event) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Editar playlist',
      inputs: [
        { name: 'nombre', type: 'text', value: playlist.nombre, placeholder: 'Nombre' },
        { name: 'descripcion', type: 'textarea', value: playlist.descripcion, placeholder: 'Descripción' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data) => {
            if (!data.nombre?.trim()) return false;
            this.musicaService.actualizarPlaylist(playlist.id, data.nombre, data.descripcion || '').subscribe({
              next: (actualizada: Playlist) => {
                const idx = this.playlists.findIndex(p => p.id === playlist.id);
                if (idx > -1) this.playlists[idx] = actualizada;
                this.mostrarToast('Playlist actualizada', 'success');
              },
              error: () => this.mostrarToast('Error al editar la playlist', 'danger')
            });
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async eliminarPlaylist(playlist: Playlist, event: Event) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar playlist',
      message: `¿Seguro que quieres eliminar "${playlist.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.musicaService.eliminarPlaylist(playlist.id).subscribe({
              next: () => {
                this.playlists = this.playlists.filter(p => p.id !== playlist.id);
                this.mostrarToast('Playlist eliminada', 'success');
              },
              error: () => this.mostrarToast('Error al eliminar la playlist', 'danger')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async eliminarCancionDePlaylist(playlistId: number, cancionId: number, event: Event) {
    event.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Eliminar canción',
      message: '¿Quieres quitar esta canción de la playlist?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar',
          role: 'destructive',
          handler: () => {
            this.musicaService.eliminarCancionDePlaylist(playlistId, cancionId).subscribe({
              next: () => {
                const pl = this.playlists.find(p => p.id === playlistId);
                if (pl) pl.canciones = pl.canciones.filter(pc => pc.cancion.id !== cancionId);
                this.mostrarToast('Canción eliminada de la playlist', 'success');
              },
              error: () => this.mostrarToast('Error al eliminar la canción', 'danger')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  // ─── Helpers ─────────────────────────────────────────

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

  private async mostrarToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, color, duration: 2000, position: 'bottom' });
    await toast.present();
  }

  cerrarSesion() {
    this.wsService.desconectar(); // ← desconectar WS antes del logout
    this.authService.cerrarSesion().subscribe({
      next: () => this.router.navigateByUrl('/login', { replaceUrl: true }),
      error: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
  }
  esAdmin(): boolean {
    return this.authService.esAdmin();
  }

  ngOnDestroy() { this.subs.unsubscribe(); }
}