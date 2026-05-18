import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ReproductorService } from './services/reproductor.service';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import * as allIcons from 'ionicons/icons';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [IonApp, IonRouterOutlet]
})
export class AppComponent implements OnInit {

  constructor(
    private authService: AuthService,
    private reproductorService: ReproductorService,
    private router: Router
  ) {
    addIcons(allIcons);
    if (Capacitor.isNativePlatform()) {
      document.documentElement.classList.add('ion-palette-dark');
      document.body.classList.add('ion-palette-dark');
      document.body.setAttribute('color-theme', 'dark');
    }
  }

  ngOnInit() {
    const platform = Capacitor.getPlatform();

    // ── Verificar sesión al arrancar (todas las plataformas) ──
    if (this.authService.estaLogueado()) {
      this.authService.verificarToken().subscribe({
        next: () => {
          this.reproductorService.iniciarWS();
          this.router.navigateByUrl('/tabs/inicio', { replaceUrl: true });
        },
        error: () => {
          this.authService.cerrarSesion();
        }
      });
    }

    // ── Listeners de cierre por plataforma ──
    if (platform === 'web') {
      window.addEventListener('beforeunload', () => {
        this.desconectarConBeacon();
      });

    } else if (platform === 'android' || platform === 'ios') {
      App.addListener('pause', () => {
        this.desconectarConHttp();
      });

      App.addListener('resume', () => {
        if (this.authService.estaLogueado()) {
          this.reactivarDispositivo();
        }
      });
    }
  }

  private desconectarConBeacon() {
    const token = this.authService.obtenerToken();
    if (!token) return;
    const url = `${environment.apiUrl}/api/auth/dispositivo/desconectar`;
    const blob = new Blob([JSON.stringify({ token })], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        keepalive: true
      }).catch(() => {});
    }
  }

  private desconectarConHttp() {
    const token = this.authService.obtenerToken();
    if (!token) return;
    fetch(`${environment.apiUrl}/api/auth/dispositivo/desconectar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    }).catch(() => {});
  }

  private reactivarDispositivo() {
    const token = this.authService.obtenerToken();
    if (!token) return;
    fetch(`${environment.apiUrl}/api/auth/reactivar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
    this.reproductorService.iniciarWS();
  }
}