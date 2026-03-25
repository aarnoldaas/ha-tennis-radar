import * as cheerio from 'cheerio';
import type { ICourtProvider, TimeSlot, Booking } from './types.js';

export class BalticTennisProvider implements ICourtProvider {
  readonly name = 'Baltic Tennis';
  readonly key = 'baltic_tennis' as const;

  private static readonly PLACE_ID = 1;
  private sessionToken: string | null = null;

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
    if (!this.sessionToken) {
      await this.login();
    }

    console.log('[BalticTennis] Fetching bookings...');
    const url = 'https://savitarna.baltictennis.lt/user/settings?orders';
    const response = await fetch(url, {
      headers: { 'Cookie': `PHPSESSID=${this.sessionToken}; _lang=lt` },
      redirect: 'manual',
    });

    if (response.status === 302) {
      // Session expired, re-login and retry
      this.sessionToken = null;
      await this.login();
      const retry = await fetch(url, {
        headers: { 'Cookie': `PHPSESSID=${this.sessionToken}; _lang=lt` },
      });
      if (!retry.ok) throw new Error(`Baltic Tennis bookings HTTP ${retry.status}`);
      return this.parseBookingsHTML(await retry.text());
    }

    if (!response.ok) throw new Error(`Baltic Tennis bookings HTTP ${response.status}`);
    const html = await response.text();

    if (this.isLoginPage(html)) {
      this.sessionToken = null;
      await this.login();
      const retry = await fetch(url, {
        headers: { 'Cookie': `PHPSESSID=${this.sessionToken}; _lang=lt` },
      });
      if (!retry.ok) throw new Error(`Baltic Tennis bookings HTTP ${retry.status}`);
      return this.parseBookingsHTML(await retry.text());
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

  private async fetchWithAuth(formattedDate: string, date: string): Promise<string> {
    if (!this.sessionToken) {
      await this.login();
    }

    const html = await this.fetchPage(formattedDate, date);

    if (this.isLoginPage(html)) {
      console.log(`[BalticTennis] Session expired, re-logging in...`);
      this.sessionToken = null;
      await this.login();
      const retryHtml = await this.fetchPage(formattedDate, date);
      if (this.isLoginPage(retryHtml)) {
        throw new Error('Login failed — still getting login page after re-authentication');
      }
      return retryHtml;
    }

    return html;
  }

  private async fetchPage(formattedDate: string, date: string): Promise<string> {
    const url = `https://savitarna.baltictennis.lt/reservation/short?sDate=${formattedDate}&iPlaceId=${BalticTennisProvider.PLACE_ID}`;
    const headers: Record<string, string> = {};
    if (this.sessionToken) {
      headers['Cookie'] = `PHPSESSID=${this.sessionToken}`;
    }
    console.log(`[BalticTennis] Requesting: ${url}`);
    const response = await fetch(url, { headers, redirect: 'manual' });

    if (!response.ok && response.status !== 302) {
      throw new Error(`Baltic Tennis HTTP ${response.status} for date ${date}`);
    }

    if (response.status === 302) {
      const location = response.headers.get('location') || '';
      if (location.includes('login')) {
        return '<html><title>login</title></html>';
      }
    }

    const html = await response.text();
    console.log(`[BalticTennis] Received ${html.length} bytes`);
    return html;
  }

  private isLoginPage(html: string): boolean {
    const $ = cheerio.load(html);
    const title = $('title').text().trim().toLowerCase();
    const body = $.text().trim();
    return title.includes('login') || body.includes('prisijung') || $('form[action*="login"]').length > 0;
  }

  private async login(): Promise<void> {
    if (!this.username || !this.password) {
      throw new Error('Baltic Tennis credentials not configured — set username and password in settings');
    }

    console.log(`[BalticTennis] Logging in as ${this.username}...`);

    // First GET the login page to obtain a PHPSESSID cookie
    const loginPageRes = await fetch('https://savitarna.baltictennis.lt/user/login', {
      redirect: 'manual',
    });
    const setCookies = loginPageRes.headers.getSetCookie?.() ?? [];
    let sessId = '';
    for (const cookie of setCookies) {
      const match = cookie.match(/PHPSESSID=([^;]+)/);
      if (match) {
        sessId = match[1];
        break;
      }
    }
    if (!sessId) {
      // Try from single set-cookie header
      const raw = loginPageRes.headers.get('set-cookie') || '';
      const match = raw.match(/PHPSESSID=([^;]+)/);
      if (match) sessId = match[1];
    }

    if (!sessId) {
      throw new Error('Failed to obtain session cookie from login page');
    }

    // POST login form
    const body = new URLSearchParams({
      'LoginForm[var_login]': this.username,
      'LoginForm[var_password]': this.password,
    });

    const loginRes = await fetch('https://savitarna.baltictennis.lt/user/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `PHPSESSID=${sessId}; _lang=lt`,
        'Origin': 'https://savitarna.baltictennis.lt',
        'Referer': 'https://savitarna.baltictennis.lt/user/login',
      },
      body: body.toString(),
      redirect: 'manual',
    });

    // Successful login typically returns 302 redirect
    // Check for updated session cookie
    const postCookies = loginRes.headers.getSetCookie?.() ?? [];
    for (const cookie of postCookies) {
      const match = cookie.match(/PHPSESSID=([^;]+)/);
      if (match) {
        sessId = match[1];
        break;
      }
    }
    if (!sessId) {
      const raw = loginRes.headers.get('set-cookie') || '';
      const match = raw.match(/PHPSESSID=([^;]+)/);
      if (match) sessId = match[1];
    }

    // If we got a 200 back (not redirect), login likely failed
    if (loginRes.status === 200) {
      const html = await loginRes.text();
      if (this.isLoginPage(html)) {
        throw new Error('Login failed — invalid username or password');
      }
    }

    this.sessionToken = sessId;
    console.log(`[BalticTennis] Login successful, session: ${sessId.slice(0, 8)}...`);
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
