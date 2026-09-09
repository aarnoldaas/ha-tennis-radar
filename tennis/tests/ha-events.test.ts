import { afterEach, expect, it, vi } from 'vitest';
const { FakeSocket } = vi.hoisted(() => {
  class FakeSocket {
    static instances: FakeSocket[] = [];
    listeners: Record<string, ((event: any) => void)[]> = {};
    send = vi.fn();
    close = vi.fn(() => this.emit('close', {}));
    constructor(public url: string) { FakeSocket.instances.push(this); }
    addEventListener(type: string, handler: (event: any) => void) {(this.listeners[type] ??= []).push(handler);}
    emit(type: string, event: any) {this.listeners[type]?.forEach(handler=>handler(event));}
    message(data: unknown) {this.emit('message', {data:JSON.stringify(data)});}
  }
  return {FakeSocket};
});
vi.mock('undici', () => ({WebSocket: FakeSocket}));
import { HomeAssistantEvents } from '../src/ha-events.js';
afterEach(() => {vi.useRealTimers(); FakeSocket.instances = [];});
it('authenticates, subscribes, routes notification actions, and reconnects', async () => {
  vi.useFakeTimers();
  const action = vi.fn().mockResolvedValue(undefined);
  const events = new HomeAssistantEvents(action, 'ha-test-token');
  events.start();
  const socket = FakeSocket.instances[0];
  expect(socket.url).toBe('ws://supervisor/core/websocket');
  socket.message({type:'auth_required'});
  expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({type:'auth',access_token:'ha-test-token'});
  socket.message({type:'auth_ok'});
  expect(JSON.parse(socket.send.mock.calls[1][0])).toEqual({id:1,type:'subscribe_events',event_type:'mobile_app_notification_action'});
  socket.message({id:1,type:'result',success:true});
  expect(events.connected).toBe(true);
  socket.message({id:1,type:'event',event:{event_type:'mobile_app_notification_action',data:{action:'OTHER_ACTION'}}});
  expect(action).not.toHaveBeenCalled();
  socket.message({id:1,type:'event',event:{event_type:'mobile_app_notification_action',data:{action:'TENNIS_CART_test'}}});
  expect(action).toHaveBeenCalledWith('TENNIS_CART_test');
  socket.close();
  expect(events.connected).toBe(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(FakeSocket.instances).toHaveLength(2);
  events.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(FakeSocket.instances).toHaveLength(2);
});
it('does not connect without a supervisor token', () => {
  new HomeAssistantEvents(vi.fn(), '').start();
  expect(FakeSocket.instances).toHaveLength(0);
});
