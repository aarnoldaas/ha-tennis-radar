import { WebSocket } from 'undici';

/** Subscribe directly so notification buttons need no separate HA automation. */
export class HomeAssistantEvents {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private awaitingPong = false;
  private nextId = 2;
  connected = false;
  constructor(private onAction: (action: string) => Promise<void>, private token = process.env.SUPERVISOR_TOKEN || '') {}
  start(): void {
    if (!this.token || !this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  private connect(): void {
    if (this.stopped) return;
    const socket = new WebSocket('ws://supervisor/core/websocket');
    this.socket = socket;
    this.awaitingPong = false;
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'auth_required') socket.send(JSON.stringify({type: 'auth', access_token: this.token}));
        else if (message.type === 'auth_ok') socket.send(JSON.stringify({id: 1, type: 'subscribe_events', event_type: 'mobile_app_notification_action'}));
        else if (message.type === 'auth_invalid') socket.close();
        else if (message.type === 'result' && message.id === 1) {
          this.connected = message.success === true;
          if (!this.connected) socket.close();
        } else if (message.type === 'pong') this.awaitingPong = false;
        else if (message.type === 'event' && message.id === 1 && message.event?.event_type === 'mobile_app_notification_action') {
          const action = message.event.data?.action;
          if (typeof action === 'string' && (action.startsWith('TENNIS_CART_') || action.startsWith('TENNIS_BOOK_'))) {
            void this.onAction(action).catch(error => console.error('[HA actions] Handler failed:', error.message));
          }
        }
      } catch { console.warn('[HA actions] Invalid event received'); }
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      this.connected = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), 10_000);
    });
    this.heartbeat = setInterval(() => {
      if (!this.connected || this.awaitingPong) { socket.close(); return; }
      this.awaitingPong = true;
      socket.send(JSON.stringify({id: this.nextId++, type: 'ping'}));
    }, 30_000);
  }
  stop(): void {
    this.stopped = true;
    this.connected = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
  }
}
