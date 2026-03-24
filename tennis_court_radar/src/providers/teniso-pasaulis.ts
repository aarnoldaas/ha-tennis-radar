import type { ICourtProvider, TimeSlot } from './types.js';

export class TenisoPasaulisProvider implements ICourtProvider {
  readonly name = 'Teniso Pasaulis';
  readonly key = 'teniso_pasaulis' as const;

  constructor(
    private sessionToken: string,
    private salePoint: number = 1,
    private places: number[] = Array.from({ length: 28 }, (_, i) => i + 1),
  ) {}

  async getAvailability(date: string): Promise<TimeSlot[]> {
    const response = await fetch('https://ws.tenisopasaulis.lt/api/v1/placeInfoBatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places: this.places,
        dates: [date],
        salePoint: this.salePoint,
        sessionToken: this.sessionToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Teniso Pasaulis API returned ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await response.json() as any;
    console.log('[TenisoPasaulis] Raw response sample:', JSON.stringify(result).slice(0, 2000));

    return this.parseResponse(result, date);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseResponse(result: any, _date: string): TimeSlot[] {
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
          const date = court.date ?? _date;

          for (const [, slot] of Object.entries(court.timetable)) {
            const s = slot as any;
            if (!s?.from) continue;

            const startTime = s.from.slice(0, 5); // "07:00:00" -> "07:00"
            const endTime = s.to.slice(0, 5);
            const status = this.mapStatus(s.status);

            slots.push({
              courtId,
              courtName,
              date,
              startTime,
              endTime,
              durationMinutes: this.diffMinutes(startTime, endTime),
              status,
              price: s.price,
              provider: 'teniso_pasaulis',
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

  private addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private diffMinutes(a: string, b: string): number {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
  }
}
