import { h, render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';

const BASE = (window as any).INGRESS_PATH || '';

// --- Types ---
interface TimeSlot {
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  provider: string;
}

interface Config {
  poll_interval_seconds: number;
  scan_dates: string[];
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_duration_minutes: number;
  notify_device: string;
  seb_enabled: boolean;
  seb_session_token: string;
  baltic_tennis_enabled: boolean;
  baltic_tennis_username: string;
  baltic_tennis_password: string;
  debug: boolean;
}

// --- API ---
async function fetchStatus() {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchConfig(): Promise<Config> {
  const res = await fetch(`${BASE}/api/config`);
  return res.json();
}

async function saveConfig(config: Config): Promise<boolean> {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const result = await res.json();
  return result.success;
}

async function fetchBookings() {
  const res = await fetch(`${BASE}/api/bookings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function resumeProviders(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/resume`, { method: 'POST' });
  const result = await res.json();
  return result.success;
}

// --- Components ---
function Badge({ variant, children }: { variant: 'ok' | 'error' | 'default'; children: any }) {
  return <span class={`badge badge-${variant}`}>{children}</span>;
}

function Card({ title, children }: { title?: string; children: any }) {
  return (
    <div class="card">
      {title && <div class="card-header">{title}</div>}
      <div class="card-body">{children}</div>
    </div>
  );
}

function SlotTable({ slots }: { slots: TimeSlot[] }) {
  if (!slots || slots.length === 0) {
    return (
      <div class="empty-state">
        <div class="empty-state-icon">🎾</div>
        <p class="empty-state-title">No courts available</p>
        <p class="empty-state-sub">No courts matching your preferences were found. We'll keep checking!</p>
      </div>
    );
  }

  const byDate: Record<string, TimeSlot[]> = {};
  for (const slot of slots) {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot);
  }

  const totalCount = slots.length;

  return (
    <div class="slots-section">
      <div class="slots-summary">
        <span class="slots-count">{totalCount}</span>
        <span class="slots-count-label">court{totalCount !== 1 ? 's' : ''} available</span>
      </div>
      {Object.entries(byDate).sort().map(([date, dateSlots]) => (
        <div class="date-group" key={date}>
          <div class="date-group-header">
            <span class="date-group-title">{formatDate(date)}</span>
            <span class="date-group-count">{dateSlots.length} slot{dateSlots.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="slot-grid">
            {dateSlots
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((s, i) => (
                <div class="slot-card" key={i}>
                  <div class="slot-card-time">
                    <span class="slot-time-range">{s.startTime} – {s.endTime}</span>
                    <span class="slot-duration">{s.durationMinutes} min</span>
                  </div>
                  <div class="slot-card-details">
                    <span class="slot-court-name">{s.courtName}</span>
                    <span class="slot-provider">{s.provider}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        class={`toggle ${checked ? 'toggle-on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span class="toggle-knob" />
      </button>
    </label>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div class="field">
      <label class="field-label">{label}</label>
      {children}
    </div>
  );
}

function DatePicker({ selected, onChange }: { selected: string[]; onChange: (dates: string[]) => void }) {
  // Generate next 14 days starting from tomorrow
  const days: { date: string; label: string; weekday: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    });
  }

  const toggle = (date: string) => {
    if (selected.includes(date)) {
      onChange(selected.filter(d => d !== date));
    } else {
      onChange([...selected, date].sort());
    }
  };

  const isWeekend = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  };

  return (
    <div>
      <div class="date-picker-grid">
        {days.map(d => (
          <button
            type="button"
            key={d.date}
            class={`date-chip ${selected.includes(d.date) ? 'date-chip-selected' : ''} ${isWeekend(d.date) ? 'date-chip-weekend' : ''}`}
            onClick={() => toggle(d.date)}
          >
            <span class="date-chip-weekday">{d.weekday}</span>
            <span class="date-chip-date">{d.label}</span>
          </button>
        ))}
      </div>
      <p class="text-muted" style={{ fontSize: '0.75rem', marginTop: '8px' }}>
        {selected.length === 0
          ? 'No dates selected — scanning next 7 days automatically'
          : `${selected.length} date(s) selected`}
      </p>
    </div>
  );
}

function SettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(console.error);
  }, []);

  const update = useCallback((key: keyof Config, value: any) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const ok = await saveConfig(config);
      setSaveResult(ok ? 'ok' : 'error');
    } catch {
      setSaveResult('error');
    }
    setSaving(false);
    setTimeout(() => setSaveResult(null), 3000);
  };

  if (!config) return <p class="text-muted">Loading settings...</p>;

  return (
    <div class="settings">
      <Card title="Dates to Scan">
        <DatePicker
          selected={config.scan_dates ?? []}
          onChange={dates => update('scan_dates', dates)}
        />
      </Card>

      <Card title="General">
        <div class="field-grid">
          <Field label="Poll Interval (seconds)">
            <input
              type="number" min="10" max="3600"
              value={config.poll_interval_seconds}
              onInput={(e: any) => update('poll_interval_seconds', +e.target.value)}
            />
          </Field>
          <Field label="Preferred Start Time">
            <input
              type="time"
              value={config.preferred_start_time}
              onInput={(e: any) => update('preferred_start_time', e.target.value)}
            />
          </Field>
          <Field label="Preferred End Time">
            <input
              type="time"
              value={config.preferred_end_time}
              onInput={(e: any) => update('preferred_end_time', e.target.value)}
            />
          </Field>
          <Field label="Min Duration (minutes)">
            <input
              type="number" min="30" max="180" step="30"
              value={config.preferred_duration_minutes}
              onInput={(e: any) => update('preferred_duration_minutes', +e.target.value)}
            />
          </Field>
          <Field label="Notify Device">
            <input
              type="text" placeholder="e.g. iphone"
              value={config.notify_device}
              onInput={(e: any) => update('notify_device', e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title="SEB Arena">
        <Toggle
          label="Enabled"
          checked={config.seb_enabled}
          onChange={v => update('seb_enabled', v)}
        />
        {config.seb_enabled && (
          <div class="field-grid" style={{ marginTop: '12px' }}>
            <Field label="Session Token">
              <input
                type="text" autocomplete="off"
                value={config.seb_session_token}
                onInput={(e: any) => update('seb_session_token', e.target.value)}
              />
            </Field>
          </div>
        )}
      </Card>

      <Card title="Baltic Tennis">
        <Toggle
          label="Enabled"
          checked={config.baltic_tennis_enabled}
          onChange={v => update('baltic_tennis_enabled', v)}
        />
        {config.baltic_tennis_enabled && (
          <div class="field-grid" style={{ marginTop: '12px' }}>
            <Field label="Username">
              <input
                type="text" autocomplete="off" placeholder="email@example.com"
                value={config.baltic_tennis_username}
                onInput={(e: any) => update('baltic_tennis_username', e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                type="text" autocomplete="off"
                value={config.baltic_tennis_password}
                onInput={(e: any) => update('baltic_tennis_password', e.target.value)}
              />
            </Field>
          </div>
        )}
      </Card>

      <Card title="Advanced">
        <Toggle
          label="Debug Mode"
          checked={config.debug}
          onChange={v => update('debug', v)}
        />
      </Card>

      <div class="save-bar">
        <button class="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saveResult === 'ok' && <span class="text-success">Settings saved! Changes applied.</span>}
        {saveResult === 'error' && <span class="text-error">Failed to save settings.</span>}
      </div>
    </div>
  );
}

interface BookingItem {
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  price?: string;
  status?: string;
  provider: string;
}

function BookingsPanel() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBookings();
      setBookings(data.bookings ?? []);
      setErrors(data.errors ?? []);
    } catch {
      setErrors(['Failed to fetch bookings']);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p class="text-muted">Loading bookings...</p>;

  return (
    <div>
      {errors.length > 0 && (
        <div class="alert alert-error" style={{ marginBottom: '12px' }}>
          <span class="alert-icon">!</span>
          <div class="alert-content">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        </div>
      )}
      {bookings.length === 0 ? (
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-title">No bookings</p>
          <p class="empty-state-sub">No upcoming court bookings found.</p>
        </div>
      ) : (
        <div class="slots-section">
          <div class="slots-summary">
            <span class="slots-count">{bookings.length}</span>
            <span class="slots-count-label">booking{bookings.length !== 1 ? 's' : ''}</span>
          </div>
          {Object.entries(
            bookings.reduce<Record<string, BookingItem[]>>((acc, b) => {
              (acc[b.date] ??= []).push(b);
              return acc;
            }, {}),
          ).sort().map(([date, items]) => (
            <div class="date-group" key={date}>
              <div class="date-group-header">
                <span class="date-group-title">{formatDate(date)}</span>
                <span class="date-group-count">{items.length} booking{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="slot-grid">
                {items.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((b, i) => (
                  <div class="slot-card slot-card-booked" key={i}>
                    <div class="slot-card-time">
                      <span class="slot-time-range">{b.startTime} – {b.endTime}</span>
                      <span class="slot-duration">{b.durationMinutes} min</span>
                    </div>
                    <div class="slot-card-details">
                      <span class="slot-court-name">{b.courtName}</span>
                      <span class="slot-provider">{b.provider}</span>
                    </div>
                    {(b.price || b.status) && (
                      <div class="slot-card-meta">
                        {b.price && <span>{b.price}</span>}
                        {b.status && <span>{b.status}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button class="btn-refresh" onClick={load} style={{ marginTop: '12px' }}>
        Refresh
      </button>
    </div>
  );
}

function AlertBanner({ variant, children }: { variant: 'warning' | 'error'; children: any }) {
  return (
    <div class={`alert alert-${variant}`}>
      <span class="alert-icon">{variant === 'error' ? '!' : '!'}</span>
      <div class="alert-content">{children}</div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<'courts' | 'bookings' | 'settings'>('courts');
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStatus();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const [resuming, setResuming] = useState(false);

  const handleResume = useCallback(async () => {
    setResuming(true);
    try {
      await resumeProviders();
      await refresh();
    } catch { /* ignore */ }
    setResuming(false);
  }, [refresh]);

  const configWarnings: { field: string; message: string }[] = status?.configWarnings ?? [];
  const providerErrors: { provider: string; date: string; error: string; time: string }[] = status?.providerErrors ?? [];
  const disabledProviders: string[] = status?.disabledProviders ?? [];
  const hasIssues = configWarnings.length > 0 || disabledProviders.length > 0;

  return (
    <div class="app">
      <header>
        <div class="header-left">
          <h1>Tennis Court Radar</h1>
          {error
            ? <Badge variant="error">Error</Badge>
            : hasIssues
              ? <Badge variant="error">Issues</Badge>
              : status
                ? <Badge variant="ok">Running</Badge>
                : <Badge variant="default">Loading...</Badge>
          }
        </div>
        <nav class="tabs">
          <button class={`tab ${tab === 'courts' ? 'active' : ''}`} onClick={() => setTab('courts')}>
            Courts
          </button>
          <button class={`tab ${tab === 'bookings' ? 'active' : ''}`} onClick={() => setTab('bookings')}>
            Bookings
          </button>
          <button class={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Settings
          </button>
        </nav>
      </header>

      {configWarnings.length > 0 && (
        <AlertBanner variant="warning">
          <strong>Configuration issues:</strong>
          <ul class="alert-list">
            {configWarnings.map((w: any, i: number) => <li key={i}>{w.message}</li>)}
          </ul>
        </AlertBanner>
      )}

      {disabledProviders.length > 0 && (
        <AlertBanner variant="error">
          <strong>Disabled providers:</strong>
          <ul class="alert-list">
            {providerErrors.map((e: any, i: number) => (
              <li key={i}>{e.provider} ({e.date}): {e.error}</li>
            ))}
            {disabledProviders
              .filter(name => !providerErrors.some((e: any) => e.provider === name))
              .map((name, i) => <li key={`d-${i}`}>{name}: disabled due to previous error</li>)
            }
          </ul>
          <button class="btn-resume" onClick={handleResume} disabled={resuming}>
            {resuming ? 'Resuming...' : 'Resume All Providers'}
          </button>
        </AlertBanner>
      )}

      {tab === 'courts' && (
        <section>
          <SlotTable slots={status?.availableSlots ?? []} />
          {status?.lastPoll && (
            <div class="fetch-summary">
              <span>Last poll: {new Date(status.lastPoll).toLocaleTimeString()}</span>
              {status.pollStats && (
                <>
                  <span class="fetch-summary-sep">|</span>
                  <span>{status.pollStats.datesChecked} date{status.pollStats.datesChecked !== 1 ? 's' : ''} checked</span>
                  <span class="fetch-summary-sep">|</span>
                  <span>{status.totalSlots} total / {(status.availableSlots ?? []).length} matching</span>
                  <span class="fetch-summary-sep">|</span>
                  <span>{status.pollStats.durationMs}ms</span>
                  {Object.keys(status.pollStats.providerBreakdown ?? {}).length > 0 && (
                    <>
                      <span class="fetch-summary-sep">|</span>
                      <span>
                        {Object.entries(status.pollStats.providerBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'bookings' && <BookingsPanel />}

      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

function mount() {
  const root = document.getElementById('app');
  if (root) {
    render(<App />, root);
  } else {
    // HA ingress may delay DOM — retry when ready
    document.addEventListener('DOMContentLoaded', () => {
      render(<App />, document.getElementById('app')!);
    });
  }
}
mount();
