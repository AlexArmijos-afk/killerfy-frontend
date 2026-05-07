import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl      = `${environment.apiUrl}/api/auth`;
  private usuariosUrl = `${environment.apiUrl}/api/usuarios`;

  constructor(private http: HttpClient) {}

  // ─────────────────────────────────────────────────────
  // Detecta automáticamente el tipo de dispositivo
  // ─────────────────────────────────────────────────────
  private getTipoDispositivo(): string {
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') return 'ANDROID';
    if (navigator.userAgent.toLowerCase().includes('electron')) return 'DESKTOP';
    return 'WEB';
  }

  // ─────────────────────────────────────────────────────
  // POST /api/auth/login
  // ─────────────────────────────────────────────────────
  login(email: string, password: string): Observable<any> {
    const tipoDispositivo = this.getTipoDispositivo();
    return this.http.post(`${this.apiUrl}/login`, { email, password, tipoDispositivo }).pipe(
      tap((res: any) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('usuario', JSON.stringify({
          id:          res.id,
          nombre:      res.nombre,
          email:       res.email,
          rol:         res.rol,
          dispositivo: res.dispositivo
        }));
      })
    );
  }

  // ─────────────────────────────────────────────────────
  // POST /api/auth/registro
  // ─────────────────────────────────────────────────────
  registro(nombre: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/registro`, { nombre, email, password });
  }

  // ─────────────────────────────────────────────────────
  // POST /api/auth/logout
  // ─────────────────────────────────────────────────────
  cerrarSesion(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}).pipe(
      tap(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
      })
    );
  }

  // ─────────────────────────────────────────────────────
  // GET /api/usuarios/perfil
  // ─────────────────────────────────────────────────────
  getPerfil(): Observable<any> {
    return this.http.get(`${this.usuariosUrl}/perfil`);
  }

  // ─────────────────────────────────────────────────────
  // PUT /api/usuarios/perfil — editar nombre y avatar
  // Body: { nombre, avatar }
  // ─────────────────────────────────────────────────────
  actualizarPerfil(nombre: string, avatar: string): Observable<any> {
    return this.http.put(`${this.usuariosUrl}/perfil`, { nombre, avatar }).pipe(
      tap((res: any) => {
        // Actualiza el nombre en localStorage para que el resto de la app lo vea
        const usuario = this.obtenerUsuario();
        if (usuario) {
          usuario.nombre = res.nombre;
          localStorage.setItem('usuario', JSON.stringify(usuario));
        }
      })
    );
  }

  // ─────────────────────────────────────────────────────
  // PUT /api/usuarios/cambiar-password
  // Body: { passwordActual, passwordNueva }
  // ─────────────────────────────────────────────────────
  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<any> {
    return this.http.put(`${this.usuariosUrl}/cambiar-password`, { passwordActual, passwordNueva });
  }

  // ─────────────────────────────────────────────────────
  // GET /api/usuarios/mis-dispositivos
  // Devuelve lista de sesiones (activas e inactivas)
  // ─────────────────────────────────────────────────────
  getMisDispositivos(): Observable<any[]> {
    return this.http.get<any[]>(`${this.usuariosUrl}/mis-dispositivos`);
  }

  // ─────────────────────────────────────────────────────
  // Helpers locales
  // ─────────────────────────────────────────────────────
  obtenerToken(): string | null {
    return localStorage.getItem('token');
  }

  obtenerUsuario(): any {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  }

  estaLogueado(): boolean {
    return this.obtenerToken() !== null;
  }

  obtenerRolesDelToken(): string[] {
  const token = this.obtenerToken();
  if (!token) return [];
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // ← El token usa "rol" (no "roles") y puede ser array o string
    const rol = payload.rol || payload.roles || [];
    return Array.isArray(rol) ? rol : [rol];
  } catch {
    return [];
  }
}

esAdmin(): boolean {
  return this.obtenerRolesDelToken().includes('ADMIN');
}
}