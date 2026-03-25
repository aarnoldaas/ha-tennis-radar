import type { ICourtProvider, TimeSlot, Booking } from './types.js';

export class SebProvider implements ICourtProvider {
  readonly name = 'SEB Arena';
  readonly key = 'SEB' as const;

  private readonly salePoint = 11;
  private readonly places = [2, 18];

  constructor(private sessionToken: string) {}

  async getBookings(): Promise<Booking[]> {
    const today = new Date().toISOString().slice(0, 10);
    // Fetch bookings for the next 6 months
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const to = future.toISOString().slice(0, 10);

    console.log(`[SEB] Fetching bookings from ${today} to ${to}`);
    const url = `https://ws.tenisopasaulis.lt/api/v1/orders?sessionToken=${encodeURIComponent(this.sessionToken)}&from=${today}&to=${to}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`SEB Arena bookings API returned ${response.status}`);
    }

    const result = await response.json() as any;
    return this.parseBookings(result);
  }

  private parseBookings(result: any): Booking[] {
    const bookings: Booking[] = [];
    const list = result?.data?.results ?? [];
    if (!Array.isArray(list)) return bookings;

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
    console.log(`[SEB] Fetching courts for ${dates.length} date(s): ${dates.join(', ')}, salePoint ${this.salePoint}, ${this.places.length} place(s)`);

    const response = await fetch('https://ws.tenisopasaulis.lt/api/v1/placeInfoBatch', {
      method: 'POST',
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
    const places = result?.data ?? [];

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
