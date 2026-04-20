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

  getCanciones(): Observable<Cancion[]> {
    return this.http.get<Cancion[]>(`${this.apiUrl}/canciones`);
  }

  buscarPorTitulo(titulo: string): Observable<Cancion[]> {
  return this.http.get<Cancion[]>(`${this.apiUrl}/canciones/buscar?titulo=${titulo}`);
}

buscarPorArtista(artista: string): Observable<Cancion[]> {
  return this.http.get<Cancion[]>(`${this.apiUrl}/canciones/buscar?artista=${artista}`);
}

getPlaylistsUsuario(idUsuario: number): Observable<Playlist[]> {
  return this.http.get<Playlist[]>(`${this.apiUrl}/playlists/usuario/${idUsuario}`);
}
}