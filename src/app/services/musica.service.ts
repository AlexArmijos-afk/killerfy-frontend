import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Cancion {
  id: number;
  titulo: string;
  artista: string;
  album: string;
  duracionSegundos: number;
  urlAudio: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  avatar: string | null;
  fechaRegistro: string;
}

export interface PlaylistCancion {
  cancion: Cancion;
  orden: number;
}

export interface Playlist {
  id: number;
  nombre: string;
  descripcion: string;
  usuario: Usuario;
  canciones: PlaylistCancion[];
  fechaCreacion: string;
}

@Injectable({ providedIn: 'root' })
export class MusicaService {

  private apiUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient) {}

  // ─── Canciones ─────────────────────────────────────
  getCanciones(): Observable<Cancion[]> {
    return this.http.get<Cancion[]>(`${this.apiUrl}/canciones`);
  }

  buscarPorTitulo(titulo: string): Observable<Cancion[]> {
    return this.http.get<Cancion[]>(`${this.apiUrl}/canciones/buscar?titulo=${titulo}`);
  }

  buscarPorArtista(artista: string): Observable<Cancion[]> {
    return this.http.get<Cancion[]>(`${this.apiUrl}/canciones/buscar?artista=${artista}`);
  }
// ─── Playlists ─────────────────────────────────────

  // Obtiene las playlists del usuario autenticado (usa el token)
  getMisPlaylists(): Observable<Playlist[]> {
    return this.http.get<Playlist[]>(`${this.apiUrl}/playlists/mis-playlists`);
  }

  getPlaylistPorId(id: number): Observable<Playlist> {
    return this.http.get<Playlist>(`${this.apiUrl}/playlists/${id}`);
  }

  crearPlaylist(nombre: string, descripcion: string): Observable<Playlist> {
    return this.http.post<Playlist>(`${this.apiUrl}/playlists`, { nombre, descripcion });
  }

  actualizarPlaylist(id: number, nombre: string, descripcion: string): Observable<Playlist> {
    return this.http.put<Playlist>(`${this.apiUrl}/playlists/${id}`, { nombre, descripcion });
  }

  eliminarPlaylist(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/playlists/${id}`);
  }

  // ─── Canciones de una playlist ─────────────────────
  getCancionesPlaylist(playlistId: number): Observable<PlaylistCancion[]> {
    return this.http.get<PlaylistCancion[]>(`${this.apiUrl}/playlists/${playlistId}/canciones`);
  }

  añadirCancionAPlaylist(playlistId: number, cancionId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/playlists/${playlistId}/canciones/${cancionId}`, {});
  }

  eliminarCancionDePlaylist(playlistId: number, cancionId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/playlists/${playlistId}/canciones/${cancionId}`);
  }
}