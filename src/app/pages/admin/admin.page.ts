import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  IonContent, IonHeader, IonToolbar, IonTitle, IonSegment,
  IonSegmentButton, IonLabel, IonList, IonItem, IonButton,
  IonIcon, IonSpinner, IonChip, IonInput,
  IonModal, IonButtons, IonFab, IonFabButton, LoadingController,
  AlertController, ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trashOutline, createOutline, cloudUploadOutline,
  personOutline, musicalNotesOutline, addOutline, shieldOutline,
  arrowBackOutline
} from 'ionicons/icons';
import { AdminService, UsuarioAdmin } from '../../services/admin.service';
import { MusicaService, Cancion } from '../../services/musica.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    IonContent, IonHeader, IonToolbar, IonTitle, IonSegment,
    IonSegmentButton, IonLabel, IonList, IonItem, IonButton,
    IonIcon, IonSpinner, IonChip, IonInput,
    IonModal, IonButtons, IonFab, IonFabButton
  ]
})
export class AdminPage implements OnInit {

  segmentoActual = 'canciones';
  cargando = false;

  canciones: Cancion[] = [];
  usuarios: UsuarioAdmin[] = [];

  // Modal subir canción
  modalAbierto = false;
  archivoSeleccionado: File | null = null;
  formCancion: FormGroup;

  // Modal editar canción
  modalEditar = false;
  cancionEditando: Cancion | null = null;
  formEditar: FormGroup;

  constructor(
    private adminService: AdminService,
    private musicaService: MusicaService,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private location: Location
  ) {
    addIcons({
      trashOutline, createOutline, cloudUploadOutline,
      personOutline, musicalNotesOutline, addOutline, shieldOutline,
      arrowBackOutline
    });

    this.formCancion = this.fb.group({
      titulo: ['', Validators.required],
      artista: ['', Validators.required],
      album: ['', Validators.required],
      duracion: [0, [Validators.required, Validators.min(1)]]
    });

    this.formEditar = this.fb.group({
      titulo: ['', Validators.required],
      artista: ['', Validators.required],
      album: ['', Validators.required],
      duracionSegundos: [0, [Validators.required, Validators.min(1)]]
    });
  }

  ngOnInit() {
    this.cargarCanciones();
  }

  // ─── Segmento ─────────────────────────────────────────
  cambiarSegmento(ev: any) {
    this.segmentoActual = ev.detail.value;
    if (this.segmentoActual === 'canciones' && !this.canciones.length) {
      this.cargarCanciones();
    }
    if (this.segmentoActual === 'usuarios' && !this.usuarios.length) {
      this.cargarUsuarios();
    }
  }

  // ─── Canciones ────────────────────────────────────────
  cargarCanciones() {
    this.cargando = true;
    this.musicaService.getCanciones().subscribe({
      next: (data) => { this.canciones = data; this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  seleccionarArchivo(event: any) {
    const file = event.target.files[0];
    if (file && file.type === 'audio/mpeg') {
      this.archivoSeleccionado = file;
    } else {
      this.mostrarToast('Solo se permiten archivos MP3', 'warning');
    }
  }

  async subirCancion() {
    if (this.formCancion.invalid || !this.archivoSeleccionado) {
      this.mostrarToast('Completa todos los campos y selecciona un MP3', 'warning');
      return;
    }
    const loading = await this.loadingCtrl.create({ message: 'Subiendo canción...' });
    await loading.present();

    const fd = new FormData();
    fd.append('titulo', this.formCancion.value.titulo);
    fd.append('artista', this.formCancion.value.artista);
    fd.append('album', this.formCancion.value.album);
    fd.append('duracion', this.formCancion.value.duracion.toString());
    fd.append('archivo', this.archivoSeleccionado);

    this.adminService.subirCancion(fd).subscribe({
      next: async (nueva) => {
        await loading.dismiss();
        this.canciones.unshift(nueva);
        this.modalAbierto = false;
        this.formCancion.reset();
        this.archivoSeleccionado = null;
        this.mostrarToast('Canción subida correctamente', 'success');
      },
      error: async () => {
        await loading.dismiss();
        this.mostrarToast('Error al subir la canción', 'danger');
      }
    });
  }

  abrirModalEditar(cancion: Cancion) {
    this.cancionEditando = cancion;
    this.formEditar.patchValue({
      titulo: cancion.titulo,
      artista: cancion.artista,
      album: cancion.album,
      duracionSegundos: cancion.duracionSegundos
    });
    this.modalEditar = true;
  }

  async guardarEdicion() {
    if (this.formEditar.invalid || !this.cancionEditando) return;

    const loading = await this.loadingCtrl.create({ message: 'Guardando...' });
    await loading.present();

    this.adminService.actualizarCancion(this.cancionEditando.id, this.formEditar.value).subscribe({
      next: async (actualizada) => {
        await loading.dismiss();
        const idx = this.canciones.findIndex(c => c.id === actualizada.id);
        if (idx > -1) this.canciones[idx] = actualizada;
        this.modalEditar = false;
        this.mostrarToast('Canción actualizada', 'success');
      },
      error: async () => {
        await loading.dismiss();
        this.mostrarToast('Error al actualizar', 'danger');
      }
    });
  }

  async confirmarEliminarCancion(cancion: Cancion) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar canción',
      message: `¿Eliminar "${cancion.titulo}"? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: () => this.eliminarCancion(cancion)
        }
      ]
    });
    await alert.present();
  }

  eliminarCancion(cancion: Cancion) {
    this.adminService.eliminarCancion(cancion.id).subscribe({
      next: () => {
        this.canciones = this.canciones.filter(c => c.id !== cancion.id);
        this.mostrarToast('Canción eliminada', 'success');
      },
      error: () => this.mostrarToast('Error al eliminar', 'danger')
    });
  }

  // ─── Usuarios ─────────────────────────────────────────
  cargarUsuarios() {
    this.cargando = true;
    this.adminService.getUsuarios().subscribe({
      next: (data) => { this.usuarios = data; this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  async confirmarEliminarUsuario(usuario: UsuarioAdmin) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar usuario',
      message: `¿Eliminar a "${usuario.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar', role: 'destructive',
          handler: () => this.eliminarUsuario(usuario)
        }
      ]
    });
    await alert.present();
  }

  eliminarUsuario(usuario: UsuarioAdmin) {
    this.adminService.eliminarUsuario(usuario.id).subscribe({
      next: () => {
        this.usuarios = this.usuarios.filter(u => u.id !== usuario.id);
        this.mostrarToast('Usuario eliminado', 'success');
      },
      error: () => this.mostrarToast('Error al eliminar usuario', 'danger')
    });
  }

  async cambiarRol(usuario: UsuarioAdmin) {
    const nuevoRol = usuario.rol === 'ADMIN' ? 'USER' : 'ADMIN';
    const alert = await this.alertCtrl.create({
      header: 'Cambiar rol',
      message: `¿Cambiar rol de "${usuario.nombre}" a ${nuevoRol}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          handler: () => {
            this.adminService.cambiarRol(usuario.id, nuevoRol).subscribe({
              next: (u) => {
                const idx = this.usuarios.findIndex(x => x.id === u.id);
                if (idx > -1) this.usuarios[idx] = u;
                this.mostrarToast(`Rol cambiado a ${nuevoRol}`, 'success');
              },
              error: () => this.mostrarToast('Error al cambiar rol', 'danger')
            });
          }
        }
      ]
    });
    await alert.present();
  }

  // ─── Toast helper ─────────────────────────────────────
  private async mostrarToast(mensaje: string, color: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje, duration: 2500,
      color, position: 'bottom'
    });
    await toast.present();
  }

  volver() {
    this.location.back();
  }
}