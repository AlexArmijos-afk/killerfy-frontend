import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Cancion } from './musica.service';
import { environment } from '../../environments/environment';

export interface UsuarioAdmin {
  id:             number;
  nombre:         string;
  email:          string;
  rol:            string;
  fechaRegistro:  string;
  avatar:         string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {

  private apiUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  // ─── Canciones ─────────────────────────────────────────
  subirCancion(formData: FormData): Observable<Cancion> {
    return this.http.post<Cancion>(`${this.apiUrl}/canciones`, formData);
  }

  actualizarCancion(id: number, datos: Partial<Cancion>): Observable<Cancion> {
    return this.http.put<Cancion>(`${this.apiUrl}/canciones/${id}`, datos);
  }

  eliminarCancion(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/canciones/${id}`);
  }

  // ─── Usuarios ─────────────────────────────────── 
  // Corregido: /api/usuarios/admin/todos (no /api/usuarios)
  getUsuarios(): Observable<UsuarioAdmin[]> {
    return this.http.get<UsuarioAdmin[]>(`${this.apiUrl}/usuarios/admin/todos`);
  }

  // Corregido: /api/usuarios/admin/{id}
  eliminarUsuario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/usuarios/admin/${id}`);
  }

  // Corregido: /api/usuarios/admin/{id}/rol
  cambiarRol(id: number, rol: string): Observable<UsuarioAdmin> {
    return this.http.put<UsuarioAdmin>(`${this.apiUrl}/usuarios/admin/${id}/rol`, { rol });
  }
}