export class HomeAssistantNotifier {
    token = process.env.SUPERVISOR_TOKEN ?? '';
    baseUrl = 'http://supervisor/core/api';
    notifiedSlots = new Map(); // slotKey -> timestamp
    deduplicationTtlMs = 60 * 60 * 1000; // 1 hour
    async callService(domain, service, data) {
        if (!this.token) {
            console.warn('[Notifier] No SUPERVISOR_TOKEN — logging instead:', JSON.stringify(data));
            return;
        }
        const res = await fetch(`${this.baseUrl}/services/${domain}/${service}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HA API ${res.status}: ${body}`);
        }
    }
    async sendPersistentNotification(message, title, id) {
        await this.callService('persistent_notification', 'create', {
            message,
            title,
            ...(id && { notification_id: id }),
        });
    }
    async sendMobilePush(deviceId, title, message, actions) {
        const data = { title, message };
        if (actions) {
            data.data = { tag: 'tennis-court-radar', actions };
        }
        await this.callService('notify', `mobile_app_${deviceId}`, data);
    }
    async sendCourtAlert(slots, deviceId) {
        // Filter out recently notified slots
        this.pruneExpired();
        const newSlots = slots.filter(s => {
            const key = this.slotKey(s);
            return !this.notifiedSlots.has(key);
        });
        if (newSlots.length === 0) {
            console.log('[Notifier] All matching slots already notified recently, skipping.');
            return;
        }
        const lines = newSlots.slice(0, 10).map(s => `**${s.courtName}** ${s.startTime}–${s.endTime} on ${s.date} (${s.provider})`);
        const message = `${newSlots.length} court(s) available:\n${lines.join('\n')}`;
        const title = 'Tennis Court Available!';
        try {
            await this.sendPersistentNotification(message, title, 'tennis_court_alert');
            console.log(`[Notifier] Persistent notification sent: ${newSlots.length} slot(s)`);
        }
        catch (err) {
            console.error('[Notifier] Failed to send persistent notification:', err);
        }
        if (deviceId) {
            try {
                await this.sendMobilePush(deviceId, title, message, [
                    { action: 'OPEN_BOOKING', title: 'Open Booking Site' },
                    { action: 'DISMISS_TENNIS', title: 'Dismiss' },
                ]);
                console.log(`[Notifier] Mobile push sent to ${deviceId}`);
            }
            catch (err) {
                console.error('[Notifier] Failed to send mobile push:', err);
            }
        }
        // Mark slots as notified
        const now = Date.now();
        for (const s of newSlots) {
            this.notifiedSlots.set(this.slotKey(s), now);
        }
    }
    slotKey(slot) {
        return `${slot.provider}:${slot.courtId}:${slot.date}:${slot.startTime}`;
    }
    pruneExpired() {
        const cutoff = Date.now() - this.deduplicationTtlMs;
        for (const [key, ts] of this.notifiedSlots) {
            if (ts < cutoff)
                this.notifiedSlots.delete(key);
        }
    }
}
//# sourceMappingURL=notifications.js.map