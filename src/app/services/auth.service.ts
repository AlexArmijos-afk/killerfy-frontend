import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'http://localhost:8080/api/auth';

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { email, password }).pipe(
      tap((res: any) => {
        // Guarda el token y el usuario al mismo tiempo
        localStorage.setItem('token', res.token);
        localStorage.setItem('usuario', JSON.stringify({
          id: res.id,
          nombre: res.nombre,
          email: res.email,
          rol: res.rol
        }));
      })
    );
  }

  registro(nombre: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/registro`, { nombre, email, password });
  }

  // Token
  obtenerToken(): string | null {
    return localStorage.getItem('token');
  }

  // Usuario
  guardarUsuario(usuario: any) {
    localStorage.setItem('usuario', JSON.stringify(usuario));
  }

  obtenerUsuario() {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  }

  cerrarSesion() {
    localStorage.removeItem('token');    // ← añadir
    localStorage.removeItem('usuario');
  }

  estaLogueado(): boolean {
    return this.obtenerToken() !== null;  // ← mejor comprobar el token
  }
}