import { Injectable, OnDestroy } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReproductorEvent {
  tipo: string;
  cancionId?: number;
  progreso?: number;
  dispositivo?: string;
  usuarioEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {

  // ws:// en lugar de http:// — WebSocket nativo sin SockJS
  private readonly WS_URL = environment.apiUrl.replace('http', 'ws') + '/ws';

  private client!: Client;
  private _conectado = new BehaviorSubject<boolean>(false);
  private _evento = new Subject<ReproductorEvent>();

  conectado$ = this._conectado.asObservable();
  evento$ = this._evento.asObservable();

  conectar(token: string, email: string) {
    if (this.client?.active) return;

    this.client = new Client({
      brokerURL: this.WS_URL,
      connectHeaders: { Authorization: `Bearer ${token}`, login: email },
      reconnectDelay: 5000,

      onConnect: () => {
        this._conectado.next(true);
        console.log('[WS] Conectado como', email);
        console.log('[WS] URL usada:', this.WS_URL);

        this.client.subscribe(`/topic/reproductor/${email}`, (msg: IMessage) => {
          try {
            const evento: ReproductorEvent = JSON.parse(msg.body);
            this._evento.next(evento);
          } catch (e) {
            console.error('[WS] Error parseando evento:', e);
          }
        });
      },

      onDisconnect: () => {
        this._conectado.next(false);
        console.log('[WS] Desconectado');
      },

      onStompError: (frame) => {
        console.error('[WS] Error STOMP:', frame.headers['message']);
        this._conectado.next(false);
      },

      onWebSocketError: (event) => {
        console.error('[WS] Error WebSocket:', event);
        console.error('[WS] URL que falló:', this.WS_URL);
        this._conectado.next(false);
      }
    });

    this.client.activate();
  }

  enviarEvento(evento: ReproductorEvent) {
    if (this.client?.connected) {
      this.client.publish({
        destination: '/app/reproductor',
        body: JSON.stringify(evento)
      });
    }
  }

  desconectar() {
    if (this.client?.active) this.client.deactivate();
    this._conectado.next(false);
  }

  ngOnDestroy() { this.desconectar(); }
}