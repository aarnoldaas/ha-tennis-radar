export class PollingManager {
    pollFn;
    config;
    timeoutId = null;
    running = false;
    pollInProgress = false;
    consecutiveFailures = 0;
    currentIntervalMs;
    constructor(pollFn, config) {
        this.pollFn = pollFn;
        this.config = {
            intervalMs: config.intervalMs,
            maxConsecutiveFailures: config.maxConsecutiveFailures ?? 10,
            backoffMultiplier: config.backoffMultiplier ?? 2,
            maxBackoffMs: config.maxBackoffMs ?? 300_000,
        };
        this.currentIntervalMs = this.config.intervalMs;
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        this.consecutiveFailures = 0;
        this.currentIntervalMs = this.config.intervalMs;
        console.log(`[Poller] Starting with interval ${this.config.intervalMs}ms`);
        this.executePoll();
    }
    async stop() {
        this.running = false;
        if (this.timeoutId)
            clearTimeout(this.timeoutId);
        while (this.pollInProgress) {
            await new Promise(r => setTimeout(r, 100));
        }
        console.log('[Poller] Stopped.');
    }
    updateInterval(ms) {
        this.config.intervalMs = ms;
        this.currentIntervalMs = ms;
        if (this.running && this.timeoutId && !this.pollInProgress) {
            clearTimeout(this.timeoutId);
            this.scheduleNext();
        }
    }
    async executePoll() {
        if (!this.running || this.pollInProgress)
            return;
        this.pollInProgress = true;
        try {
            await this.pollFn();
            this.consecutiveFailures = 0;
            this.currentIntervalMs = this.config.intervalMs;
        }
        catch (err) {
            this.consecutiveFailures++;
            console.error(`[Poller] Poll failed (${this.consecutiveFailures}x):`, err);
            this.currentIntervalMs = Math.min(this.config.intervalMs *
                this.config.backoffMultiplier ** this.consecutiveFailures, this.config.maxBackoffMs);
            console.warn(`[Poller] Backing off to ${this.currentIntervalMs}ms`);
            if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
                console.error('[Poller] Max consecutive failures reached — polling stopped.');
                this.running = false;
            }
        }
        finally {
            this.pollInProgress = false;
        }
        this.scheduleNext();
    }
    scheduleNext() {
        if (!this.running)
            return;
        this.timeoutId = setTimeout(() => this.executePoll(), this.currentIntervalMs);
    }
}
//# sourceMappingURL=polling.js.map