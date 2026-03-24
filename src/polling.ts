interface PollingConfig {
  intervalMs: number;
  maxConsecutiveFailures?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

type RequiredPollingConfig = Required<PollingConfig>;

export class PollingManager {
  private config: RequiredPollingConfig;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private pollInProgress = false;
  private consecutiveFailures = 0;
  private currentIntervalMs: number;

  constructor(
    private pollFn: () => Promise<void>,
    config: PollingConfig,
  ) {
    this.config = {
      intervalMs: config.intervalMs,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 10,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxBackoffMs: config.maxBackoffMs ?? 300_000,
    };
    this.currentIntervalMs = this.config.intervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveFailures = 0;
    this.currentIntervalMs = this.config.intervalMs;
    console.log(`[Poller] Starting with interval ${this.config.intervalMs}ms`);
    this.executePoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    while (this.pollInProgress) {
      await new Promise(r => setTimeout(r, 100));
    }
    console.log('[Poller] Stopped.');
  }

  updateInterval(ms: number): void {
    this.config.intervalMs = ms;
    this.currentIntervalMs = ms;
    if (this.running && this.timeoutId && !this.pollInProgress) {
      clearTimeout(this.timeoutId);
      this.scheduleNext();
    }
  }

  private async executePoll(): Promise<void> {
    if (!this.running || this.pollInProgress) return;
    this.pollInProgress = true;

    try {
      await this.pollFn();
      this.consecutiveFailures = 0;
      this.currentIntervalMs = this.config.intervalMs;
    } catch (err) {
      this.consecutiveFailures++;
      console.error(`[Poller] Poll failed (${this.consecutiveFailures}x):`, err);

      this.currentIntervalMs = Math.min(
        this.config.intervalMs *
          this.config.backoffMultiplier ** this.consecutiveFailures,
        this.config.maxBackoffMs,
      );
      console.warn(`[Poller] Backing off to ${this.currentIntervalMs}ms`);

      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        console.error('[Poller] Max consecutive failures reached — polling stopped.');
        this.running = false;
      }
    } finally {
      this.pollInProgress = false;
    }

    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timeoutId = setTimeout(() => this.executePoll(), this.currentIntervalMs);
  }
}
