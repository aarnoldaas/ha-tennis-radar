import { readFileSync } from 'node:fs';
export function loadOptions() {
    return JSON.parse(readFileSync('/data/options.json', 'utf-8'));
}
/**
 * If scan_dates is empty, generate dates for the next 7 days.
 */
export function getEffectiveDates(scanDates) {
    if (scanDates.length > 0)
        return scanDates;
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}
//# sourceMappingURL=config.js.map