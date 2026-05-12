import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { ReproductorService } from './services/reproductor.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet]
})
export class AppComponent {
  constructor(private authService: AuthService,
    private reproductorService: ReproductorService) {
    if (Capacitor.isNativePlatform()) {
      document.documentElement.classList.add('ion-palette-dark');
      document.body.classList.add('ion-palette-dark');
      document.body.setAttribute('color-theme', 'dark');
    }
  }

  ngOnInit() {
    // Si hay token al arrancar (refresco o vuelta a la app)
    // reconectar el WS y sincronizar el estado del reproductor
    if (this.authService.estaLogueado()) {
      this.reproductorService.iniciarWS();
    }
  }
}
