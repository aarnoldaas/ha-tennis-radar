import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalticTennisProvider } from '../src/providers/baltic-tennis.js';
import { SebProvider } from '../src/providers/seb.js';
import { CourtProviderManager } from '../src/providers/manager.js';
import { loadOptions } from '../src/utils/config.js';

const loginForm = `<form action="/user/login"><input type="hidden" name="YII_CSRF_TOKEN" value="csrf-form"><input type="password" name="LoginForm[var_password]"></form>`;
const cell = (time: string, cls = 'empty booking-slot-available') => `<td class="${cls}"><a data-time="${time}" data-court="1"></a></td>`;
const calendar = `<table class="rbt-table"><tbody><tr><td><span>Hard 1</span></td>${cell('17:00')}${cell('17:30')}${cell('18:00', 'full booking-slot-na')}${cell('18:30')}${cell('19:00', 'empty booking-slot-available past')}</tr></tbody></table>`;
function mockLogin() {
  return vi.fn()
    .mockResolvedValueOnce(new Response(loginForm, { headers: new Headers([['set-cookie', 'PHPSESSID=initial; Path=/'], ['set-cookie', 'YII_CSRF_TOKEN=csrf-cookie; Path=/']]) }))
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/reservation/short', 'set-cookie': 'PHPSESSID=renewed; Path=/' } }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Baltic Tennis', () => {
  it('submits the CSRF token and its cookie, keeps the rotated session, and parses current calendar markup', async () => {
    const fetch = mockLogin().mockResolvedValue(new Response(calendar));
    vi.stubGlobal('fetch', fetch);
    const slots = await new BalticTennisProvider('user', 'password').getAvailability(['2026-09-10']);
    const post = fetch.mock.calls[1][1];
    expect(new URLSearchParams(post.body).get('YII_CSRF_TOKEN')).toBe('csrf-form');
    expect(post.headers.Cookie).toContain('YII_CSRF_TOKEN=csrf-cookie');
    expect(post.signal).toBeInstanceOf(AbortSignal);
    expect(fetch.mock.calls[2][1].headers.Cookie).toContain('PHPSESSID=renewed');
    expect(slots.map(s => [s.startTime, s.endTime, s.durationMinutes])).toEqual([['17:00', '18:00', 60], ['18:30', '19:00', 30]]);
  });
  it.each([400, 403, 500])('does not treat a login HTTP %s as success', async status => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(loginForm)).mockResolvedValueOnce(new Response('Error', { status }));
    vi.stubGlobal('fetch', fetch);
    await expect(new BalticTennisProvider('user', 'password').getAvailability(['2026-09-10'])).rejects.toThrow(`login HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('shares login between simultaneous availability and booking requests', async () => {
    const fetch = mockLogin().mockImplementation(async url => new Response(String(url).includes('settings') ? '<div id="section1"></div>' : calendar));
    vi.stubGlobal('fetch', fetch);
    const provider = new BalticTennisProvider('user', 'password');
    await Promise.all([provider.getAvailability(['2026-09-10']), provider.getBookings()]);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('renews an expired session once and rejects another login page for bookings', async () => {
    const fetch = mockLogin().mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: '/user/login'}}))
      .mockResolvedValueOnce(new Response(loginForm, {headers: {'set-cookie': 'PHPSESSID=fresh; Path=/'}}))
      .mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: '/reservation/short'}}))
      .mockResolvedValueOnce(new Response(loginForm));
    vi.stubGlobal('fetch', fetch);
    await expect(new BalticTennisProvider('user', 'password').getBookings()).rejects.toThrow('after re-authentication');
    expect(fetch).toHaveBeenCalledTimes(6);
  });
  it('does not mistake navigation text for an expired login', async () => {
    vi.stubGlobal('fetch', mockLogin().mockResolvedValue(new Response(`prisijungimas ${calendar}`)));
    expect(await new BalticTennisProvider('user', 'password').getAvailability(['2026-09-10'])).toHaveLength(2);
  });
});

describe('provider recovery', () => {
  it('keeps retrying SEB after more than 10 bad requests and clears errors on recovery', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response('Bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    const manager = new CourtProviderManager({...loadOptions(), seb_enabled: true, seb_session_token: 'test', baltic_tennis_enabled: false, baltic_tennis_username: '', baltic_tennis_password: ''});
    for (let i = 1; i <= 12; i++) {
      const result = await manager.checkAll(['2026-09-10']);
      expect(result.errors[0].failures).toBe(i);
      expect(manager.disabledProviderNames).toEqual([]);
      expect(manager.hasActiveProviders).toBe(true);
      // Polling inside the backoff preserves the diagnostic without hitting the API.
      expect((await manager.checkAll(['2026-09-10'])).errors).toEqual(result.errors);
      expect(fetch).toHaveBeenCalledTimes(i);
      vi.setSystemTime(Date.parse(result.errors[0].nextRetryAt));
    }
    fetch.mockImplementation(async () => Response.json({data: []}));
    expect((await manager.checkAll(['2026-09-10'])).errors).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(13);
  });
  it('continues checking a healthy provider while another is backing off', async () => {
    vi.spyOn(SebProvider.prototype, 'getAvailability').mockRejectedValue(new Error('HTTP 400'));
    const bt = vi.spyOn(BalticTennisProvider.prototype, 'getAvailability').mockResolvedValue([]);
    const manager = new CourtProviderManager({...loadOptions(), seb_enabled: true, seb_session_token: 'test', baltic_tennis_enabled: true, baltic_tennis_username: 'test', baltic_tennis_password: 'test'});
    await manager.checkAll(['2026-09-10']);
    await manager.checkAll(['2026-09-10']);
    expect(bt).toHaveBeenCalledTimes(2);
    expect(SebProvider.prototype.getAvailability).toHaveBeenCalledTimes(1);
    manager.resumeAll();
    await manager.checkAll(['2026-09-10']);
    expect(SebProvider.prototype.getAvailability).toHaveBeenCalledTimes(2);
  });
  it('rejects SEB error payloads returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({error: 'Invalid session'})));
    const seb = new SebProvider('test');
    await expect(seb.getAvailability(['2026-09-10'])).rejects.toThrow('invalid availability response');
    await expect(seb.getBookings()).rejects.toThrow('invalid bookings response');
  });
});
