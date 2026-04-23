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
  Alert,
  Loader,
  UnstyledButton,
  Accordion,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

// --- Investment imports ---
import type { InvestmentData } from './investments/types';
import { formatHoldingsForClipboard, timeAgo } from './investments/utils';

import { PortfolioSummaryCard } from './investments/PortfolioSummary';
import { DashboardOverview } from './investments/DashboardOverview';
import { IncomeCard } from './investments/IncomeCard';
import { HoldingsTab } from './investments/HoldingsTab';
import { RealizedPnlTab } from './investments/RealizedPnlTab';
import { AllocationTab } from './investments/AllocationTab';
import { EquityCompTab } from './investments/EquityCompTab';
import { TradeAnalysisTab } from './investments/TradeAnalysisTab';
import { StocksTab } from './investments/StocksTab';
import { TransactionsTab } from './investments/TransactionsTab';
import { MarketDataTab } from './investments/MarketDataTab';
import { StockDetailView } from './investments/StockDetailView';
import { UploadTab } from './investments/UploadTab';
import { PlanTab } from './investments/PlanTab';
import { AiInsightsTab } from './investments/AiInsightsTab';
import { PriceHistoryTab } from './investments/PriceHistoryTab';

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
type NavSection = 'tennis' | 'investments' | 'settings';
type NavPage =
  | 'tennis-courts' | 'tennis-bookings'
  | 'invest-overview' | 'invest-holdings' | 'invest-realized' | 'invest-allocation'
  | 'invest-equity' | 'invest-stocks' | 'invest-trade-analysis' | 'invest-market-data'
  | 'invest-transactions' | 'invest-upload' | 'invest-plan' | 'invest-ai'
  | 'settings';

interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

interface NavGroup {
  section: NavSection;
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'tennis',
    label: 'Tennis Radar',
    icon: '\uD83C\uDFBE',
    items: [
      { page: 'tennis-courts', label: 'Courts', icon: '\uD83C\uDFD3' },
      { page: 'tennis-bookings', label: 'Bookings', icon: '\uD83D\uDCCB' },
    ],
  },
  {
    section: 'investments',
    label: 'Investments',
    icon: '\uD83D\uDCC8',
    items: [
      { page: 'invest-overview', label: 'Overview', icon: '\uD83D\uDCCA' },
      { page: 'invest-holdings', label: 'Holdings', icon: '\uD83D\uDCBC' },
      { page: 'invest-allocation', label: 'Allocation', icon: '\uD83C\uDF10' },
      { page: 'invest-stocks', label: 'Stocks', icon: '\uD83D\uDCC9' },
      { page: 'invest-realized', label: 'Realized P&L', icon: '\uD83D\uDCB0' },
      { page: 'invest-trade-analysis', label: 'Trade Analysis', icon: '\uD83D\uDD0D' },
      { page: 'invest-equity', label: 'Equity Comp', icon: '\uD83C\uDFF7' },
      { page: 'invest-market-data', label: 'Market Data', icon: '\uD83D\uDCC1' },
      { page: 'invest-transactions', label: 'Transactions', icon: '\uD83D\uDDD2' },
      { page: 'invest-plan', label: 'Plan', icon: '\uD83D\uDCDD' },
      { page: 'invest-ai', label: 'AI Insights', icon: '\uD83E\uDD16' },
      { page: 'invest-upload', label: 'Upload', icon: '\uD83D\uDCC2' },
    ],
  },
  {
    section: 'settings',
    label: 'Settings',
    icon: '\u2699',
    items: [
      { page: 'settings', label: 'Settings', icon: '\u2699' },
    ],
  },
];

function sectionForPage(page: NavPage): NavSection {
  if (page.startsWith('tennis')) return 'tennis';
  if (page.startsWith('invest')) return 'investments';
  return 'settings';
}

// Parse initial page from URL
function getInitialPage(): NavPage {
  const path = window.location.pathname.replace(BASE, '').replace(/^\/+/, '');
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen');

  if (path === 'investments' || screen === 'investments') return 'invest-overview';
  if (screen === 'settings') return 'settings';
  return 'tennis-courts';
}

// ════════════════════════════════════════════════════════════
// Components: Tennis
// ════════════════════════════════════════════════════════════

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
        <Text size="2rem" fw={700} className="lh-mono" style={{ color: 'var(--lh-accent)' }} lh={1}>{slots.length}</Text>
        <Text size="sm" c="dimmed" fw={500}>
          court{slots.length !== 1 ? 's' : ''} available
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

function CourtsPanel({ status }: { status: any }) {
  return (
    <>
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
            <Text fw={600} size="md">No bookings</Text>
            <Text size="sm" c="dimmed">No upcoming court bookings found.</Text>
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

// ════════════════════════════════════════════════════════════
// Components: Settings
// ════════════════════════════════════════════════════════════

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
      <Card withBorder radius="md" className="lh-card-accent">
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

      <Accordion variant="separated" radius="md">
        <Accordion.Item value="seb">
          <Accordion.Control>
            <Text fw={600} size="sm">SEB Arena</Text>
          </Accordion.Control>
          <Accordion.Panel>
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
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="baltic">
          <Accordion.Control>
            <Text fw={600} size="sm">Baltic Tennis</Text>
          </Accordion.Control>
          <Accordion.Panel>
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
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="advanced">
          <Accordion.Control>
            <Text fw={600} size="sm">Advanced</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Switch
                label="Debug Mode"
                checked={config.debug}
                onChange={e => update('debug', e.currentTarget.checked)}
                size="sm"
              />
              <PasswordInput
                label="Anthropic API Key"
                description="Required for AI portfolio insights"
                placeholder="sk-ant-..."
                value={config.anthropic_api_key}
                onChange={e => update('anthropic_api_key', e.currentTarget.value)}
                size="sm"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

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

// ════════════════════════════════════════════════════════════
// Components: Investments Content
// ════════════════════════════════════════════════════════════

function InvestmentsContent({ page, investData, loadData }: {
  page: NavPage;
  investData: InvestmentData | null;
  loadData: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${BASE}/api/investments/refresh`, { method: 'POST' });
      const result = await res.json();
      if (result.success && result.data) {
        // Trigger parent reload
        loadData();
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  if (!investData) {
    return (
      <Center py="xl"><Loader size="sm" /></Center>
    );
  }

  // If a stock detail is selected, show it
  if (selectedStock) {
    return <StockDetailView ticker={selectedStock} data={investData} onBack={() => setSelectedStock(null)} />;
  }

  const d = investData;

  // Top bar with actions (only on overview)
  const actionBar = page === 'invest-overview' ? (
    <Group gap="sm" mb="md">
      <Button variant="light" size="xs" loading={refreshing} onClick={handleRefresh}>
        Refresh Prices
      </Button>
      {d.holdings.length > 0 && (
        <Button
          variant="light"
          size="xs"
          color={copied ? 'green' : 'gray'}
          onClick={() => {
            navigator.clipboard.writeText(formatHoldingsForClipboard(d.holdings));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied!' : 'Copy Holdings'}
        </Button>
      )}
      {d.priceRefreshTime && (
        <Text size="xs" c="dimmed">Prices: {timeAgo(d.priceRefreshTime)}</Text>
      )}
    </Group>
  ) : null;

  switch (page) {
    case 'invest-overview':
      return (
        <>
          {actionBar}
          <PortfolioSummaryCard data={d} />
          {d.riskWarnings && d.riskWarnings.length > 0 && (
            <Stack gap="xs" mb="md">
              {d.riskWarnings.map((w, i) => (
                <Alert key={i} color={w.severity === 'warning' ? 'orange' : 'blue'} variant="light">
                  {w.message}
                </Alert>
              ))}
            </Stack>
          )}
          <DashboardOverview data={d} />
          <IncomeCard data={d} />
        </>
      );
    case 'invest-holdings':
      return d.holdings.length > 0
        ? <Card padding="xs"><HoldingsTab holdings={d.holdings} onSelectStock={setSelectedStock} /></Card>
        : <Text c="dimmed">No holdings found.</Text>;
    case 'invest-realized':
      return d.realizedTrades.length > 0
        ? <Card padding="xs"><RealizedPnlTab trades={d.realizedTrades} /></Card>
        : <Text c="dimmed">No realized trades found.</Text>;
    case 'invest-allocation':
      return d.allocation
        ? <AllocationTab allocation={d.allocation} />
        : <Text c="dimmed">No allocation data.</Text>;
    case 'invest-equity':
      return <EquityCompTab rsu={d.rsuCompensation} espp={d.esppSummary} rsuByYearWithCumulative={d.rsuByYearWithCumulative} />;
    case 'invest-stocks':
      return <Card padding="xs"><StocksTab data={d} onSelectStock={setSelectedStock} /></Card>;
    case 'invest-trade-analysis':
      return <TradeAnalysisTab data={d} onSelectStock={setSelectedStock} />;
    case 'invest-market-data':
      return (
        <Stack gap="md">
          <Card padding="md"><MarketDataTab data={d} onSelectStock={setSelectedStock} /></Card>
          <PriceHistoryTab allTickers={Object.keys(d.priceHistory)} />
        </Stack>
      );
    case 'invest-transactions':
      return d.transactions.length > 0
        ? <Card padding="xs"><TransactionsTab transactions={d.transactions} /></Card>
        : <Text c="dimmed">No transactions found.</Text>;
    case 'invest-upload':
      return <UploadTab onDataChange={loadData} />;
    case 'invest-plan':
      return <PlanTab />;
    case 'invest-ai':
      return <Card padding="md"><AiInsightsTab /></Card>;
    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════
// Sidebar Component
// ════════════════════════════════════════════════════════════

function Sidebar({ activePage, onNavigate, statusBadge }: {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  statusBadge: React.ReactNode;
}) {
  const activeSection = sectionForPage(activePage);

  return (
    <nav className="lh-sidebar">
      <div className="lh-sidebar-brand">
        <h3>Life Helper</h3>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.section} className="lh-sidebar-section">
          <div className="lh-sidebar-section-label">
            <span className="lh-nav-icon">{group.icon}</span> {group.label}
            {group.section === 'tennis' && activeSection === 'tennis' && (
              <span style={{ marginLeft: 8, display: 'inline-flex' }}>{statusBadge}</span>
            )}
          </div>
          {group.items.map(item => (
            <button
              key={item.page}
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

// ════════════════════════════════════════════════════════════
// Bottom Tabs (Mobile)
// ════════════════════════════════════════════════════════════

function BottomTabs({ activePage, onNavigate }: {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}) {
  const activeSection = sectionForPage(activePage);
  const tabs: { section: NavSection; icon: string; label: string; defaultPage: NavPage }[] = [
    { section: 'tennis', icon: '\uD83C\uDFBE', label: 'Tennis', defaultPage: 'tennis-courts' },
    { section: 'investments', icon: '\uD83D\uDCC8', label: 'Invest', defaultPage: 'invest-overview' },
    { section: 'settings', icon: '\u2699', label: 'Settings', defaultPage: 'settings' },
  ];

  return (
    <div className="lh-bottom-tabs">
      <div className="lh-bottom-tabs-inner">
        {tabs.map(tab => (
          <button
            key={tab.section}
            className={`lh-bottom-tab ${activeSection === tab.section ? 'lh-bottom-tab-active' : ''}`}
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

// ════════════════════════════════════════════════════════════
// Sub-navigation for Investment pages (mobile)
// ════════════════════════════════════════════════════════════

function InvestSubNav({ activePage, onNavigate }: { activePage: NavPage; onNavigate: (page: NavPage) => void }) {
  const investItems = NAV_GROUPS.find(g => g.section === 'investments')!.items;
  return (
    <div className="lh-sub-nav" style={{ marginBottom: 16 }}>
      {investItems.map(item => (
        <button
          key={item.page}
          className={`lh-sub-nav-item ${activePage === item.page ? 'lh-sub-nav-item-active' : ''}`}
          onClick={() => onNavigate(item.page)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Main App
// ════════════════════════════════════════════════════════════

function App() {
  const [page, setPage] = useState<NavPage>(getInitialPage);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState(false);
  const [resuming, setResuming] = useState(false);

  // Investment data (loaded lazily)
  const [investData, setInvestData] = useState<InvestmentData | null>(null);
  const [investLoading, setInvestLoading] = useState(false);

  const activeSection = sectionForPage(page);

  // Tennis polling
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

  // Load investment data when navigating to investments
  const loadInvestData = useCallback(() => {
    setInvestLoading(true);
    fetch(`${BASE}/api/investments`)
      .then(r => r.json())
      .then(d => { setInvestData(d); setInvestLoading(false); })
      .catch(() => { setInvestLoading(false); });
  }, []);

  useEffect(() => {
    if (activeSection === 'investments' && !investData && !investLoading) {
      loadInvestData();
    }
  }, [activeSection, investData, investLoading, loadInvestData]);

  // Navigation
  const navigate = useCallback((newPage: NavPage) => {
    setPage(newPage);
    const url = new URL(window.location.href);
    // Clean up old params
    url.searchParams.delete('screen');
    // Update path based on section
    const basePath = BASE || '';
    if (newPage.startsWith('invest')) {
      url.pathname = basePath + '/investments';
    } else {
      url.pathname = basePath + '/';
      if (newPage === 'settings') url.searchParams.set('screen', 'settings');
      else if (newPage === 'tennis-bookings') url.searchParams.set('screen', 'tennis-bookings');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

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

  // Status badge
  const configWarnings: { field: string; message: string }[] = status?.configWarnings ?? [];
  const providerErrors: { provider: string; date: string; error: string; time: string }[] = status?.providerErrors ?? [];
  const disabledProviders: string[] = status?.disabledProviders ?? [];
  const hasIssues = configWarnings.length > 0 || disabledProviders.length > 0;

  const statusBadge = error ? (
    <span className="lh-status-dot lh-status-dot-red" />
  ) : hasIssues ? (
    <span className="lh-status-dot lh-status-dot-yellow" />
  ) : status ? (
    <span className="lh-status-dot lh-status-dot-green" />
  ) : null;

  // Page title
  const pageTitle = useMemo(() => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.page === page) return item.label;
      }
    }
    return '';
  }, [page]);

  // Render content based on active page
  const renderContent = () => {
    // Tennis warnings (shown above content)
    const tennisWarnings = activeSection === 'tennis' && (
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
        {disabledProviders.length > 0 && (
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
      </>
    );

    switch (page) {
      case 'tennis-courts':
        return <>{tennisWarnings}<CourtsPanel status={status} /></>;
      case 'tennis-bookings':
        return <>{tennisWarnings}<BookingsPanel /></>;
      case 'settings':
        return <SettingsPanel />;
      default:
        if (page.startsWith('invest')) {
          return (
            <>
              <InvestSubNav activePage={page} onNavigate={navigate} />
              {investLoading && !investData ? (
                <Center py="xl"><Loader size="sm" /></Center>
              ) : (
                <InvestmentsContent page={page} investData={investData} loadData={loadInvestData} />
              )}
            </>
          );
        }
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      <div style={{ width: 220, flexShrink: 0 }} className="lh-sidebar-wrapper">
        <Sidebar activePage={page} onNavigate={navigate} statusBadge={statusBadge} />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lh-content" key={page}>
          <Group justify="space-between" mb="lg">
            <Title order={4}>{pageTitle}</Title>
          </Group>
          {renderContent()}
        </div>
      </div>

      {/* Mobile Bottom Tabs */}
      <BottomTabs activePage={page} onNavigate={navigate} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Theme & Mount
// ════════════════════════════════════════════════════════════

const theme = createTheme({
  primaryColor: 'yellow',
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
