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
  private parseResponse(result: any, date: string): TimeSlot[] {
    const slots: TimeSlot[] = [];

    // Adapt to actual response structure — verify with DevTools
    // Trying common patterns: result.data[], result[], or result.places[]
    const places = result?.data ?? result?.places ?? (Array.isArray(result) ? result : []);

    for (const place of places) {
      if (!place || typeof place !== 'object') continue;

      const placeId = String(place.placeId ?? place.id ?? '');
      const placeName = place.placeName ?? place.name ?? `Court ${placeId}`;
      const placeSlots = place.slots ?? place.times ?? place.schedule ?? [];

      for (const slot of placeSlots) {
        if (!slot || typeof slot !== 'object') continue;

        const startTime = slot.time ?? slot.startTime ?? slot.start;
        if (!startTime) continue;

        const endTime = slot.endTime ?? slot.end ?? this.addMinutes(startTime, 60);
        const status = this.mapStatus(slot.status ?? slot.state);

        slots.push({
          courtId: placeId,
          courtName: placeName,
          date,
          startTime,
          endTime,
          durationMinutes: this.diffMinutes(startTime, endTime),
          status,
          price: slot.price,
          provider: 'teniso_pasaulis',
        });
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
