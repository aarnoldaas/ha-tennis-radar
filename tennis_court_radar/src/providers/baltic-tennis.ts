import * as cheerio from 'cheerio';
import type { ICourtProvider, TimeSlot } from './types.js';

export class BalticTennisProvider implements ICourtProvider {
  readonly name = 'Baltic Tennis';
  readonly key = 'baltic_tennis' as const;

  constructor(private placeIds: number[] = [1], private sessionToken: string = '') {}

  async getAvailability(date: string): Promise<TimeSlot[]> {
    const allSlots: TimeSlot[] = [];

    // Format date: YYYY-M-DD (no zero-padded month)
    const [year, month, day] = date.split('-');
    const formattedDate = `${year}-${parseInt(month)}-${day}`;

    for (const placeId of this.placeIds) {
      const url = `https://savitarna.baltictennis.lt/reservation/short?sDate=${formattedDate}&iPlaceId=${placeId}`;
      const headers: Record<string, string> = {};
      if (this.sessionToken) {
        headers['Cookie'] = `PHPSESSID=${this.sessionToken}`;
      }
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`[BalticTennis] HTTP ${response.status} for place ${placeId}, date ${date}`);
        continue;
      }

      const html = await response.text();
      const slots = this.parseHTML(html, date, placeId);
      allSlots.push(...slots);
    }

    return allSlots;
  }

  private parseHTML(html: string, date: string, placeId: number): TimeSlot[] {
    const $ = cheerio.load(html);

    // Each row in rbt-table tbody = one court
    const rows = $('table.rbt-table tbody tr');

    // Collect 30-min entries per court, then merge consecutive available ones
    const allSlots: TimeSlot[] = [];

    rows.each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      // First cell is the court name
      const courtName = $(cells[0]).find('span').text().trim();
      if (!courtName) return;

      // Collect all 30-min slots for this court
      const entries: { time: string; available: boolean; courtId: string }[] = [];

      cells.each((colIdx, cell) => {
        if (colIdx === 0) return; // Skip court name column

        const $cell = $(cell);
        const $link = $cell.find('a');
        const time = $link.attr('data-time');
        const courtId = $link.attr('data-court') || '';
        if (!time) return;

        const available = $cell.hasClass('booking-slot-available') || $cell.hasClass('empty');
        entries.push({ time, available, courtId });
      });

      // Sort by time
      entries.sort((a, b) => a.time.localeCompare(b.time));

      // Merge consecutive available 30-min slots
      let blockStart: string | null = null;
      let blockEnd: string | null = null;
      let courtId = '';

      for (const entry of entries) {
        if (entry.available) {
          if (blockStart === null) {
            blockStart = entry.time;
            blockEnd = this.addMinutes(entry.time, 30);
            courtId = entry.courtId;
          } else if (entry.time === blockEnd) {
            blockEnd = this.addMinutes(entry.time, 30);
          } else {
            // Gap — flush
            allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!, placeId));
            blockStart = entry.time;
            blockEnd = this.addMinutes(entry.time, 30);
            courtId = entry.courtId;
          }
        } else {
          if (blockStart !== null) {
            allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!, placeId));
            blockStart = null;
            blockEnd = null;
          }
        }
      }

      // Flush last block
      if (blockStart !== null) {
        allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!, placeId));
      }
    });

    return allSlots;
  }

  private makeSlot(courtId: string, courtName: string, date: string, startTime: string, endTime: string, placeId: number): TimeSlot {
    return {
      courtId: `bt-${placeId}-${courtId}`,
      courtName,
      date,
      startTime: startTime.padStart(5, '0'),
      endTime: endTime.padStart(5, '0'),
      durationMinutes: this.diffMinutes(startTime, endTime),
      status: 'available',
      provider: 'baltic_tennis',
    };
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
