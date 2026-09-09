import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CartActions, SEB_BOOKINGS_URL } from '../src/cart-actions.js';
import { SebProvider } from '../src/providers/seb.js';
import { loadOptions } from '../src/utils/config.js';
import type { TimeSlot } from '../src/providers/types.js';

const slot: TimeSlot = {courtId:'145',courtName:'SEB 21',date:'2026-09-16',startTime:'13:00',endTime:'14:00',durationMinutes:60,status:'available',provider:'SEB'};
const options = () => ({...loadOptions(),seb_enabled:true,seb_session_token:'test-token',preferred_duration_minutes:60});
const cart = () => ({status:{status:1,expiration:'2026-09-09 18:54:11'},system:{current_date_time:'2026-09-09 18:47:54'},inside:{items:[],court_reservations:[{service_id:145,client_id:79957,from:'2026-09-16 13:00:00',till:'2026-09-16 14:00:00',quantity:1}]},total:{total:'36.00'}});
let dir: string;
beforeEach(() => {dir=mkdtempSync(join(tmpdir(),'tennis-credit-')); vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));});
afterEach(() => {rmSync(dir,{recursive:true,force:true});vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('uses the live-observed account-credit request after checking the exact cart and saving intent', async () => {
  const saved = vi.fn();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({status:'success',data:{subject:79957}}))
    .mockResolvedValueOnce(Response.json({status:'success',data:cart()}))
    .mockImplementationOnce(async (_url, options) => {
      expect(saved).toHaveBeenCalledWith(36);
      expect(Object.fromEntries(options.body.entries())).toEqual({session_token:'test-token'});
      return Response.json({status:'success',data:true});
    });
  vi.stubGlobal('fetch',fetch);
  expect(await new SebProvider('test-token').checkoutWithCredit('test-cart',slot,100,saved)).toBe(36);
  expect(fetch.mock.calls[2][0]).toBe('https://ws.tenisopasaulis.lt/api/v2/carts/test-cart/user_account_order');
  expect(fetch.mock.calls[2][1].method).toBe('POST');
});

it.each(['over-limit','invalid-price','wrong-court','wrong-client','wrong-time','extra-item','multiple-courts','expired','paid'])('does not pay an unsafe cart: %s', async reason => {
  const data = cart();
  if (reason==='over-limit') data.total.total='100.01';
  if (reason==='invalid-price') data.total.total='';
  if (reason==='wrong-court') data.inside.court_reservations[0].service_id=146;
  if (reason==='wrong-client') data.inside.court_reservations[0].client_id=1;
  if (reason==='wrong-time') data.inside.court_reservations[0].from='2026-09-17 13:00:00';
  if (reason==='extra-item') (data.inside.items as unknown[]).push({id:1});
  if (reason==='multiple-courts') data.inside.court_reservations.push({...data.inside.court_reservations[0]});
  if (reason==='expired') data.status.expiration='2026-09-09 18:00:00';
  if (reason==='paid') data.status.status=5;
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({status:'success',data:{subject:79957}})).mockResolvedValueOnce(Response.json({status:'success',data}));
  vi.stubGlobal('fetch',fetch);
  const saved=vi.fn();
  await expect(new SebProvider('test-token').checkoutWithCredit('cart',slot,100,saved)).rejects.toThrow();
  expect(saved).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

function mockBooking() {
  vi.spyOn(SebProvider.prototype,'getAvailability').mockResolvedValue([slot]);
  vi.spyOn(SebProvider.prototype,'getBookings').mockResolvedValue([]);
  return vi.spyOn(SebProvider.prototype,'addToCart').mockImplementation(async (_slot,save) => {save('test-cart');return {cartCode:'test-cart'};});
}
it('books on the new paid action, persists before charging, and never repeats from later alerts or restart', async () => {
  const add=mockBooking();
  const path=join(dir,'actions.json');
  const pay=vi.spyOn(SebProvider.prototype,'checkoutWithCredit').mockImplementation(async (_code,_slot,limit,save) => {
    expect(limit).toBe(100);save(36);
    expect(JSON.parse(readFileSync(path,'utf8'))[0].paymentAttempted).toBe(true);
    return 36;
  });
  const actions=new CartActions(options,path);
  const first=actions.create([slot],'credit')!;
  expect(first.action).toMatch(/^TENNIS_BOOK_/);
  expect(first.title).toContain('Book & pay ≤€100');
  await actions.handle(first.action);
  expect(actions.list()[0]).toMatchObject({state:'paid',amountEur:36,bookingsUrl:SEB_BOOKINGS_URL});
  expect(actions.list()[0].cartUrl).toBeUndefined();
  await actions.handle(first.action);
  const restarted=new CartActions(options,path);
  await restarted.handle(restarted.create([slot],'credit')!.action);
  expect(add).toHaveBeenCalledTimes(1);
  expect(pay).toHaveBeenCalledTimes(1);
});
it('keeps uncertain payments blocked across restarts and never recharges', async () => {
  mockBooking();
  const pay=vi.spyOn(SebProvider.prototype,'checkoutWithCredit').mockImplementation(async (_code,_slot,_limit,save)=>{save(36);throw Error('Timeout');});
  const path=join(dir,'actions.json');
  const actions=new CartActions(options,path);
  await actions.handle(actions.create([slot],'credit')!.action);
  expect(actions.list()[0]).toMatchObject({state:'payment_unknown',bookingsUrl:SEB_BOOKINGS_URL});
  const restarted=new CartActions(options,path);
  await restarted.handle(restarted.create([slot],'credit')!.action);
  expect(pay).toHaveBeenCalledTimes(1);
});
it('does not create a cart when an existing booking overlaps', async () => {
  const add=mockBooking();
  vi.spyOn(SebProvider.prototype,'getBookings').mockResolvedValue([{...slot, startTime:'13:30',endTime:'14:30'}]);
  const actions=new CartActions(options,join(dir,'actions.json'));
  expect(await actions.handle(actions.create([slot],'credit')!.action)).toContain('already have a booking');
  expect(add).not.toHaveBeenCalled();
});
it('old add-to-cart buttons never acquire payment authorization', async () => {
  mockBooking();
  const pay=vi.spyOn(SebProvider.prototype,'checkoutWithCredit');
  const actions=new CartActions(options,join(dir,'actions.json'));
  await actions.handle(actions.create([slot])!.action);
  expect(actions.list()[0].state).toBe('added');
  expect(pay).not.toHaveBeenCalled();
});
it('a corrupt action store disables new payment actions and preserves the file', () => {
  const path=join(dir,'actions.json');writeFileSync(path,'broken');
  expect(new CartActions(options,path).create([slot],'credit')).toBeUndefined();
  expect(readFileSync(path,'utf8')).toBe('broken');
});
