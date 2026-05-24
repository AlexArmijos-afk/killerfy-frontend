import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReproductorEvent {
  tipo: string;
  cancionId?: number;
  progreso?: number;
  dispositivo?: string;
  dispositivosActivos?: string[];
  usuarioEmail?: string;
  cola?: any[];
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

  // NgZone es necesario porque @stomp/stompjs ejecuta sus callbacks fuera de
  // Angular zone. Sin zone.run(), los BehaviorSubjects se actualizan pero
  // Angular no lanza change detection y la UI nunca se re-renderiza.
  constructor(private zone: NgZone) {}

  conectar(token: string, email: string) {
    if (this.client?.active) return;

    this.client = new Client({
      brokerURL: this.WS_URL,
      connectHeaders: { Authorization: `Bearer ${token}`, login: email },
      reconnectDelay: 5000,
      // Heartbeats: emitimos cada 10 s y exigimos pings del servidor cada 10 s.
      // Necesario para que stompjs detecte cuelgues silenciosos (Capacitor en
      // background, proxies, suspensión de Electron) y dispare la reconexión.
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      onConnect: () => {
        this.zone.run(() => {
          this._conectado.next(true);
          console.log('[WS] Conectado como', email);
        });

        // La suscripción al topic se registra aquí, fuera de zone, porque es
        // una llamada de setup de STOMP. El handler SÍ va dentro de zone.run().
        this.client.subscribe(`/topic/reproductor/${email}`, (msg: IMessage) => {
          try {
            const evento: ReproductorEvent = JSON.parse(msg.body);
            // zone.run garantiza que todos los efectos downstream (BehaviorSubjects,
            // suscripciones de componentes, _cola, _cancionActual, etc.) ocurran
            // dentro del zone de Angular y disparen change detection automáticamente.
            this.zone.run(() => this._evento.next(evento));
          } catch (e) {
            console.error('[WS] Error parseando evento:', e);
          }
        });
      },

      onDisconnect: () => {
        this.zone.run(() => {
          this._conectado.next(false);
          console.log('[WS] Desconectado');
        });
      },

      // Se dispara también cuando muere la conexión por timeout de heartbeat,
      // suspensión de la app, o cierre del lado servidor.
      onWebSocketClose: (event) => {
        this.zone.run(() => {
          if (this._conectado.getValue()) {
            console.warn('[WS] WebSocket cerrado, code=' + event?.code);
          }
          this._conectado.next(false);
        });
      },

      onStompError: (frame) => {
        this.zone.run(() => {
          console.error('[WS] Error STOMP:', frame.headers['message']);
          this._conectado.next(false);
        });
      },

      onWebSocketError: (event) => {
        this.zone.run(() => {
          console.error('[WS] Error WebSocket:', event);
          this._conectado.next(false);
        });
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
    } else {
      // Visibilidad: antes se descartaba en silencio si el WS no estaba listo,
      // dejando a los demás dispositivos sin enterarse del cambio.
      console.warn('[WS] Evento descartado (WS no conectado):', evento.tipo, evento);
    }
  }

  desconectar() {
    if (this.client?.active) this.client.deactivate();
    this._conectado.next(false);
  }

  ngOnDestroy() { this.desconectar(); }
}