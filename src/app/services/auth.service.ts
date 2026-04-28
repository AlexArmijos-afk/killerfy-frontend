import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8080/api/auth';
  private usuariosUrl = 'http://localhost:8080/api/usuarios';

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────────────
  // Detecta automáticamente el tipo de dispositivo
  // ─────────────────────────────────────────────────────
  private getTipoDispositivo(): string {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') return 'ANDROID';
    if (platform === 'ios') return 'ANDROID'; // iOS usa mismo tipo
    // Electron/escritorio: el user agent contiene "Electron"
    if (navigator.userAgent.toLowerCase().includes('electron')) return 'DESKTOP';
    return 'WEB';
  }

  // ─────────────────────────────────────────────────────
  // Login — envía tipoDispositivo automáticamente
  // ─────────────────────────────────────────────────────
  login(email: string, password: string): Observable<any> {
    const tipoDispositivo = this.getTipoDispositivo();
    return this.http.post(`${this.apiUrl}/login`, { email, password, tipoDispositivo }).pipe(
      tap((res: any) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('usuario', JSON.stringify({
          id: res.id,
          nombre: res.nombre,
          email: res.email,
          rol: res.rol,
          dispositivo: res.dispositivo
        }));
      })
    );
  }

  // ─────────────────────────────────────────────────────
  // Registro
  // ─────────────────────────────────────────────────────
  registro(nombre: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/registro`, { nombre, email, password });
  }

  // ─────────────────────────────────────────────────────
  // Logout — avisa al backend (pone dispositivoActivo=false)
  // y limpia el localStorage
  // ─────────────────────────────────────────────────────
  cerrarSesion(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}).pipe(
      tap(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
      })
    );
  }

  // Obtiene el perfil completo del usuario (incluye fechaRegistro y avatar)
  getPerfil(): Observable<any> {
    return this.http.get(`${this.usuariosUrl}/perfil`);
  }

  // Token
  obtenerToken(): string | null {
    return localStorage.getItem('token');
  }

  obtenerUsuario() {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  }
  
  estaLogueado(): boolean {
    return this.obtenerToken() !== null;  // ← mejor comprobar el token
  }
}