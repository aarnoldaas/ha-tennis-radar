import { expect, it, vi } from 'vitest';
import { HomeAssistantNotifier } from '../src/notifications.js';
it('includes one cart action and a working booking URI, and deduplicates repeated notifications', async () => {
  const create = vi.fn().mockReturnValue({action:'TENNIS_BOOK_test',title:'Book & pay ≤€100 (60 min)'});
  const notifier = new HomeAssistantNotifier(create);
  vi.spyOn(notifier,'sendPersistentNotification').mockResolvedValue();
  const push = vi.spyOn(notifier,'sendMobilePush').mockResolvedValue();
  const slots = [{courtId:'121',courtName:'SEB 21',date:'2026-09-10',startTime:'17:00',endTime:'18:00',durationMinutes:60,status:'available' as const,provider:'SEB' as const}];
  await notifier.sendCourtAlert(slots,'test-device');
  expect(push.mock.calls[0][3]).toContainEqual({action:'TENNIS_BOOK_test',title:'Book & pay ≤€100 (60 min)'});
  expect(push.mock.calls[0][3]).toContainEqual({action:'URI',title:'Open Booking Site',uri:'https://book.sebarena.lt/'});
  await notifier.sendCourtAlert(slots,'test-device');
  expect(create).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledTimes(1);
});

it('makes payment and the limit explicit in new credit-booking notifications', async () => {
  const notifier = new HomeAssistantNotifier(() => ({action:'TENNIS_BOOK_test',title:'Book & pay ≤€100 (60 min)'}));
  vi.spyOn(notifier,'sendPersistentNotification').mockResolvedValue();
  const push = vi.spyOn(notifier,'sendMobilePush').mockResolvedValue();
  await notifier.sendCourtAlert([{courtId:'145',courtName:'SEB 21',date:'2026-09-16',startTime:'13:00',endTime:'14:00',durationMinutes:60,status:'available',provider:'SEB'}],'test-device');
  expect(push.mock.calls[0][2]).toContain('SEB account credit, up to €100');
  expect(push.mock.calls[0][2]).toContain('This completes a paid booking');
  expect(push.mock.calls[0][3]?.[0]).toEqual({action:'TENNIS_BOOK_test',title:'Book & pay ≤€100 (60 min)'});
});

const slot = {courtId:'121',courtName:'SEB 21',date:'2026-09-10',startTime:'17:00',endTime:'18:00',durationMinutes:60,status:'available' as const,provider:'SEB' as const};
it('retries failed mobile delivery even when the HA panel notification succeeded', async () => {
  const notifier = new HomeAssistantNotifier();
  vi.spyOn(notifier,'sendPersistentNotification').mockResolvedValue();
  const push = vi.spyOn(notifier,'sendMobilePush').mockRejectedValueOnce(new Error('HA unavailable')).mockResolvedValue();
  await notifier.sendCourtAlert([slot],'iphone');
  await notifier.sendCourtAlert([slot],'iphone');
  await notifier.sendCourtAlert([slot],'iphone');
  expect(push).toHaveBeenCalledTimes(2);
});
it('delivers to a newly configured phone after a panel-only alert and after changing phones', async () => {
  const notifier = new HomeAssistantNotifier();
  vi.spyOn(notifier,'sendPersistentNotification').mockResolvedValue();
  const push = vi.spyOn(notifier,'sendMobilePush').mockResolvedValue();
  await notifier.sendCourtAlert([slot]);
  await notifier.sendCourtAlert([slot],'iphone');
  await notifier.sendCourtAlert([slot],'second_iphone');
  expect(push).toHaveBeenCalledTimes(2);
});
it('retries failed panel-only notifications', async () => {
  const notifier = new HomeAssistantNotifier();
  const panel = vi.spyOn(notifier,'sendPersistentNotification').mockRejectedValueOnce(new Error('offline')).mockResolvedValue();
  await notifier.sendCourtAlert([slot]);
  await notifier.sendCourtAlert([slot]);
  await notifier.sendCourtAlert([slot]);
  expect(panel).toHaveBeenCalledTimes(2);
});
it('accepts device suffixes and full service names without duplicating mobile_app', async () => {
  vi.stubEnv('SUPERVISOR_TOKEN','test');
  const fetch = vi.fn().mockImplementation(async () => Response.json([]));
  vi.stubGlobal('fetch',fetch);
  try {
    const notifier = new HomeAssistantNotifier();
    for (const device of ['iphone','mobile_app_iphone',' notify.mobile_app_iphone ']) {
      await notifier.sendMobilePush(device,'Test','Test');
    }
    expect(fetch.mock.calls.every(([url]) => url === 'http://supervisor/core/api/services/notify/mobile_app_iphone')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
});
