import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { CartActions, sebCartUrl } from '../src/cart-actions.js';
import { SebProvider } from '../src/providers/seb.js';
import { matchingSlots, rankSebCourts } from '../src/providers/matching.js';
import { loadOptions } from '../src/utils/config.js';
import type { TimeSlot } from '../src/providers/types.js';

let dir: string;
const slot = (number: number): TimeSlot => ({courtId: String(100 + number),courtName:`SEB ${number.toString().padStart(2,'0')}`,date:'2026-09-10',startTime:'17:00',endTime:'21:00',durationMinutes:240,status:'available',provider:'SEB'});
const options = () => ({...loadOptions(),seb_enabled:true,seb_session_token:'test-token',preferred_start_time:'17:00',preferred_end_time:'21:00',preferred_duration_minutes:60});
beforeEach(() => {dir = mkdtempSync(join(tmpdir(),'tennis-cart-test-')); vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));});
afterEach(() => {rmSync(dir,{recursive:true,force:true});vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('clips all-day blocks to preferences and rejects blocks too short inside the window', () => {
  expect(matchingSlots([{...slot(21),startTime:'07:00',endTime:'23:00',durationMinutes:960}],options())[0]).toMatchObject({startTime:'17:00',endTime:'21:00',durationMinutes:240});
  expect(matchingSlots([{...slot(21),startTime:'20:30'}],options())).toEqual([]);
  expect(rankSebCourts([slot(1),slot(19),slot(21),slot(20)]).map(s=>s.courtName)).toEqual(['SEB 21','SEB 20','SEB 19','SEB 01']);
});
it('adds only the highest available court, for the configured duration, after the action is clicked', async () => {
  vi.spyOn(SebProvider.prototype,'getAvailability').mockResolvedValue([slot(1),slot(20)]);
  const add = vi.spyOn(SebProvider.prototype,'addToCart').mockImplementation(async (_,save) => {save('cart-123');return {cartCode:'cart-123'};});
  const actions = new CartActions(options,join(dir,'actions.json'));
  const notification = actions.create([slot(1),slot(21),slot(20)])!;
  expect(add).not.toHaveBeenCalled();
  await actions.handle(notification.action);
  expect(add).toHaveBeenCalledTimes(1);
  expect(add.mock.calls[0][0]).toMatchObject({courtName:'SEB 20',startTime:'17:00',endTime:'18:00',durationMinutes:60});
  expect(actions.list()[0]).toMatchObject({state:'added',cartCode:'cart-123',cartUrl:sebCartUrl('cart-123')});
  await actions.handle(notification.action);
  await new CartActions(options,join(dir,'actions.json')).handle(notification.action);
  expect(add).toHaveBeenCalledTimes(1);
});
it('rejects expired notifications and changed credentials without any API calls', async () => {
  const read = vi.spyOn(SebProvider.prototype,'getAvailability');
  let opts = options();
  const actions = new CartActions(()=>opts,join(dir,'actions.json'));
  const first = actions.create([slot(21)])!;
  vi.advanceTimersByTime(16*60_000);
  expect(await actions.handle(first.action)).toContain('expired');
  const second = actions.create([slot(21)])!;
  opts = {...opts,seb_session_token:'different'};
  expect(await actions.handle(second.action)).toContain('settings changed');
  expect(read).not.toHaveBeenCalled();
});
it('does not create a cart when availability disappeared', async () => {
  vi.spyOn(SebProvider.prototype,'getAvailability').mockResolvedValue([]);
  const add = vi.spyOn(SebProvider.prototype,'addToCart');
  const actions = new CartActions(options,join(dir,'actions.json'));
  expect(await actions.handle(actions.create([slot(21)])!.action)).toContain('no longer available');
  expect(add).not.toHaveBeenCalled();
});
it('retains an uncertain cart result and does not repeat the mutation', async () => {
  vi.spyOn(SebProvider.prototype,'getAvailability').mockResolvedValue([slot(21)]);
  const add = vi.spyOn(SebProvider.prototype,'addToCart').mockImplementation(async (_,save) => {save('uncertain-cart');throw Error('Timeout');});
  const actions = new CartActions(options,join(dir,'actions.json'));
  const id = actions.create([slot(21)])!.action;
  expect(await actions.handle(id)).toContain('uncertain');
  expect(actions.list()[0]).toMatchObject({state:'failed',cartCode:'uncertain-cart'});
  await actions.handle(id);
  expect(add).toHaveBeenCalledTimes(1);
});
it('uses the observed SEB multipart cart contract and never calls payment/order APIs', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({status:'success',data:{subject:123}}))
    .mockResolvedValueOnce(Response.json({status:'success',data:{code:'abc-123'}}))
    .mockResolvedValueOnce(Response.json({status:'success',data:{}}))
    .mockResolvedValueOnce(Response.json({status:'success',data:{}}));
  vi.stubGlobal('fetch',fetch);
  const saved = vi.fn();
  await new SebProvider('test-token').addToCart({...slot(21),endTime:'18:00',durationMinutes:60},saved);
  expect(fetch.mock.calls.map(([url])=>url)).toEqual([
    'https://ws.tenisopasaulis.lt/api/v1/checkToken','https://ws.tenisopasaulis.lt/api/v2/basic-carts',
    'https://ws.tenisopasaulis.lt/api/v2/carts/abc-123/court-reservations-add','https://ws.tenisopasaulis.lt/api/v2/carts/abc-123/resume']);
  expect(Object.fromEntries(fetch.mock.calls[2][1].body.entries())).toEqual({courtID:'121',date:'2026-09-10',time:'17:00:00',durationMins:'60',clientID:'123'});
  expect(saved).toHaveBeenCalledWith('abc-123');
});
it('Safari userscript writes localStorage, preserves the old cart, strips the code and reloads once', () => {
  const storage = new Map([['cartReservationCode','old-cart']]);
  const location = {origin:'https://book.sebarena.lt',hash:'#/rezervuoti/tenisas?tennisRadarCart=new-cart',pathname:'/',search:'',reload:vi.fn()};
  const history = {replaceState:vi.fn()};
  const context = {location,history,URLSearchParams,console,window:{addEventListener:vi.fn()},localStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)}};
  const source = readFileSync('public/seb-cart-handoff.user.js','utf8');
  runInNewContext(source,context);
  expect(storage.get('cartReservationCode')).toBe('new-cart');
  expect(storage.get('tennisRadarPreviousCartReservationCode')).toBe('old-cart');
  expect(history.replaceState).toHaveBeenCalledWith(null,'','/#/rezervuoti/tenisas');
  expect(location.reload).toHaveBeenCalledTimes(1);
  location.hash = '#/rezervuoti/tenisas';
  runInNewContext(source,context);
  expect(location.reload).toHaveBeenCalledTimes(1);
});
