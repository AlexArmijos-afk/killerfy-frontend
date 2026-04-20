import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonHeader, IonToolbar, IonTitle,
  IonSearchbar, IonList, IonItem, IonIcon,
  IonNote, IonSpinner, IonLabel
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotes } from 'ionicons/icons';
import { Subject, forkJoin, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { MusicaService, Cancion } from '../../services/musica.service';
import { ReproductorService } from '../../services/reproductor.service';

@Component({
  selector: 'app-buscar',
  templateUrl: './buscar.page.html',
  styleUrls: ['./buscar.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonHeader, IonToolbar, IonTitle,
    IonSearchbar, IonList, IonItem, IonIcon,
    IonNote, IonSpinner, IonLabel
  ]
})
export class BuscarPage {

  terminoBusqueda = '';
  resultados: Cancion[] = [];
  cargando = false;
  buscado = false;

  private busqueda$ = new Subject<string>();

  constructor(private musicaService: MusicaService, private reproductorService: ReproductorService) {
    addIcons({ musicalNotes });

    this.busqueda$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(termino => {
        if (!termino.trim()) {
          this.resultados = [];
          this.buscado = false;
          this.cargando = false;
          return of([[], []]);
        }
        this.cargando = true;
        return forkJoin([
          this.musicaService.buscarPorTitulo(termino),
          this.musicaService.buscarPorArtista(termino)
        ]);
      })
    ).subscribe({
      next: (data: any) => {
        if (Array.isArray(data) && data.length === 2) {
          const porTitulo: Cancion[] = data[0];
          const porArtista: Cancion[] = data[1];
          // Combina y elimina duplicados por id
          const combinados = [...porTitulo, ...porArtista];
          const unicos = combinados.filter(
            (c, i, arr) => arr.findIndex(x => x.id === c.id) === i
          );
          this.resultados = unicos;
          this.buscado = true;
        }
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
        this.buscado = true;
      }
    });
  }

  onInput(event: any) {
    this.terminoBusqueda = event.detail.value;
    this.busqueda$.next(this.terminoBusqueda);
  }

  formatearDuracion(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  reproducirCancion(cancion: Cancion) {
  this.reproductorService.reproducir(cancion, this.resultados);
}
}