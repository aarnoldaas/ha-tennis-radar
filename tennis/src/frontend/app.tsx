import { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  Group,
  Stack,
  SimpleGrid,
  Center,
  Badge,
  Card,
  Paper,
  Text,
  Title,
  Button,
  TextInput,
  NumberInput,
  PasswordInput,
  Switch,
  Checkbox,
  Alert,
  Loader,
  UnstyledButton,
  Select,
  SegmentedControl,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';
import { SEB_PLACE_OPTIONS } from '../providers/seb-places.js';

const BASE = (window as any).INGRESS_PATH || '';

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════
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
  night_poll_interval_seconds: number;
  scan_dates: string[];
  preferred_start_time: string;
  preferred_end_time: string;
  preferred_duration_minutes: number;
  notify_device: string;
  seb_enabled: boolean;
  seb_session_token: string;
  seb_places: number[];
  baltic_tennis_enabled: boolean;
  baltic_tennis_username: string;
  baltic_tennis_password: string;
  debug: boolean;
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

// ════════════════════════════════════════════════════════════
// API functions
// ════════════════════════════════════════════════════════════
async function fetchStatus() {
  const res = await fetch(`${BASE}/api/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchConfig(): Promise<Config> {
  const res = await fetch(`${BASE}/api/config`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function saveConfig(config: Config): Promise<boolean> {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(`Request failed (${res.status})`);
  return true;
}

async function fetchBookings() {
  const res = await fetch(`${BASE}/api/bookings`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function resumeProviders(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/resume`, { method: 'POST' });
  const result = await res.json();
  if (!res.ok || !result.success) throw new Error(`Request failed (${res.status})`);
  return true;
}

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ════════════════════════════════════════════════════════════
// Navigation config
// ════════════════════════════════════════════════════════════
type NavPage = 'tennis-courts' | 'tennis-bookings' | 'settings';

interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Tennis Radar',
    icon: '🎾',
    items: [
      { page: 'tennis-courts', label: 'Find a court', icon: '◉' },
      { page: 'tennis-bookings', label: 'My bookings', icon: '▤' },
    ],
  },
  {
    label: 'Settings',
    icon: '⚙',
    items: [
      { page: 'settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

function getInitialPage(): NavPage {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen');
  if (screen === 'settings') return 'settings';
  if (screen === 'tennis-bookings') return 'tennis-bookings';
  return 'tennis-courts';
}

// ════════════════════════════════════════════════════════════
// Components
// ════════════════════════════════════════════════════════════

function DatePicker({ selected, onChange }: { selected: string[]; onChange: (dates: string[]) => void }) {
  const dateSet = new Set<string>();
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dateSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  // Always include currently-selected dates, even if they fall outside the
  // default 14-day window (e.g. dates further out, or past dates that haven't
  // been deselected yet).
  for (const date of selected) dateSet.add(date);

  const days = [...dateSet]
    .sort()
    .map(date => {
      const d = new Date(date + 'T00:00:00');
      return {
        date,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      };
    });

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
      <Group justify="space-between" mb="sm">
        <Text size="sm" c="dimmed">Choose individual days, or let your search roll forward.</Text>
        <Button variant="light" size="xs" onClick={() => onChange([])}>Use next 7 days</Button>
      </Group>
      <div className="date-picker-grid">
        {days.map(d => (
          <UnstyledButton
            key={d.date}
            aria-pressed={selected.includes(d.date)}
            aria-label={formatDate(d.date)}
            className={`date-chip ${selected.includes(d.date) ? 'date-chip-selected' : ''} ${isWeekend(d.date) ? 'date-chip-weekend' : ''}`}
            onClick={() => toggle(d.date)}
          >
            <Text size="xs" ta="center" opacity={0.7} tt="uppercase" lh={1.2}>
              {d.weekday}
            </Text>
            <Text size="xs" ta="center" fw={600} lh={1.2}>
              {d.label}
            </Text>
          </UnstyledButton>
        ))}
      </div>
      <Text size="xs" c="dimmed" mt="xs" fs="italic">
        {selected.length === 0
          ? 'No dates selected — scanning next 7 days automatically'
          : `${selected.length} date(s) selected`}
      </Text>
    </div>
  );
}

function SlotTable({ slots, hasErrors = false }: { slots: TimeSlot[]; hasErrors?: boolean }) {
  if (!slots || slots.length === 0) {
    return (
      <Center py={48}>
        <Stack align="center" gap="xs">
          <Text size="2.5rem" opacity={0.7}>&#127934;</Text>
          <Text fw={600} size="md">{hasErrors ? 'Availability temporarily incomplete' : 'No courts available'}</Text>
          <Text size="sm" c="dimmed" maw={300} ta="center">
            {hasErrors ? 'Some providers could not be checked. Automatic retries continue.' : "No courts matching your preferences were found. We'll keep checking!"}
          </Text>
        </Stack>
      </Center>
    );
  }

  const byDate: Record<string, TimeSlot[]> = {};
  for (const slot of slots) {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot);
  }

  return (
    <Stack gap="lg">
      <Group gap="xs" align="baseline">
        <Text size="2rem" fw={700} className="lh-mono" style={{ color: 'var(--lh-accent)' }} lh={1}>{slots.length}</Text>
        <Text size="sm" c="dimmed" fw={500}>
          matching time slot{slots.length !== 1 ? 's' : ''}
        </Text>
      </Group>
      {Object.entries(byDate).sort().map(([date, dateSlots]) => (
        <Stack key={date} gap="sm">
          <Group
            justify="space-between"
            pb={6}
            style={{ borderBottom: '1px solid var(--lh-border)' }}
          >
            <Text fw={600} size="sm" c="dimmed">{formatDate(date)}</Text>
            <Badge size="sm" variant="default" radius="xl">
              {dateSlots.length} slot{dateSlots.length !== 1 ? 's' : ''}
            </Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
            {dateSlots
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((s, i) => (
                <Paper key={i} withBorder p="sm" radius="md" className={`slot-card ${s.provider === 'SEB' ? 'lh-provider-seb' : 'lh-provider-baltic'}`}>
                  <Group justify="space-between" mb={4}>
                    <Text className="lh-mono" fw={600} size="sm">
                      {s.startTime} &ndash; {s.endTime}
                    </Text>
                    <Badge size="xs" variant="light" color="gray" radius="xl">
                      {s.durationMinutes} min
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed" truncate>
                      {s.courtName}
                    </Text>
                    <Badge size="xs" variant="dot" color="yellow">
                      {s.provider === 'BT' ? 'Baltic Tennis' : 'SEB Arena'}
                    </Badge>
                  </Group>
                </Paper>
              ))}
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}

function CourtsPanel({ status, onSettings }: { status: any; onSettings: () => void }) {
  const [provider, setProvider] = useState('All venues');
  const [date, setDate] = useState<string | null>(null);
  const slots: TimeSlot[] = status?.availableSlots ?? [];
  const dates = [...new Set(slots.map(slot => slot.date))].sort();
  const visible = slots.filter(slot => (provider === 'All venues' || slot.provider === provider) && (!date || slot.date === date));
  return (
    <>
      <Paper className="search-hero" p="xl" radius="lg" mb="xl" withBorder>
        <div className="court-art" aria-hidden="true"><i /><b /></div>
        <div className="hero-copy">
          <Text className="eyebrow">YOUR NEXT SESSION</Text>
          <Title order={2}>More tennis.<br />Less checking.</Title>
          <Text c="dimmed" size="sm" mt="sm" maw={360}>Your radar keeps looking for courts that fit your schedule. Find your next time on court below.</Text>
          <Button variant="light" mt="lg" onClick={onSettings}>Edit search preferences ↗</Button>
        </div>
      </Paper>
      <Group justify="space-between" mb="lg" className="results-toolbar">
        <SegmentedControl aria-label="Filter by venue" value={provider} onChange={setProvider} data={[{ value: 'All venues', label: 'All venues' }, { value: 'SEB', label: 'SEB Arena' }, { value: 'BT', label: 'Baltic Tennis' }]} />
        <Select aria-label="Filter by date" placeholder="All dates" clearable value={date} onChange={setDate} data={dates.map(value => ({ value, label: formatDate(value) }))} />
      </Group>
      {status?.cart?.actions?.map((action: any) => (
        <Alert key={action.id} mb="md" title={action.state === 'added' ? 'SEB court added to cart' : action.state === 'processing' ? 'Adding SEB court…' : 'SEB cart needs attention'} color={action.state === 'added' ? 'green' : 'yellow'}>
          <Text size="sm">{action.message || 'Checking current availability…'}</Text>
          {action.cartCode && <Text size="sm" mt="xs" style={{overflowWrap: 'anywhere'}}>Cart code: {action.cartCode}</Text>}
          {action.cartUrl && <Button component="a" href={action.cartUrl} target="_blank" rel="noreferrer" variant="light" size="xs" mt="xs">Open SEB cart</Button>}
          <Text size="xs" c="dimmed" mt="xs">On iPhone, open in Safari with the Tennis Radar userscript enabled. It saves the cart in SEB’s local storage. Checkout remains on SEB.</Text>
        </Alert>
      ))}
      {!status ? <Center py={48}><Stack align="center"><Loader size="sm" /><Text c="dimmed">Loading your radar…</Text></Stack></Center>
        : !status.lastPoll && slots.length === 0 ? <Paper p="xl" withBorder ta="center"><Text fw={600}>Waiting for the first scan</Text><Text c="dimmed" size="sm">Results will appear automatically when the scan finishes.</Text></Paper>
        : slots.length > 0 && visible.length === 0 ? <Paper p="xl" withBorder ta="center"><Text fw={600}>No slots match these filters</Text><Button mt="md" variant="light" onClick={() => { setProvider('All venues'); setDate(null); }}>Clear filters</Button></Paper>
        : <SlotTable slots={visible} hasErrors={status?.providerErrors?.length > 0} />}
      {status?.lastPoll && slots.length === 0 && <Center><Button variant="light" onClick={onSettings}>Adjust dates or times</Button></Center>}
      <details className="scan-details"><summary>Scan details & Safari setup</summary>
        <Text size="sm" c="dimmed" mt="sm">Cart notifications: {status?.cart?.connected ? 'connected to Home Assistant' : 'Home Assistant connection unavailable'}.</Text>
        <a href={`${BASE}/seb-cart-handoff.user.js`} target="_blank" rel="noreferrer">Install Safari cart handoff script ↗</a>
      {status?.lastPoll && (
        <Group gap={4} mt="md" wrap="wrap">
          <Text size="xs" c="dimmed">
            Last checked: {new Date(status.lastPoll).toLocaleTimeString()}
          </Text>
          {status.pollStats && (
            <>
              <Text size="xs" c="dimmed" opacity={0.4}>|</Text>
              <Text size="xs" c="dimmed">
                {status.pollStats.datesChecked} date
                {status.pollStats.datesChecked !== 1 ? 's' : ''} checked
              </Text>
              <Text size="xs" c="dimmed" opacity={0.4}>|</Text>
              <Text size="xs" c="dimmed">
                {status.totalSlots} total / {(status.availableSlots ?? []).length} matching
              </Text>
              <Text size="xs" c="dimmed" opacity={0.4}>|</Text>
              <Text size="xs" c="dimmed">{status.pollStats.durationMs}ms</Text>
              {Object.keys(status.pollStats.providerBreakdown ?? {}).length > 0 && (
                <>
                  <Text size="xs" c="dimmed" opacity={0.4}>|</Text>
                  <Text size="xs" c="dimmed">
                    {Object.entries(status.pollStats.providerBreakdown)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}
                  </Text>
                </>
              )}
            </>
          )}
        </Group>
      )}
      </details>
    </>
  );
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

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      {errors.length > 0 && (
        <Alert color="red" variant="light" title="Error">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Alert>
      )}
      {bookings.length === 0 ? (
        <Center py={48}>
          <Stack align="center" gap="xs">
            <Text size="2.5rem" opacity={0.7}>&#128203;</Text>
            <Text fw={600} size="md">{errors.length ? 'Bookings could not be fully checked' : 'Your next session starts here'}</Text>
            <Text size="sm" c="dimmed">{errors.length ? 'Try refreshing to check your bookings again.' : 'Your upcoming bookings will appear here once you book with a connected venue.'}</Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="lg">
          <Group gap="xs" align="baseline">
            <Text size="2rem" fw={700} className="lh-mono" style={{ color: 'var(--lh-accent)' }} lh={1}>
              {bookings.length}
            </Text>
            <Text size="sm" c="dimmed" fw={500}>
              booking{bookings.length !== 1 ? 's' : ''}
            </Text>
          </Group>
          {Object.entries(
            bookings.reduce<Record<string, BookingItem[]>>((acc, b) => {
              (acc[b.date] ??= []).push(b);
              return acc;
            }, {}),
          )
            .sort()
            .map(([date, items]) => (
              <Stack key={date} gap="sm">
                <Group
                  justify="space-between"
                  pb={6}
                  style={{ borderBottom: '1px solid var(--lh-border)' }}
                >
                  <Text fw={600} size="sm" c="dimmed">{formatDate(date)}</Text>
                  <Badge size="sm" variant="default" radius="xl">
                    {items.length} booking{items.length !== 1 ? 's' : ''}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
                  {items
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((b, i) => (
                      <Paper
                        key={i}
                        withBorder
                        p="sm"
                        radius="md"
                        className="slot-card slot-card-booked"
                      >
                        <Group justify="space-between" mb={4}>
                          <Text className="lh-mono" fw={600} size="sm">
                            {b.startTime} &ndash; {b.endTime}
                          </Text>
                          <Badge size="xs" variant="light" color="gray" radius="xl">
                            {b.durationMinutes} min
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="xs" c="dimmed" truncate>
                            {b.courtName}
                          </Text>
                          <Badge size="xs" variant="dot" color="yellow">
                            {b.provider === 'BT' ? 'Baltic Tennis' : 'SEB Arena'}
                          </Badge>
                        </Group>
                        {(b.price || b.status) && (
                          <Group gap="xs" mt={4}>
                            {b.price && (
                              <Text size="xs" c="dimmed">
                                {b.price}
                              </Text>
                            )}
                            {b.status && (
                              <Text size="xs" c="dimmed">
                                {b.status}
                              </Text>
                            )}
                          </Group>
                        )}
                      </Paper>
                    ))}
                </SimpleGrid>
              </Stack>
            ))}
        </Stack>
      )}
      <Button variant="default" size="xs" onClick={load}>
        Refresh
      </Button>
    </Stack>
  );
}

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const load = useCallback(async () => {
    setLoadError(false);
    try { const value = await fetchConfig(); setConfig(value); setSaved(value); }
    catch { setLoadError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = useCallback((key: keyof Config, value: any) => {
    setSaveResult(null);
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev));
  }, []);
  const invalidTime = !!config && (!config.preferred_start_time || !config.preferred_end_time || config.preferred_start_time >= config.preferred_end_time);
  const handleSave = async () => {
    if (!config || invalidTime) return;
    setSaving(true);
    setSaveResult(null);
    try { await saveConfig(config); setSaved(config); setSaveResult('ok'); onSaved(); }
    catch { setSaveResult('error'); }
    setSaving(false);
  };
  if (loadError) return <Alert color="red" title="Settings could not be loaded"><Button variant="light" color="red" onClick={load} mt="sm">Try again</Button></Alert>;
  if (!config) return <Center py="xl"><Loader size="sm" /></Center>;
  return (
    <Stack gap="lg" className="settings-form">
      <fieldset disabled={saving} className="settings-fields">
      <Card withBorder radius="md" className="lh-card-accent">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">01 / When do you want to play?</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <DatePicker
            selected={config.scan_dates ?? []}
            onChange={dates => update('scan_dates', dates)}
          />
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">02 / Your playing preferences</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Earliest start"
              type="time"
              value={config.preferred_start_time}
              onChange={e => update('preferred_start_time', e.currentTarget.value)}
              size="sm"
            />
            <TextInput
              label="Latest finish"
              type="time"
              error={invalidTime ? "Choose a finish time after the start." : undefined}
              value={config.preferred_end_time}
              onChange={e => update('preferred_end_time', e.currentTarget.value)}
              size="sm"
            />
            <NumberInput
              label="Minimum session (minutes)"
              min={30}
              max={180}
              step={30}
              value={config.preferred_duration_minutes}
              onChange={v =>
                update(
                  'preferred_duration_minutes',
                  typeof v === 'number' ? v : config.preferred_duration_minutes,
                )
              }
              size="sm"
            />
          </SimpleGrid>
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600} size="sm">SEB Arena</Text>
            <Switch
              aria-label="Scan SEB Arena"
              checked={config.seb_enabled}
              onChange={e => update('seb_enabled', e.currentTarget.checked)}
              size="sm"
            />
          </Group>
        </Card.Section>
        {config.seb_enabled && (
          <Card.Section inheritPadding py="md">
            <Stack gap="sm">
              <PasswordInput
                label="Session token"
                value={config.seb_session_token}
                onChange={e => update('seb_session_token', e.currentTarget.value)}
                autoComplete="off"
                size="sm"
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>Court groups</Text>
                <Text size="xs" c="dimmed">Which SEB / Bernardinų sodas court types to scan</Text>
                {SEB_PLACE_OPTIONS.map(place => (
                  <Checkbox
                    key={place.id}
                    label={
                      <div><Text size="sm">{place.label}</Text><Text size="xs" c="dimmed">{place.description}</Text></div>
                    }
                    checked={config.seb_places.includes(place.id)}
                    onChange={e => {
                      const next = e.currentTarget.checked
                        ? [...config.seb_places, place.id]
                        : config.seb_places.filter(id => id !== place.id);
                      update('seb_places', next.sort((a, b) => a - b));
                    }}
                    size="sm"
                  />
                ))}
              </Stack>
            </Stack>
          </Card.Section>
        )}
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600} size="sm">Baltic Tennis</Text>
            <Switch
              aria-label="Scan Baltic Tennis"
              checked={config.baltic_tennis_enabled}
              onChange={e => update('baltic_tennis_enabled', e.currentTarget.checked)}
              size="sm"
            />
          </Group>
        </Card.Section>
        {config.baltic_tennis_enabled && (
          <Card.Section inheritPadding py="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Username"
                placeholder="email@example.com"
                value={config.baltic_tennis_username}
                onChange={e => update('baltic_tennis_username', e.currentTarget.value)}
                autoComplete="off"
                size="sm"
              />
              <PasswordInput
                label="Password"
                value={config.baltic_tennis_password}
                onChange={e => update('baltic_tennis_password', e.currentTarget.value)}
                autoComplete="off"
                size="sm"
              />
            </SimpleGrid>
          </Card.Section>
        )}
      </Card>

      <Card withBorder radius="md">
        <Text fw={600} mb="md">Notifications & scanning</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <NumberInput
              label="Check every (seconds)"
              min={10}
              max={3600}
              value={config.poll_interval_seconds}
              onChange={v =>
                update('poll_interval_seconds', typeof v === 'number' ? v : config.poll_interval_seconds)
              }
              size="sm"
            />
            <NumberInput label="Night checks (seconds)" description="23:00–08:00, server local time" min={10} max={86400} value={config.night_poll_interval_seconds} onChange={v => update('night_poll_interval_seconds', typeof v === 'number' ? v : config.night_poll_interval_seconds)} />
            <TextInput
              label="Mobile notification device"
              placeholder="e.g. iphone"
              description="Device suffix from your Home Assistant mobile_app notification service. Leave blank for HA notifications only."
              value={config.notify_device}
              onChange={e => update('notify_device', e.currentTarget.value)}
              size="sm"
            />
        </SimpleGrid>
        <details className="scan-details"><summary>Advanced options</summary><Switch mt="md" label="Debug logging" description="Include detailed diagnostics in add-on logs." checked={config.debug} onChange={e => update('debug', e.currentTarget.checked)} /></details>
      </Card>
      </fieldset>
      <Group justify="space-between" className="save-bar">
        <div role="status" aria-live="polite">
          <Text size="sm" fw={600}>{saveResult === 'ok' ? 'Preferences saved' : dirty ? 'You have unsaved changes' : 'Your preferences are up to date'}</Text>
          <Text size="xs" c={saveResult === 'error' ? 'red' : 'dimmed'}>{saveResult === 'error' ? 'Could not save. Your edits are still here. Try again.' : 'Saved changes apply to the radar immediately.'}</Text>
        </div>
        <Group gap="xs">
          {dirty && <Button variant="default" disabled={saving} onClick={() => { setConfig(saved); setSaveResult(null); }}>Discard</Button>}
          <Button onClick={handleSave} loading={saving} disabled={!dirty || invalidTime}>Save preferences</Button>
        </Group>
      </Group>
    </Stack>
  );
}

function Sidebar({ activePage, onNavigate, statusBadge }: {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  statusBadge: React.ReactNode;
}) {
  return (
    <nav className="lh-sidebar">
      <div className="lh-sidebar-brand">
        <span className="brand-mark" aria-hidden="true">◉</span><h3>Tennis Radar</h3><Text size="xs" c="dimmed" mt={6}>Make time for your game.</Text>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.label} className="lh-sidebar-section">
          <div className="lh-sidebar-section-label">
            <span className="lh-nav-icon">{group.icon}</span> {group.label}
            {group.label === 'Tennis Radar' && (
              <span style={{ marginLeft: 8, display: 'inline-flex' }}>{statusBadge}</span>
            )}
          </div>
          {group.items.map(item => (
            <button
              key={item.page}
              aria-current={activePage === item.page ? 'page' : undefined}
              className={`lh-nav-item ${activePage === item.page ? 'lh-nav-item-active' : ''}`}
              onClick={() => onNavigate(item.page)}
            >
              <span className="lh-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function BottomTabs({ activePage, onNavigate }: {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}) {
  const tabs: { icon: string; label: string; defaultPage: NavPage }[] = [
    { icon: '◉', label: 'Courts', defaultPage: 'tennis-courts' },
    { icon: '▤', label: 'Bookings', defaultPage: 'tennis-bookings' },
    { icon: '⚙', label: 'Settings', defaultPage: 'settings' },
  ];

  return (
    <div className="lh-bottom-tabs">
      <div className="lh-bottom-tabs-inner">
        {tabs.map(tab => (
          <button
            key={tab.defaultPage}
            aria-current={activePage === tab.defaultPage ? 'page' : undefined}
            className={`lh-bottom-tab ${activePage === tab.defaultPage ? 'lh-bottom-tab-active' : ''}`}
            onClick={() => onNavigate(tab.defaultPage)}
          >
            <span className="lh-bottom-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<NavPage>(getInitialPage);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState(false);
  const [resumeError, setResumeError] = useState(false);
  const [resuming, setResuming] = useState(false);

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

  const navigate = useCallback((newPage: NavPage) => {
    setPage(newPage);
    const url = new URL(window.location.href);
    url.searchParams.delete('screen');
    if (newPage === 'settings') url.searchParams.set('screen', 'settings');
    else if (newPage === 'tennis-bookings') url.searchParams.set('screen', 'tennis-bookings');
    window.history.replaceState({}, '', url.toString());
  }, []);

  const handleResume = useCallback(async () => {
    setResuming(true);
    setResumeError(false);
    try {
      await resumeProviders();
      await refresh();
    } catch {
      setResumeError(true);
    }
    setResuming(false);
  }, [refresh]);

  const configWarnings: { field: string; message: string }[] = status?.configWarnings ?? [];
  const providerErrors: { provider: string; date: string; error: string; time: string; nextRetryAt?: string }[] = status?.providerErrors ?? [];
  const disabledProviders: string[] = status?.disabledProviders ?? [];
  const hasIssues = configWarnings.length > 0 || providerErrors.length > 0 || disabledProviders.length > 0;

  const statusBadge = error ? (
    <span className="lh-status-dot lh-status-dot-red" />
  ) : hasIssues ? (
    <span className="lh-status-dot lh-status-dot-yellow" />
  ) : status ? (
    <span className="lh-status-dot lh-status-dot-green" />
  ) : null;

  const pageTitle = useMemo(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.page === page) return item.label;
      }
    }
    return '';
  }, [page]);

  const renderContent = () => {
    const tennisWarnings = page !== 'settings' && (
      <>
        {configWarnings.length > 0 && (
          <Alert color="yellow" variant="light" title="Configuration issues" mb="md">
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {configWarnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </Alert>
        )}
        {(providerErrors.length > 0 || disabledProviders.length > 0) && (
          <Alert color="red" variant="light" title="Provider connection issues" mb="md">
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {providerErrors.map((e, i) => (
                <li key={i}>
                  {e.provider}: {e.error}
                  {e.nextRetryAt && ` — automatic retry after ${new Date(e.nextRetryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </li>
              ))}
              {disabledProviders
                .filter(name => !providerErrors.some(e => e.provider === name))
                .map((name, i) => (
                  <li key={`d-${i}`}>{name}: disabled due to previous error</li>
                ))}
            </ul>
            <Text size="sm" mt="xs">Affected providers will retry automatically. Results may be incomplete.</Text>
            <Button
              variant="light"
              color="red"
              size="xs"
              mt="sm"
              onClick={handleResume}
              loading={resuming}
            >
              Retry connections
            </Button>
          </Alert>
        )}
      </>
    );

    switch (page) {
      case 'tennis-courts':
        return <>{tennisWarnings}<CourtsPanel status={status} onSettings={() => navigate('settings')} /></>;
      case 'tennis-bookings':
        return <>{tennisWarnings}<BookingsPanel /></>;
      case 'settings':
        return null;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: 220, flexShrink: 0 }} className="lh-sidebar-wrapper">
        <Sidebar activePage={page} onNavigate={navigate} statusBadge={statusBadge} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <main className="lh-content">
          <Group justify="space-between" mb="lg">
            <div><Text className="eyebrow">TENNIS RADAR</Text><Title order={1} size="h2">{pageTitle}</Title><Text c="dimmed" size="sm" mt={4}>{page === 'settings' ? 'Set your schedule. Let the radar do the searching.' : page === 'tennis-bookings' ? 'All your upcoming time on court, in one place.' : 'A good game starts with an open court.'}</Text></div>
            <Badge variant="light" color={error ? 'red' : hasIssues ? 'yellow' : 'teal'} size="lg">{error ? 'Connection lost' : hasIssues ? 'Needs attention' : status ? 'Radar online' : 'Connecting'}</Badge>
          </Group>
          {error && <Alert color="red" title="Cannot reach your radar" mb="md">{status ? 'Showing the last received results. They may be out of date.' : 'Check your connection. We will keep trying automatically.'}<Button variant="light" color="red" size="xs" ml="sm" onClick={refresh}>Try again</Button></Alert>}
          {resumeError && <Alert color="red" mb="md">Could not retry connections. Please try again.</Alert>}
          {renderContent()}
          <div hidden={page !== 'settings'}><SettingsPanel onSaved={refresh} /></div>
        </main>
      </div>

      <BottomTabs activePage={page} onNavigate={navigate} />
    </div>
  );
}

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  headings: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '700',
  },
  colors: {
    yellow: [
      '#fff9e6', '#fff0bf', '#ffe699', '#ffd966', '#ffcc33',
      '#f5a623', '#d48c1a', '#a87216', '#7a5310', '#4d340a',
    ],
  },
  other: {
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  },
});

function mount() {
  const root = document.getElementById('app');
  const app = (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  );
  if (root) {
    createRoot(root).render(app);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createRoot(document.getElementById('app')!).render(app);
    });
  }
}
mount();
