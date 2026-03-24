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
  teniso_pasaulis_enabled: boolean;
  teniso_pasaulis_session_token: string;
  teniso_pasaulis_sale_point: number;
  teniso_pasaulis_places: string;
  baltic_tennis_enabled: boolean;
  baltic_tennis_session_token: string;
  baltic_tennis_place_ids: string;
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
    return <p class="text-muted">No available courts found matching your preferences.</p>;
  }

  const byDate: Record<string, TimeSlot[]> = {};
  for (const slot of slots) {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot);
  }

  return (
    <div>
      {Object.entries(byDate).sort().map(([date, dateSlots]) => (
        <Card title={formatDate(date)} key={date}>
          <table>
            <thead>
              <tr>
                <th>Court</th>
                <th>Time</th>
                <th>Duration</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {dateSlots
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((s, i) => (
                  <tr key={i}>
                    <td>{s.courtName}</td>
                    <td class="text-mono">{s.startTime} – {s.endTime}</td>
                    <td>{s.durationMinutes} min</td>
                    <td><Badge variant="default">{s.provider}</Badge></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
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

      <Card title="Teniso Pasaulis">
        <Toggle
          label="Enabled"
          checked={config.teniso_pasaulis_enabled}
          onChange={v => update('teniso_pasaulis_enabled', v)}
        />
        {config.teniso_pasaulis_enabled && (
          <div class="field-grid" style={{ marginTop: '12px' }}>
            <Field label="Session Token">
              <input
                type="password" autocomplete="off"
                value={config.teniso_pasaulis_session_token}
                onInput={(e: any) => update('teniso_pasaulis_session_token', e.target.value)}
              />
            </Field>
            <Field label="Sale Point">
              <input
                type="number" min="1"
                value={config.teniso_pasaulis_sale_point}
                onInput={(e: any) => update('teniso_pasaulis_sale_point', +e.target.value)}
              />
            </Field>
            <Field label="Court IDs (comma-separated, empty = all)">
              <input
                type="text" placeholder="e.g. 2, 5, 8"
                value={config.teniso_pasaulis_places}
                onInput={(e: any) => update('teniso_pasaulis_places', e.target.value)}
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
            <Field label="PHPSESSID Token">
              <input
                type="password" autocomplete="off"
                value={config.baltic_tennis_session_token}
                onInput={(e: any) => update('baltic_tennis_session_token', e.target.value)}
              />
            </Field>
            <Field label="Place IDs (comma-separated)">
              <input
                type="text" placeholder="e.g. 1, 2"
                value={config.baltic_tennis_place_ids}
                onInput={(e: any) => update('baltic_tennis_place_ids', e.target.value)}
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

function App() {
  const [tab, setTab] = useState<'courts' | 'settings'>('courts');
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

  return (
    <div class="app">
      <header>
        <div class="header-left">
          <h1>Tennis Court Radar</h1>
          {error
            ? <Badge variant="error">Error</Badge>
            : status
              ? <Badge variant="ok">Running</Badge>
              : <Badge variant="default">Loading...</Badge>
          }
        </div>
        <nav class="tabs">
          <button class={`tab ${tab === 'courts' ? 'active' : ''}`} onClick={() => setTab('courts')}>
            Courts
          </button>
          <button class={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Settings
          </button>
        </nav>
      </header>

      {tab === 'courts' && (
        <section>
          <SlotTable slots={status?.availableSlots ?? []} />
          {status?.lastPoll && (
            <p class="text-muted" style={{ marginTop: '16px', fontSize: '0.8rem' }}>
              Last poll: {new Date(status.lastPoll).toLocaleTimeString()}
            </p>
          )}
        </section>
      )}

      {tab === 'settings' && <SettingsPanel />}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
