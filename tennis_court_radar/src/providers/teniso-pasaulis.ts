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
