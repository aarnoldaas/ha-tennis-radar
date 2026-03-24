import * as cheerio from 'cheerio';
import type { ICourtProvider, TimeSlot } from './types.js';

export class BalticTennisProvider implements ICourtProvider {
  readonly name = 'Baltic Tennis';
  readonly key = 'baltic_tennis' as const;

  constructor(private placeIds: number[] = [1]) {}

  async getAvailability(date: string): Promise<TimeSlot[]> {
    const allSlots: TimeSlot[] = [];

    // Format date: YYYY-M-DD (no zero-padded month)
    const [year, month, day] = date.split('-');
    const formattedDate = `${year}-${parseInt(month)}-${day}`;

    for (const placeId of this.placeIds) {
      const url = `https://savitarna.baltictennis.lt/reservation/short?sDate=${formattedDate}&iPlaceId=${placeId}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[BalticTennis] HTTP ${response.status} for place ${placeId}, date ${date}`);
        continue;
      }

      const html = await response.text();
      console.log(`[BalticTennis] HTML length for ${date} place ${placeId}: ${html.length}`);
      const slots = this.parseHTML(html, date, placeId);
      allSlots.push(...slots);
    }

    return allSlots;
  }

  private parseHTML(html: string, date: string, placeId: number): TimeSlot[] {
    const $ = cheerio.load(html);
    const slots: TimeSlot[] = [];

    // Extract court names from table header
    const courtNames: string[] = [];
    $('table thead tr th, table tr:first-child th').each((i, el) => {
      if (i > 0) courtNames.push($(el).text().trim());
    });

    // Parse each row — each row = one time slot across all courts
    $('table tbody tr, table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const timeText = $(cells[0]).text().trim();
      if (!/^\d{1,2}:\d{2}/.test(timeText)) return;
      const startTime = timeText.substring(0, 5).padStart(5, '0');

      cells.each((colIdx, cell) => {
        if (colIdx === 0) return; // Skip time column

        const $cell = $(cell);
        const cls = ($cell.attr('class') || '').toLowerCase();
        const text = $cell.text().trim().toLowerCase();

        let status: TimeSlot['status'] = 'booked';
        if (cls.includes('free') || text.includes('laisva') || text === '') {
          status = 'available';
        } else if (cls.includes('blocked') || cls.includes('closed')) {
          status = 'blocked';
        }

        // Extract price if shown (e.g., "25 €" or "25.00€")
        const priceMatch = text.match(/(\d+(?:\.\d{2})?)\s*€/);

        slots.push({
          courtId: `bt-${placeId}-${colIdx}`,
          courtName: courtNames[colIdx - 1] || `Court ${colIdx}`,
          date,
          startTime,
          endTime: this.addHour(startTime),
          durationMinutes: 60,
          status,
          price: priceMatch ? parseFloat(priceMatch[1]) : undefined,
          provider: 'baltic_tennis',
        });
      });
    });

    return slots;
  }

  private addHour(time: string): string {
    const [h, m] = time.split(':').map(Number);
    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
