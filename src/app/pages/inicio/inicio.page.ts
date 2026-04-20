import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonThumbnail, IonNote,
  IonIcon, IonSpinner
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotes, personCircle, albums } from 'ionicons/icons';
import { MusicaService, Cancion } from '../../services/musica.service';
import { ReproductorService } from '../../services/reproductor.service';

interface GrupoArtista {
  nombre: string;
  canciones: Cancion[];
}

interface GrupoAlbum {
  nombre: string;
  artista: string;
  canciones: Cancion[];
}

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSegment, IonSegmentButton, IonLabel,
    IonList, IonItem, IonThumbnail, IonNote,
    IonIcon, IonSpinner
  ]
})
export class InicioPage implements OnInit {

  segmentoActivo = 'todas';
  canciones: Cancion[] = [];
  artistas: GrupoArtista[] = [];
  albumes: GrupoAlbum[] = [];
  cargando = true;

  constructor(private musicaService: MusicaService, private reproductorService: ReproductorService) {
    addIcons({ musicalNotes, personCircle, albums });
  }

  ngOnInit() {
    this.musicaService.getCanciones().subscribe({
      next: (data) => {
        this.canciones = data;
        this.agruparPorArtista();
        this.agruparPorAlbum();
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      }
    });
  }

  agruparPorArtista() {
    const mapa = new Map<string, Cancion[]>();
    this.canciones.forEach(c => {
      if (!mapa.has(c.artista)) mapa.set(c.artista, []);
      mapa.get(c.artista)!.push(c);
    });
    this.artistas = Array.from(mapa.entries()).map(([nombre, canciones]) => ({ nombre, canciones }));
  }

  agruparPorAlbum() {
    const mapa = new Map<string, GrupoAlbum>();
    this.canciones.forEach(c => {
      if (!mapa.has(c.album)) {
        mapa.set(c.album, { nombre: c.album, artista: c.artista, canciones: [] });
      }
      mapa.get(c.album)!.canciones.push(c);
    });
    this.albumes = Array.from(mapa.values());
  }

  formatearDuracion(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  cambiarSegmento(event: any) {
    this.segmentoActivo = event.detail.value;
  }
  reproducirCancion(cancion: Cancion) {
  this.reproductorService.reproducir(cancion, this.canciones);
}
}