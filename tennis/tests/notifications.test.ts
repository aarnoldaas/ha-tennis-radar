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
