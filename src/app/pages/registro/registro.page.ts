import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, AlertController } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import {
  IonContent, IonItem, IonLabel, IonInput,
  IonButton, IonIcon
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { personAddOutline } from 'ionicons/icons';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonContent, IonItem, IonLabel,
    IonInput, IonButton, IonIcon
  ]
})
export class RegistroPage {

  registroForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController
  ) {
    addIcons({ personAddOutline });
    this.registroForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      confirmar: ['', [Validators.required]]
    }, { validators: this.passwordsIguales });
  }

  passwordsIguales(form: FormGroup) {
    const pass = form.get('password')?.value;
    const confirmar = form.get('confirmar')?.value;
    return pass === confirmar ? null : { noCoinciden: true };
  }

  get nombre() { return this.registroForm.get('nombre'); }
  get email() { return this.registroForm.get('email'); }
  get password() { return this.registroForm.get('password'); }
  get confirmar() { return this.registroForm.get('confirmar'); }

  async registrarse() {
    const loading = await this.loadingCtrl.create({ message: 'Creando cuenta...' });
    await loading.present();

    this.authService.registro(
      this.registroForm.value.nombre,
      this.registroForm.value.email,
      this.registroForm.value.password
    ).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.authService.guardarUsuario(res);
        this.router.navigateByUrl('/tabs/inicio', { replaceUrl: true });
      },
      error: async (err) => {
        await loading.dismiss();
        const mensaje = err.status === 409
          ? 'Este email ya está registrado'
          : 'Error al crear la cuenta. Inténtalo de nuevo';
        const alert = await this.alertCtrl.create({
          header: 'Error',
          message: mensaje,
          buttons: ['OK']
        });
        await alert.present();
      }
    });
  }

  irALogin() {
    this.router.navigateByUrl('/login');
  }
}