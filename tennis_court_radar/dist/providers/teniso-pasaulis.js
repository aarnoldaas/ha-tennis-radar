export class TenisoPasaulisProvider {
    sessionToken;
    salePoint;
    places;
    name = 'Teniso Pasaulis';
    key = 'teniso_pasaulis';
    constructor(sessionToken, salePoint = 1, places = Array.from({ length: 28 }, (_, i) => i + 1)) {
        this.sessionToken = sessionToken;
        this.salePoint = salePoint;
        this.places = places;
    }
    async getAvailability(date) {
        const response = await fetch('https://ws.tenisopasaulis.lt/api/v1/placeInfoBatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                places: this.places,
                dates: [date],
                salePoint: this.salePoint,
                sessionToken: this.sessionToken,
            }),
        });
        if (!response.ok) {
            throw new Error(`Teniso Pasaulis API returned ${response.status}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await response.json();
        console.log('[TenisoPasaulis] Raw response sample:', JSON.stringify(result).slice(0, 2000));
        return this.parseResponse(result, date);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseResponse(result, date) {
        const slots = [];
        // Adapt to actual response structure — verify with DevTools
        // Trying common patterns: result.data[], result[], or result.places[]
        const places = result?.data ?? result?.places ?? (Array.isArray(result) ? result : []);
        for (const place of places) {
            if (!place || typeof place !== 'object')
                continue;
            const placeId = String(place.placeId ?? place.id ?? '');
            const placeName = place.placeName ?? place.name ?? `Court ${placeId}`;
            const placeSlots = place.slots ?? place.times ?? place.schedule ?? [];
            for (const slot of placeSlots) {
                if (!slot || typeof slot !== 'object')
                    continue;
                const startTime = slot.time ?? slot.startTime ?? slot.start;
                if (!startTime)
                    continue;
                const endTime = slot.endTime ?? slot.end ?? this.addMinutes(startTime, 60);
                const status = this.mapStatus(slot.status ?? slot.state);
                slots.push({
                    courtId: placeId,
                    courtName: placeName,
                    date,
                    startTime,
                    endTime,
                    durationMinutes: this.diffMinutes(startTime, endTime),
                    status,
                    price: slot.price,
                    provider: 'teniso_pasaulis',
                });
            }
        }
        return slots;
    }
    mapStatus(s) {
        const str = String(s ?? '').toLowerCase();
        if (['free', 'available', 'laisva'].includes(str))
            return 'available';
        if (['blocked', 'maintenance', 'closed'].includes(str))
            return 'blocked';
        return 'booked';
    }
    addMinutes(time, mins) {
        const [h, m] = time.split(':').map(Number);
        const total = h * 60 + m + mins;
        return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }
    diffMinutes(a, b) {
        const [ah, am] = a.split(':').map(Number);
        const [bh, bm] = b.split(':').map(Number);
        return (bh * 60 + bm) - (ah * 60 + am);
    }
}
//# sourceMappingURL=teniso-pasaulis.js.map