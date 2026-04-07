import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  Container,
  Group,
  Stack,
  SimpleGrid,
  Center,
  Tabs,
  Badge,
  Card,
  Paper,
  Text,
  Title,
  Button,
  TextInput,
  Textarea,
  NumberInput,
  PasswordInput,
  Switch,
  Alert,
  Loader,
  UnstyledButton,
  Checkbox,
  ActionIcon,
  Progress,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

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
  anthropic_api_key: string;
  alpha_vantage_api_key: string;
  todo_entity_id: string;
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

// --- Todo API ---
interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  description?: string;
}

async function fetchTodos(): Promise<{ items: TodoItem[]; error?: string }> {
  const res = await fetch(`${BASE}/api/todos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function addTodo(summary: string, description?: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary, description }),
  });
  const result = await res.json();
  return result.success;
}

async function updateTodo(uid: string, updates: { rename?: string; status?: string; description?: string }): Promise<boolean> {
  const res = await fetch(`${BASE}/api/todos/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const result = await res.json();
  return result.success;
}

async function removeTodo(uid: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/todos/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
  });
  const result = await res.json();
  return result.success;
}

// --- Helpers ---
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// --- Components ---

function DatePicker({ selected, onChange }: { selected: string[]; onChange: (dates: string[]) => void }) {
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
      <div className="date-picker-grid">
        {days.map(d => (
          <UnstyledButton
            key={d.date}
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
          ? 'No dates selected \u2014 scanning next 7 days automatically'
          : `${selected.length} date(s) selected`}
      </Text>
    </div>
  );
}

function SlotTable({ slots }: { slots: TimeSlot[] }) {
  if (!slots || slots.length === 0) {
    return (
      <Center py={48}>
        <Stack align="center" gap="xs">
          <Text size="2.5rem" opacity={0.7}>&#127934;</Text>
          <Text fw={600} size="md">No courts available</Text>
          <Text size="sm" c="dimmed" maw={300} ta="center">
            No courts matching your preferences were found. We'll keep checking!
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
        <Text size="2rem" fw={700} c="blue" lh={1}>{slots.length}</Text>
        <Text size="sm" c="dimmed" fw={500}>
          court{slots.length !== 1 ? 's' : ''} available
        </Text>
      </Group>
      {Object.entries(byDate).sort().map(([date, dateSlots]) => (
        <Stack key={date} gap="sm">
          <Group
            justify="space-between"
            pb={6}
            style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
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
                <Paper key={i} withBorder p="sm" radius="md" className="slot-card">
                  <Group justify="space-between" mb={4}>
                    <Text ff="monospace" fw={600} size="sm">
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
                    <Badge size="xs" variant="dot" color="blue">
                      {s.provider}
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

function SettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(console.error);
  }, []);

  const update = useCallback((key: keyof Config, value: any) => {
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev));
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

  if (!config) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Dates to Scan</Text>
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
          <Text fw={600} size="sm">General</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <NumberInput
              label="Poll Interval (seconds)"
              min={10}
              max={3600}
              value={config.poll_interval_seconds}
              onChange={v =>
                update('poll_interval_seconds', typeof v === 'number' ? v : config.poll_interval_seconds)
              }
              size="sm"
            />
            <TextInput
              label="Preferred Start Time"
              type="time"
              value={config.preferred_start_time}
              onChange={e => update('preferred_start_time', e.currentTarget.value)}
              size="sm"
            />
            <TextInput
              label="Preferred End Time"
              type="time"
              value={config.preferred_end_time}
              onChange={e => update('preferred_end_time', e.currentTarget.value)}
              size="sm"
            />
            <NumberInput
              label="Min Duration (minutes)"
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
            <TextInput
              label="Notify Device"
              placeholder="e.g. iphone"
              value={config.notify_device}
              onChange={e => update('notify_device', e.currentTarget.value)}
              size="sm"
            />
          </SimpleGrid>
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">SEB Arena</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Switch
            label="Enabled"
            checked={config.seb_enabled}
            onChange={e => update('seb_enabled', e.currentTarget.checked)}
            size="sm"
          />
          {config.seb_enabled && (
            <TextInput
              label="Session Token"
              value={config.seb_session_token}
              onChange={e => update('seb_session_token', e.currentTarget.value)}
              autoComplete="off"
              size="sm"
              mt="sm"
            />
          )}
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Baltic Tennis</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Switch
            label="Enabled"
            checked={config.baltic_tennis_enabled}
            onChange={e => update('baltic_tennis_enabled', e.currentTarget.checked)}
            size="sm"
          />
          {config.baltic_tennis_enabled && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mt="sm">
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
          )}
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Home Building</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <TextInput
            label="Todo Entity ID"
            description="Home Assistant todo entity ID for the home building task list"
            placeholder="todo.01kn1rvcbxskmfdrqfdry7xvkq"
            value={config.todo_entity_id}
            onChange={e => update('todo_entity_id', e.currentTarget.value)}
            size="sm"
          />
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Advanced</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="sm">
            <Switch
              label="Debug Mode"
              checked={config.debug}
              onChange={e => update('debug', e.currentTarget.checked)}
              size="sm"
            />
            <PasswordInput
              label="Anthropic API Key"
              description="Required for AI portfolio insights on the Investments page"
              placeholder="sk-ant-..."
              value={config.anthropic_api_key}
              onChange={e => update('anthropic_api_key', e.currentTarget.value)}
              size="sm"
            />
            <PasswordInput
              label="Alpha Vantage API Key"
              description="Fallback stock price provider (25 free calls/day). Used when Yahoo Finance fails."
              placeholder="Your Alpha Vantage API key"
              value={config.alpha_vantage_api_key}
              onChange={e => update('alpha_vantage_api_key', e.currentTarget.value)}
              size="sm"
            />
          </Stack>
        </Card.Section>
      </Card>

      <Group gap="md" className="save-bar">
        <Button onClick={handleSave} loading={saving} size="sm">
          Save Settings
        </Button>
        {saveResult === 'ok' && (
          <Text size="sm" c="green">
            Settings saved! Changes applied.
          </Text>
        )}
        {saveResult === 'error' && (
          <Text size="sm" c="red">
            Failed to save settings.
          </Text>
        )}
      </Group>
    </Stack>
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
            <Text fw={600} size="md">No bookings</Text>
            <Text size="sm" c="dimmed">No upcoming court bookings found.</Text>
          </Stack>
        </Center>
      ) : (
        <Stack gap="lg">
          <Group gap="xs" align="baseline">
            <Text size="2rem" fw={700} c="blue" lh={1}>
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
                  style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}
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
                          <Text ff="monospace" fw={600} size="sm">
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
                          <Badge size="xs" variant="dot" color="blue">
                            {b.provider}
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

function TodoPanel() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchTodos();
      setItems(data.items ?? []);
      setError(data.error ?? null);
    } catch {
      setError('Failed to fetch todo items');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      await addTodo(newItem.trim(), newDescription.trim() || undefined);
      setNewItem('');
      setNewDescription('');
      await load();
    } catch {
      setError('Failed to add item');
    }
    setAdding(false);
  };

  const handleToggle = async (item: TodoItem) => {
    const newStatus = item.status === 'completed' ? 'needs_action' : 'completed';
    try {
      await updateTodo(item.uid, { status: newStatus });
      await load();
    } catch {
      setError('Failed to update item');
    }
  };

  const handleRemove = async (uid: string) => {
    try {
      await removeTodo(uid);
      await load();
    } catch {
      setError('Failed to remove item');
    }
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  const pending = items.filter(i => i.status === 'needs_action');
  const completed = items.filter(i => i.status === 'completed');
  const total = items.length;
  const completedCount = completed.length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <Stack gap="md">
      {error && (
        <Alert color="red" variant="light" title="Error">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">Progress</Text>
            <Badge variant="light" color={progressPct === 100 ? 'green' : 'blue'}>
              {completedCount} / {total} done ({progressPct}%)
            </Badge>
          </Group>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Progress value={progressPct} color={progressPct === 100 ? 'green' : 'blue'} size="lg" radius="xl" />
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Add Task</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="sm">
            <TextInput
              placeholder="Task name"
              value={newItem}
              onChange={e => setNewItem(e.currentTarget.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              size="sm"
            />
            <Textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={e => setNewDescription(e.currentTarget.value)}
              size="sm"
              autosize
              minRows={1}
              maxRows={3}
            />
            <Button onClick={handleAdd} loading={adding} size="sm" disabled={!newItem.trim()}>
              Add Task
            </Button>
          </Stack>
        </Card.Section>
      </Card>

      {pending.length > 0 && (
        <Card withBorder radius="md">
          <Card.Section withBorder inheritPadding py="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">To Do</Text>
              <Badge size="sm" variant="default" radius="xl">{pending.length}</Badge>
            </Group>
          </Card.Section>
          <Card.Section inheritPadding py="sm">
            <Stack gap={4}>
              {pending.map(item => (
                <Group key={item.uid} gap="sm" wrap="nowrap" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}>
                  <Checkbox
                    checked={false}
                    onChange={() => handleToggle(item)}
                    size="sm"
                  />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm">{item.summary}</Text>
                    {item.description && (
                      <Text size="xs" c="dimmed" lineClamp={2}>{item.description}</Text>
                    )}
                  </Stack>
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleRemove(item.uid)}>
                    <Text size="xs">&#10005;</Text>
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Card.Section>
        </Card>
      )}

      {completed.length > 0 && (
        <Card withBorder radius="md">
          <Card.Section withBorder inheritPadding py="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">Completed</Text>
              <Badge size="sm" variant="default" radius="xl">{completed.length}</Badge>
            </Group>
          </Card.Section>
          <Card.Section inheritPadding py="sm">
            <Stack gap={4}>
              {completed.map(item => (
                <Group key={item.uid} gap="sm" wrap="nowrap" py={4} style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}>
                  <Checkbox
                    checked={true}
                    onChange={() => handleToggle(item)}
                    size="sm"
                  />
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" td="line-through" c="dimmed">{item.summary}</Text>
                    {item.description && (
                      <Text size="xs" c="dimmed" lineClamp={2} td="line-through">{item.description}</Text>
                    )}
                  </Stack>
                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleRemove(item.uid)}>
                    <Text size="xs">&#10005;</Text>
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Card.Section>
        </Card>
      )}

      {items.length === 0 && (
        <Center py={48}>
          <Stack align="center" gap="xs">
            <Text size="2.5rem" opacity={0.7}>&#127968;</Text>
            <Text fw={600} size="md">No tasks yet</Text>
            <Text size="sm" c="dimmed">Add your first home building task above.</Text>
          </Stack>
        </Center>
      )}

      <Button variant="default" size="xs" onClick={load}>
        Refresh
      </Button>
    </Stack>
  );
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const initialScreen = params.get('screen') || 'tennis-radar';
  const [screen, setScreen] = useState<string | null>(initialScreen);
  const [tennisTab, setTennisTab] = useState<string | null>('courts');
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
    } catch {
      /* ignore */
    }
    setResuming(false);
  }, [refresh]);

  const handleScreenChange = useCallback((value: string | null) => {
    if (value === 'investments') {
      window.location.href = `${BASE}/investments`;
      return;
    }
    setScreen(value);
    const url = new URL(window.location.href);
    if (value === 'tennis-radar') {
      url.searchParams.delete('screen');
    } else {
      url.searchParams.set('screen', value || '');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const configWarnings: { field: string; message: string }[] = status?.configWarnings ?? [];
  const providerErrors: { provider: string; date: string; error: string; time: string }[] =
    status?.providerErrors ?? [];
  const disabledProviders: string[] = status?.disabledProviders ?? [];
  const hasIssues = configWarnings.length > 0 || disabledProviders.length > 0;

  const statusBadge = error ? (
    <Badge color="red" variant="light">Error</Badge>
  ) : hasIssues ? (
    <Badge color="red" variant="light">Issues</Badge>
  ) : status ? (
    <Badge color="green" variant="light">Running</Badge>
  ) : (
    <Badge color="gray" variant="light">Loading...</Badge>
  );

  return (
    <Container size="xl" py="md">
      <Stack gap="lg" mb="md">
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Title order={3}>Life Helper</Title>
            {screen === 'tennis-radar' && statusBadge}
          </Group>
        </Group>
        <Tabs value={screen} onChange={handleScreenChange} variant="pills">
          <Tabs.List>
            <Tabs.Tab value="tennis-radar">Tennis Radar</Tabs.Tab>
            <Tabs.Tab value="home-building">Home Building</Tabs.Tab>
            <Tabs.Tab value="settings">Settings</Tabs.Tab>
            <Tabs.Tab value="investments">Investments</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Stack>

      {screen === 'tennis-radar' && configWarnings.length > 0 && (
        <Alert color="yellow" variant="light" title="Configuration issues" mb="md">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {configWarnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {screen === 'tennis-radar' && disabledProviders.length > 0 && (
        <Alert color="red" variant="light" title="Disabled providers" mb="md">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {providerErrors.map((e, i) => (
              <li key={i}>
                {e.provider} ({e.date}): {e.error}
              </li>
            ))}
            {disabledProviders
              .filter(name => !providerErrors.some(e => e.provider === name))
              .map((name, i) => (
                <li key={`d-${i}`}>{name}: disabled due to previous error</li>
              ))}
          </ul>
          <Button
            variant="light"
            color="red"
            size="xs"
            mt="sm"
            onClick={handleResume}
            loading={resuming}
          >
            Resume All Providers
          </Button>
        </Alert>
      )}

      {screen === 'tennis-radar' && (
        <Tabs value={tennisTab} onChange={setTennisTab} variant="outline">
          <Tabs.List mb="md">
            <Tabs.Tab value="courts">Courts</Tabs.Tab>
            <Tabs.Tab value="bookings">Bookings</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="courts">
            <SlotTable slots={status?.availableSlots ?? []} />
            {status?.lastPoll && (
              <Group gap={4} mt="md" wrap="wrap">
                <Text size="xs" c="dimmed">
                  Last poll: {new Date(status.lastPoll).toLocaleTimeString()}
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
          </Tabs.Panel>

          <Tabs.Panel value="bookings">
            <BookingsPanel />
          </Tabs.Panel>
        </Tabs>
      )}

      {screen === 'home-building' && <TodoPanel />}
      {screen === 'settings' && <SettingsPanel />}
    </Container>
  );
}

// --- Theme & Mount ---
const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
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
