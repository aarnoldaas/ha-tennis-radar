import { expect, it, vi } from 'vitest';
import { HomeAssistantNotifier } from '../src/notifications.js';
it('includes one cart action and a working booking URI, and deduplicates repeated notifications', async () => {
  const create = vi.fn().mockReturnValue({action:'TENNIS_CART_test',title:'Add to cart (60 min)'});
  const notifier = new HomeAssistantNotifier(create);
  vi.spyOn(notifier,'sendPersistentNotification').mockResolvedValue();
  const push = vi.spyOn(notifier,'sendMobilePush').mockResolvedValue();
  const slots = [{courtId:'121',courtName:'SEB 21',date:'2026-09-10',startTime:'17:00',endTime:'18:00',durationMinutes:60,status:'available' as const,provider:'SEB' as const}];
  await notifier.sendCourtAlert(slots,'test-device');
  expect(push.mock.calls[0][3]).toContainEqual({action:'TENNIS_CART_test',title:'Add to cart (60 min)'});
  expect(push.mock.calls[0][3]).toContainEqual({action:'URI',title:'Open Booking Site',uri:'https://book.sebarena.lt/'});
  await notifier.sendCourtAlert(slots,'test-device');
  expect(create).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledTimes(1);
});
