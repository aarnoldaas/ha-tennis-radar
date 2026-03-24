import { TenisoPasaulisProvider } from './teniso-pasaulis.js';
import { BalticTennisProvider } from './baltic-tennis.js';
export class CourtProviderManager {
    providers = [];
    constructor(options) {
        if (options.teniso_pasaulis_enabled && options.teniso_pasaulis_session_token) {
            this.providers.push(new TenisoPasaulisProvider(options.teniso_pasaulis_session_token, options.teniso_pasaulis_sale_point, options.teniso_pasaulis_places.length > 0
                ? options.teniso_pasaulis_places
                : undefined));
        }
        if (options.baltic_tennis_enabled) {
            this.providers.push(new BalticTennisProvider(options.baltic_tennis_place_ids));
        }
        console.log(`[ProviderManager] Initialized ${this.providers.length} provider(s): ${this.providers.map(p => p.name).join(', ') || 'none'}`);
    }
    async checkAll(dates) {
        const allSlots = [];
        for (const date of dates) {
            const results = await Promise.allSettled(this.providers.map(p => p.getAvailability(date)));
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    allSlots.push(...result.value);
                }
                else {
                    console.error('[ProviderManager] Provider failed:', result.reason);
                }
            }
        }
        return allSlots;
    }
    get providerCount() {
        return this.providers.length;
    }
    disposeAll() {
        this.providers = [];
    }
}
//# sourceMappingURL=manager.js.map