import { afterEach, expect, it, vi } from 'vitest';
import { PollingManager } from '../src/polling.js';
afterEach(() => vi.useRealTimers());
it('continues polling after 10 unexpected failures and recovers', async () => {
  vi.useFakeTimers();
  const poll = vi.fn().mockRejectedValue(new Error('Temporary failure'));
  const manager = new PollingManager(poll, {intervalMs: 1000, maxBackoffMs: 1000});
  manager.start();
  await vi.advanceTimersByTimeAsync(12_000);
  expect(poll.mock.calls.length).toBeGreaterThan(10);
  poll.mockResolvedValue(undefined);
  const before = poll.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(poll).toHaveBeenCalledTimes(before + 1);
  await manager.stop();
});
