import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AddonOptions } from './utils/config.js';
import type { TimeSlot } from './providers/types.js';
import { SebProvider } from './providers/seb.js';
import { bookingSlot, rankSebCourts } from './providers/matching.js';

export interface CartAction {
  id: string;
  expiresAt: string;
  credentialHash: string;
  slots: TimeSlot[];
  state: 'pending' | 'processing' | 'paid' | 'payment_unknown' | 'failed';
  checkout?: 'credit';
  maxPriceEur?: number;
  paymentAttempted?: boolean;
  amountEur?: number;
  cartCode?: string;
  selected?: TimeSlot;
  message?: string;
}
export const SEB_BOOKINGS_URL = 'https://book.sebarena.lt/#/rezervacijos';
const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');

export class CartActions {
  private actions: CartAction[] = [];
  private busy = false;
  private storeHealthy = true;
  constructor(private getOptions: () => AddonOptions, private path = `${process.env.DATA_DIR || '/data'}/cart-actions.json`) {
    if (existsSync(path)) {
      try {
        const saved = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(saved)) throw new Error('Invalid action store');
        this.actions = saved;
      } catch {
        console.warn('[Cart actions] Could not load saved actions; old notification buttons are invalid.');
        this.actions = [];
        this.storeHealthy = false;
      }
      for (const action of this.actions) {
        if (action.state === 'processing') {
          action.state = action.paymentAttempted ? 'payment_unknown' : 'failed';
          action.message = action.paymentAttempted ? 'Interrupted during payment. Check SEB bookings and credit; payment will not be retried.' : 'Interrupted while adding. Check the retained cart before trying again.';
        }
      }
      if (this.storeHealthy) this.save();
    }
  }
  private save(): void {
    mkdirSync(dirname(this.path), {recursive: true});
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.actions), {mode: 0o600, flush: true});
    renameSync(`${this.path}.tmp`, this.path);
  }
  create(slots: TimeSlot[]): {action: string; title: string} | undefined {
    if (!this.storeHealthy) return;
    const options = this.getOptions();
    if (!Number.isInteger(options.preferred_duration_minutes) || options.preferred_duration_minutes < 30 || options.preferred_duration_minutes > 180) return;
    const ranked = rankSebCourts(slots.filter(slot => slot.status === 'available' && slot.durationMinutes >= options.preferred_duration_minutes)).map(slot => bookingSlot(slot, options.preferred_duration_minutes));
    if (!options.seb_enabled || !options.seb_session_token || !ranked.length) return;
    // Keep payment attempts: later alerts must not charge for the same session again.
    this.actions = this.actions.filter(a => a.state !== 'pending' || Date.parse(a.expiresAt) > Date.now());
    const id = `TENNIS_BOOK_${randomUUID()}`;
    this.actions.push({id, slots: ranked, checkout: 'credit', maxPriceEur: 100, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), credentialHash: fingerprint(options.seb_session_token), state: 'pending'});
    this.save();
    return {action: id, title: `Book & pay ≤€100 (${options.preferred_duration_minutes} min)`};
  }
  list() {
    return this.actions.filter(a => a.id.startsWith('TENNIS_BOOK_') && a.state !== 'pending').slice(-5).reverse().map(({credentialHash: _, slots: __, ...action}) => ({...action, bookingsUrl: action.paymentAttempted ? SEB_BOOKINGS_URL : undefined}));
  }
  async handle(id: string): Promise<string | undefined> {
    const action = this.actions.find(a => a.id === id);
    // Old cart-only alerts never authorize a paid booking.
    if (!action || !id.startsWith('TENNIS_BOOK_') || action.checkout !== 'credit' || action.state !== 'pending') return;
    if (this.busy) return 'Another cart request is in progress. Please wait before tapping again.';
    const options = this.getOptions();
    if (Date.parse(action.expiresAt) <= Date.now() || !options.seb_enabled || action.credentialHash !== fingerprint(options.seb_session_token)) {
      action.state = 'failed';
      action.message = 'This notification expired or SEB settings changed. Use a new court notification.';
      this.save();
      return action.message;
    }
    this.busy = true;
    action.state = 'processing';
    try {
      this.save(); // Consume before any network calls, including across restarts.
      const provider = new SebProvider(options.seb_session_token, options.seb_places);
      const fresh = await provider.getAvailability([...new Set(action.slots.map(s => s.date))]);
      const now = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date());
      const selected = action.slots.find(candidate => `${candidate.date} ${candidate.startTime}` > now && fresh.some(slot =>
        slot.courtId === candidate.courtId && slot.date === candidate.date && slot.status === 'available' && slot.startTime <= candidate.startTime && slot.endTime >= candidate.endTime));
      if (!selected) throw new Error('The courts in this notification are no longer available. Wait for a new notification.');
      action.selected = selected;
      const overlaps = (other: {date: string; startTime: string; endTime: string}) => other.date === selected.date && other.startTime < selected.endTime && other.endTime > selected.startTime;
      if (this.actions.some(other => other.id !== action.id && other.paymentAttempted && other.selected && overlaps(other.selected))) {
        throw new Error('An overlapping booking was already paid or its payment is uncertain. Check SEB bookings; no additional payment attempted');
      }
      const bookings = await provider.getBookings();
      if (bookings.some(overlaps)) throw new Error('You already have a booking at this time; no additional payment attempted');
      const result = await provider.addToCart(selected, code => {action.cartCode = code; this.save();});
      const amount = await provider.checkoutWithCredit(result.cartCode, selected, action.maxPriceEur ?? 0, amount => {
        action.paymentAttempted = true;
        action.amountEur = amount;
        this.save();
      });
      action.state = 'paid';
      action.message = `${selected.courtName}, ${selected.date} ${selected.startTime}–${selected.endTime}: booked and paid €${amount.toFixed(2)} using SEB account credit.`;
    } catch (error) {
      action.state = action.paymentAttempted ? 'payment_unknown' : 'failed';
      action.message = `${error instanceof Error ? error.message : 'Could not book court'}.${action.paymentAttempted ? ' Payment result is uncertain. Check SEB bookings and credit. Payment will not be retried.' : action.cartCode ? ' A temporary cart was created; its contents may be uncertain. No payment was attempted; check the cart before trying again.' : ''}`;
    } finally {
      this.busy = false;
      this.save();
    }
    return action.message;
  }
}
