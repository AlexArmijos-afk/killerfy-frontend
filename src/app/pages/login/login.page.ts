import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LoadingController, AlertController } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { IonContent, IonItem, IonLabel, IonInput,
         IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { musicalNotes } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonContent, IonItem, IonLabel,
    IonInput, IonButton, IonIcon
  ]
})
export class LoginPage {

  loginForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController
  ) {
    addIcons({ musicalNotes });
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]]
    });
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }

  async iniciarSesion() {
    const loading = await this.loadingCtrl.create({ message: 'Iniciando sesión...' });
    await loading.present();

    this.authService.login(
      this.loginForm.value.email,
      this.loginForm.value.password
    ).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.authService.guardarUsuario(res);
        this.router.navigateByUrl('/tabs/inicio', { replaceUrl: true });
      },
      error: async () => {
        await loading.dismiss();
        const alert = await this.alertCtrl.create({
          header: 'Error',
          message: 'Email o contraseña incorrectos',
          buttons: ['OK']
        });
        await alert.present();
      }
    });
  }

  irARegistro() {
    this.router.navigateByUrl('/registro');
  }
}