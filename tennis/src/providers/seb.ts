import type { ICourtProvider, TimeSlot, Booking } from './types.js';
import { normalizeSebPlaces } from './seb-places.js';

export class SebProvider implements ICourtProvider {
  readonly name = 'SEB Arena';
  readonly key = 'SEB' as const;

  private readonly salePoint = 11;
  private readonly places: number[];
  private readonly sessionToken: string;

  constructor(sessionToken: string, places?: number[]) {
    this.sessionToken = sessionToken;
    this.places = normalizeSebPlaces(places);
  }

  private async cartRequest(path: string, method = 'GET', fields?: Record<string, string>): Promise<any> {
    const body = fields ? new FormData() : undefined;
    for (const [key, value] of Object.entries(fields ?? {})) body!.set(key, value);
    const response = await fetch(`https://ws.tenisopasaulis.lt/api${path}`, {
      method, body, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`SEB cart API returned HTTP ${response.status}`);
    const result = await response.json() as any;
    if (result?.status !== 'success') throw new Error('SEB cart API rejected the request');
    return result.data;
  }

  async addToCart(slot: TimeSlot, onCartCreated: (code: string) => void): Promise<{ cartCode: string; warning?: string }> {
    const user = await this.cartRequest('/v1/checkToken', 'POST', {session_token: this.sessionToken});
    if (!user?.subject) throw new Error('SEB session expired — update the session token');
    const cart = await this.cartRequest('/v2/basic-carts', 'POST', {sellPoint: String(this.salePoint)});
    if (typeof cart?.code !== 'string' || !cart.code) throw new Error('SEB did not return a cart code');
    // Save before the mutation: an HTTP timeout can leave the court in this cart.
    onCartCreated(cart.code);
    const path = `/v2/carts/${encodeURIComponent(cart.code)}`;
    await this.cartRequest(`${path}/court-reservations-add`, 'POST', {
      courtID: slot.courtId,
      date: slot.date,
      time: `${slot.startTime}:00`,
      durationMins: String(slot.durationMinutes),
      clientID: String(user.subject),
    });
    try {
      await this.cartRequest(`${path}/resume`, 'PUT');
      return {cartCode: cart.code};
    } catch {
      return {cartCode: cart.code, warning: 'Court added, but refreshing the cart expiry failed. Check the cart promptly.'};
    }
  }

  /** Pay only an exact, single-court cart. The caller persists the attempt before POST. */
  async checkoutWithCredit(code: string, slot: TimeSlot, maxPriceEur: number, beforePayment: (amount: number) => void): Promise<number> {
    if (!Number.isFinite(maxPriceEur) || maxPriceEur <= 0 || maxPriceEur > 100) throw new Error('Invalid payment limit');
    const user = await this.cartRequest('/v1/checkToken', 'POST', {session_token: this.sessionToken});
    if (!user?.subject) throw new Error('SEB session expired — update the session token');
    const cart = await this.cartRequest(`/v2/carts/${encodeURIComponent(code)}`);
    const rows = cart?.inside?.court_reservations;
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
    if (!row || String(row.service_id) !== slot.courtId || String(row.client_id) !== String(user.subject)
      || row.from !== `${slot.date} ${slot.startTime}:00` || row.till !== `${slot.date} ${slot.endTime}:00`
      || Number(row.quantity) !== 1) throw new Error('Cart does not match the selected court, time and account');
    if (Object.entries(cart.inside).some(([key, value]) => key !== 'court_reservations' && (!Array.isArray(value) || value.length > 0))) {
      throw new Error('Cart contains additional items; automatic payment stopped');
    }
    if (cart.status?.status !== 1 || typeof cart.status.expiration !== 'string'
      || typeof cart.system?.current_date_time !== 'string' || cart.status.expiration <= cart.system.current_date_time) {
      throw new Error('Cart expired or is no longer available for payment');
    }
    const amountText = String(cart.total?.total ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(amountText)) throw new Error('SEB did not return a valid checkout price');
    const amount = Number(amountText);
    if (amount <= 0 || Math.round(amount * 100) > Math.round(maxPriceEur * 100)) {
      throw new Error(`Cart price €${amount.toFixed(2)} exceeds the allowed €${maxPriceEur.toFixed(2)} or is invalid`);
    }
    beforePayment(amount);
    const paid = await this.cartRequest(`/v2/carts/${encodeURIComponent(code)}/user_account_order`, 'POST', {session_token: this.sessionToken});
    if (paid !== true) throw new Error('SEB did not confirm payment');
    return amount;
  }

  async getBookings(throughDate?: string): Promise<Booking[]> {
    const today = new Date().toISOString().slice(0, 10);
    // Fetch bookings for the next 6 months
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const defaultTo = future.toISOString().slice(0, 10);
    // Also check existing bookings on explicitly selected dates beyond six months.
    const to = throughDate && throughDate > defaultTo ? throughDate : defaultTo;

    console.log(`[SEB] Fetching bookings from ${today} to ${to}`);
    const url = `https://ws.tenisopasaulis.lt/api/v1/orders?sessionToken=${encodeURIComponent(this.sessionToken)}&from=${today}&to=${to}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

    if (!response.ok) {
      throw new Error(`SEB Arena bookings API returned ${response.status}`);
    }

    const result = await response.json() as any;
    return this.parseBookings(result);
  }

  private parseBookings(result: any): Booking[] {
    const bookings: Booking[] = [];
    const list = result?.data?.results;
    if (!Array.isArray(list)) throw new Error('SEB Arena returned an invalid bookings response');

    for (const order of list) {
      // sasi_galiojanuo = "2026-04-01 19:30:00", iki = "2026-04-01 20:30:00"
      const from = order.sasi_galiojanuo ?? '';
      const to = order.iki ?? '';
      if (!from || !to) continue;

      const date = from.slice(0, 10);
      const startTime = from.slice(11, 16);
      const endTime = to.slice(11, 16);
      const courtName = order.pasl_pavadinimas ?? 'Unknown';
      const price = order.kaina;
      const surface = order.pv_pavadinimas ?? '';

      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

      bookings.push({
        courtName: surface ? `${courtName} (${surface})` : courtName,
        date,
        startTime,
        endTime,
        durationMinutes,
        price: price != null ? `${price} €` : undefined,
        provider: 'SEB',
      });
    }

    console.log(`[SEB] Found ${bookings.length} booking(s)`);
    return bookings;
  }

  async getAvailability(dates: string[]): Promise<TimeSlot[]> {
    // Sequential batches keep the long-horizon scan from flooding SEB.
    const slots: TimeSlot[] = [];
    for (let offset = 0; offset < dates.length; offset += 7) {
      slots.push(...await this.getAvailabilityBatch(dates.slice(offset, offset + 7)));
    }
    return slots;
  }

  private async getAvailabilityBatch(dates: string[]): Promise<TimeSlot[]> {
    console.log(`[SEB] Fetching courts for ${dates.length} date(s): ${dates.join(', ')}, salePoint ${this.salePoint}, ${this.places.length} place(s)`);

    const response = await fetch('https://ws.tenisopasaulis.lt/api/v1/placeInfoBatch', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places: this.places,
        dates,
        salePoint: this.salePoint,
        sessionToken: this.sessionToken,
      }),
    });

    if (!response.ok) {
      console.error(`[SEB] HTTP ${response.status} for dates ${dates.join(', ')}`);
      throw new Error(`SEB Arena API returned ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await response.json() as any;

    const slots = this.parseResponse(result);
    console.log(`[SEB] Found ${slots.length} available slot(s) for ${dates.length} date(s)`);
    return slots;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(result: any): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Structure: { data: [ { place: N, data: [[ { courtID, courtName, date, timetable: { "HH:MM:SS": { from, to, status } } } ]] } ] }
    const places = result?.data;
    if (!Array.isArray(places)) throw new Error('SEB Arena returned an invalid availability response');

    for (const placeEntry of places) {
      if (!placeEntry?.data) continue;

      for (const courtGroup of placeEntry.data) {
        if (!Array.isArray(courtGroup)) continue;

        for (const court of courtGroup) {
          if (!court?.timetable) continue;

          const courtId = String(court.courtID ?? '');
          const courtName = court.courtName ?? `Court ${courtId}`;
          const date = court.date ?? '';

          // Collect all 30-min entries sorted by time
          const entries: { from: string; to: string; status: TimeSlot['status'] }[] = [];
          for (const [, slot] of Object.entries(court.timetable)) {
            const s = slot as any;
            if (!s?.from) continue;
            entries.push({
              from: s.from.slice(0, 5),
              to: s.to.slice(0, 5),
              status: this.mapStatus(s.status),
            });
          }
          entries.sort((a, b) => a.from.localeCompare(b.from));

          // Merge consecutive free slots into continuous blocks
          let blockStart: string | null = null;
          let blockEnd: string | null = null;

          for (const entry of entries) {
            if (entry.status === 'available') {
              if (blockStart === null) {
                blockStart = entry.from;
                blockEnd = entry.to;
              } else if (entry.from === blockEnd) {
                // Consecutive — extend the block
                blockEnd = entry.to;
              } else {
                // Gap — flush previous block
                slots.push({
                  courtId, courtName, date,
                  startTime: blockStart,
                  endTime: blockEnd!,
                  durationMinutes: this.diffMinutes(blockStart, blockEnd!),
                  status: 'available',
                  provider: 'SEB',
                });
                blockStart = entry.from;
                blockEnd = entry.to;
              }
            } else {
              // Non-free slot — flush any open block
              if (blockStart !== null) {
                slots.push({
                  courtId, courtName, date,
                  startTime: blockStart,
                  endTime: blockEnd!,
                  durationMinutes: this.diffMinutes(blockStart, blockEnd!),
                  status: 'available',
                  provider: 'SEB',
                });
                blockStart = null;
                blockEnd = null;
              }
            }
          }

          // Flush last block
          if (blockStart !== null) {
            slots.push({
              courtId, courtName, date,
              startTime: blockStart,
              endTime: blockEnd!,
              durationMinutes: this.diffMinutes(blockStart, blockEnd!),
              status: 'available',
              provider: 'SEB',
            });
          }
        }
      }
    }

    return slots;
  }

  private mapStatus(s: unknown): TimeSlot['status'] {
    const str = String(s ?? '').toLowerCase();
    if (['free', 'available', 'laisva'].includes(str)) return 'available';
    if (['blocked', 'maintenance', 'closed'].includes(str)) return 'blocked';
    return 'booked';
  }

  private diffMinutes(a: string, b: string): number {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
  }
}
