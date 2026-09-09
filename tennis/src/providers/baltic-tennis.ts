import * as cheerio from 'cheerio';
import type { ICourtProvider, TimeSlot, Booking } from './types.js';

export class BalticTennisProvider implements ICourtProvider {
  readonly name = 'Baltic Tennis';
  readonly key = 'BT' as const;

  private static readonly PLACE_ID = 1;
  private cookies = new Map<string, string>();
  private authenticated = false;
  private loginPromise: Promise<void> | null = null;

  constructor(
    private username: string = '',
    private password: string = '',
  ) {}

  async getAvailability(dates: string[]): Promise<TimeSlot[]> {
    const allSlots: TimeSlot[] = [];

    for (const date of dates) {
      // Format date: YYYY-M-DD (no zero-padded month)
      const [year, month, day] = date.split('-');
      const formattedDate = `${year}-${parseInt(month)}-${day}`;

      console.log(`[BalticTennis] Fetching courts for date ${date}`);

      const html = await this.fetchWithAuth(formattedDate, date);
      const slots = this.parseHTML(html, date);
      console.log(`[BalticTennis] Parsed ${slots.length} available slot(s) for date ${date}`);
      allSlots.push(...slots);
    }

    return allSlots;
  }

  async getBookings(): Promise<Booking[]> {
    const html = await this.fetchAuthenticated('/user/settings?orders');
    const $ = cheerio.load(html);
    if (!$('#section1').length) {
      throw new Error('Baltic Tennis bookings page has an unexpected format');
    }
    return this.parseBookingsHTML(html);
  }

  private static readonly LT_MONTHS: Record<string, string> = {
    'sausio': '01', 'vasario': '02', 'kovo': '03', 'balandžio': '04',
    'gegužės': '05', 'birželio': '06', 'liepos': '07', 'rugpjūčio': '08',
    'rugsėjo': '09', 'spalio': '10', 'lapkričio': '11', 'gruodžio': '12',
  };

  private parseLithuanianDate(text: string): string {
    // "2026 Kovo 31 d." -> "2026-03-31"
    const m = text.match(/(\d{4})\s+(\S+)\s+(\d{1,2})/);
    if (!m) return '';
    const month = BalticTennisProvider.LT_MONTHS[m[2].toLowerCase()];
    if (!month) return '';
    return `${m[1]}-${month}-${m[3].padStart(2, '0')}`;
  }

  private parseBookingsHTML(html: string): Booking[] {
    const $ = cheerio.load(html);
    const bookings: Booking[] = [];

    // Only parse upcoming visits (#section1), skip history (#section2)
    $('#section1 table.table-reservations tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;

      // Columns: Data | Laikas | Trukmė | Aikštelė | Kaina | (actions)
      const dateText = $(cells[0]).text().trim();
      const timeText = $(cells[1]).text().trim();
      const courtName = $(cells[3]).text().trim();
      const price = $(cells[4]).text().trim();

      const date = this.parseLithuanianDate(dateText);
      if (!date) return;

      const timeMatch = timeText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!timeMatch) return;

      const startTime = timeMatch[1].padStart(5, '0');
      const endTime = timeMatch[2].padStart(5, '0');
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

      bookings.push({
        courtName: courtName || 'Unknown',
        date,
        startTime,
        endTime,
        durationMinutes,
        price: price || undefined,
        provider: 'BT',
      });
    });

    console.log(`[BalticTennis] Found ${bookings.length} upcoming booking(s)`);
    return bookings;
  }

  private async fetchWithAuth(formattedDate: string, _date: string): Promise<string> {
    return this.fetchAuthenticated(`/reservation/short?sDate=${formattedDate}&iPlaceId=${BalticTennisProvider.PLACE_ID}`);
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`https://savitarna.baltictennis.lt${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  }

  private async fetchAuthenticated(path: string): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.login();
      const response = await this.request(path);
      const location = response.headers.get('location') || '';
      const loginRedirect = [301, 302, 303, 307, 308].includes(response.status) && location.includes('/user/login');
      if (!response.ok && !loginRedirect) {
        throw new Error(`Baltic Tennis HTTP ${response.status}`);
      }
      const html = await response.text();
      if (!loginRedirect && !this.isLoginPage(html)) return html;
      this.authenticated = false;
    }
    throw new Error('Baltic Tennis session expired — login failed after re-authentication');
  }

  private isLoginPage(html: string): boolean {
    const $ = cheerio.load(html);
    // Navigation text can mention signing in even on a valid calendar page.
    return $('input[name="LoginForm[var_password]"]').length > 0 ||
      $('form[action*="/user/login"]').length > 0;
  }

  private async login(): Promise<void> {
    if (this.authenticated) return;
    // Availability polling and booking reminders can start together.
    if (!this.loginPromise) {
      this.loginPromise = this.performLogin().finally(() => { this.loginPromise = null; });
    }
    return this.loginPromise;
  }

  private async performLogin(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error('Baltic Tennis credentials not configured — set username and password in settings');
    }
    this.cookies.clear();
    this.cookies.set('_lang', 'lt');
    const page = await this.request('/user/login');
    if (!page.ok) throw new Error(`Baltic Tennis login page HTTP ${page.status}`);
    const $ = cheerio.load(await page.text());
    const form = $('input[name="LoginForm[var_password]"][type="password"]').closest('form');
    if (!form.length) throw new Error('Baltic Tennis login form was not found');
    const body = new URLSearchParams();
    form.find('input[type="hidden"][name]').each((_, input) => {
      body.set($(input).attr('name')!, $(input).attr('value') || '');
    });
    body.set('LoginForm[var_login]', this.username);
    body.set('LoginForm[var_password]', this.password);
    const response = await this.request('/user/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://savitarna.baltictennis.lt',
        Referer: 'https://savitarna.baltictennis.lt/user/login',
      },
      body: body.toString(),
    });
    if (![302, 303].includes(response.status)) {
      if (!response.ok) throw new Error(`Baltic Tennis login HTTP ${response.status}`);
      throw new Error('Baltic Tennis login failed — check username and password');
    }
    const target = new URL(response.headers.get('location') || '/user/login', 'https://savitarna.baltictennis.lt');
    if (target.origin !== 'https://savitarna.baltictennis.lt' || target.pathname.includes('/user/login') || !this.cookies.get('PHPSESSID')) {
      throw new Error('Baltic Tennis login failed — unexpected redirect or missing session');
    }
    this.authenticated = true;
  }

  private parseHTML(html: string, date: string): TimeSlot[] {
    const $ = cheerio.load(html);

    // Validate the response contains the expected court table
    const table = $('table.rbt-table');
    if (table.length === 0) {
      if (html.length < 100) {
        throw new Error(`Response too short (${html.length} bytes) and contains no court data`);
      }
      throw new Error('Response does not contain court table — unexpected page returned');
    }

    // Each row in rbt-table tbody = one court
    const rows = table.find('tbody tr');

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

        const available = !$cell.hasClass('past') && !$cell.hasClass('booking-slot-na') &&
          ($cell.hasClass('booking-slot-available') || $cell.hasClass('empty'));
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
            allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!));
            blockStart = entry.time;
            blockEnd = this.addMinutes(entry.time, 30);
            courtId = entry.courtId;
          }
        } else {
          if (blockStart !== null) {
            allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!));
            blockStart = null;
            blockEnd = null;
          }
        }
      }

      // Flush last block
      if (blockStart !== null) {
        allSlots.push(this.makeSlot(courtId, courtName, date, blockStart, blockEnd!));
      }
    });

    return allSlots;
  }

  private makeSlot(courtId: string, courtName: string, date: string, startTime: string, endTime: string): TimeSlot {
    return {
      courtId: `bt-${courtId}`,
      courtName,
      date,
      startTime: startTime.padStart(5, '0'),
      endTime: endTime.padStart(5, '0'),
      durationMinutes: this.diffMinutes(startTime, endTime),
      status: 'available',
      provider: 'BT',
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
