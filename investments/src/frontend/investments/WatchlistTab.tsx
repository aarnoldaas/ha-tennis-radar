import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Collapse,
  Group,
  Loader,
  Menu,
  Modal,
  Pill,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { api, type ResearchPayload, type ResearchRow, type UpcomingEvent, type FinnhubSearchHit } from './api';
import { currencyFmt, money, num, pct, pnlColor, signedPct } from './format';

type Filter = 'all' | 'held' | 'watch';

export function WatchlistTab({
  onOpenInstrument,
}: {
  onOpenInstrument: (instrumentId: string) => void;
}) {
  const [data, setData] = useState<ResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [editing, setEditing] = useState<ResearchRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await api.research();
      setData(payload);
    } catch (e: any) {
      setError(e?.message || 'Failed to load research feed');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.refreshResearch();
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    if (filter === 'held') {
      return rows.filter(r => r.kind !== 'watchlist');
    }
    if (filter === 'watch') {
      return rows.filter(r => r.kind !== 'holding');
    }
    return rows;
  }, [data, filter]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = a.marketValueBase ?? -1;
      const bv = b.marketValueBase ?? -1;
      if (av !== bv) return bv - av;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [filteredRows]);

  if (loading && !data) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (error && !data) {
    return <Alert color="red" title="Unable to load research feed">{error}</Alert>;
  }
  if (!data) return null;

  return (
    <Stack gap="md">
      {!data.enabled && (
        <Alert color="blue" variant="light" title="Running on Yahoo Finance only">
          <Text size="xs" mb={4}>
            Fundamentals are coming from Yahoo Finance's public quoteSummary endpoint
            (free, no key required) — covers most US + international listings.
          </Text>
          <Text size="xs" c="dimmed">
            For US stocks you can also add a free Finnhub key in the addon options
            (<Pill mx={4} size="xs">finnhub_api_key</Pill>) — Finnhub publishes
            additional fields like 5-year revenue CAGR and detailed earnings estimates.
            Finnhub's free tier is US-only; non-US holdings will keep using Yahoo.
          </Text>
        </Alert>
      )}
      {data.enabled && (
        <Alert color="gray" variant="light" title="Data sources" withCloseButton={false}>
          <Text size="xs" c="dimmed">
            Finnhub free tier is US-only — for every non-US holding we fall back to
            Yahoo Finance's quoteSummary endpoint. The badge on each row shows which
            provider supplied that row's fundamentals.
          </Text>
        </Alert>
      )}

      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={data.rows.length} />
          <FilterChip
            label="Held"
            active={filter === 'held'}
            onClick={() => setFilter('held')}
            count={data.rows.filter(r => r.kind !== 'watchlist').length}
          />
          <FilterChip
            label="Watch"
            active={filter === 'watch'}
            onClick={() => setFilter('watch')}
            count={data.rows.filter(r => r.kind !== 'holding').length}
          />
        </Group>
        <Group gap="xs">
          <Button
            variant="default"
            size="xs"
            onClick={refresh}
            loading={refreshing}
            disabled={loading}
          >
            Refresh fundamentals
          </Button>
          <Button size="xs" onClick={() => setAddOpen(true)}>
            + Add ticker
          </Button>
        </Group>
      </Group>

      <UpcomingPanel
        upcoming={data.upcoming}
        open={eventsOpen}
        onToggle={() => setEventsOpen(o => !o)}
      />

      {sortedRows.length === 0 ? (
        <Card padding="xl" withBorder>
          <Text size="sm" c="dimmed" ta="center">
            {filter === 'watch'
              ? 'Watchlist is empty. Click "+ Add ticker" to start tracking a stock.'
              : 'No instruments to show with the current filter.'}
          </Text>
        </Card>
      ) : (
        <Card padding={0} withBorder>
          <Table.ScrollContainer minWidth={1280}>
            <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Instrument</Table.Th>
                  <Table.Th ta="right">Price</Table.Th>
                  <Table.Th ta="right">Day %</Table.Th>
                  <Table.Th ta="right">Mkt cap</Table.Th>
                  <Table.Th ta="right">P/E TTM</Table.Th>
                  <Table.Th ta="right">P/E Fwd</Table.Th>
                  <Table.Th ta="right">EPS TTM</Table.Th>
                  <Table.Th ta="right">Div yield</Table.Th>
                  <Table.Th ta="right">Rev YoY</Table.Th>
                  <Table.Th ta="right">EPS YoY</Table.Th>
                  <Table.Th>52w range</Table.Th>
                  <Table.Th>Next earnings</Table.Th>
                  <Table.Th>Next ex-div</Table.Th>
                  <Table.Th>Held</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedRows.map(row => (
                  <ResearchRowView
                    key={row.id}
                    row={row}
                    onOpenInstrument={onOpenInstrument}
                    onEdit={r => setEditing(r)}
                    onRemoved={load}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <AddTickerModal
        opened={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />
      <EditTickerModal
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onRemoved={() => {
          setEditing(null);
          load();
        }}
      />
    </Stack>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <Button
      size="xs"
      variant={active ? 'filled' : 'default'}
      onClick={onClick}
      radius="xl"
    >
      {label} <Text size="xs" component="span" ml={6} c={active ? undefined : 'dimmed'}>{count}</Text>
    </Button>
  );
}

function UpcomingPanel({
  upcoming,
  open,
  onToggle,
}: {
  upcoming: UpcomingEvent[];
  open: boolean;
  onToggle: () => void;
}) {
  if (upcoming.length === 0) return null;
  return (
    <Card padding="sm" withBorder>
      <Group justify="space-between" mb={open ? 'xs' : 0}>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Upcoming events
          </Text>
          <Badge size="sm" variant="light">{upcoming.length}</Badge>
          <Text size="xs" c="dimmed">next 30 days</Text>
        </Group>
        <Button size="xs" variant="subtle" onClick={onToggle}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </Group>
      <Collapse in={open}>
        <Stack gap={4}>
          {upcoming.map((e, idx) => (
            <Group key={`${e.rowId}:${e.kind}:${idx}`} justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <Badge
                  size="xs"
                  variant="light"
                  color={e.kind === 'earnings' ? 'yellow' : 'teal'}
                >
                  {e.kind === 'earnings' ? 'Earnings' : 'Ex-div'}
                </Badge>
                <Text size="xs" fw={600} className="lh-mono">{e.symbol}</Text>
                <Text size="xs" c="dimmed" truncate>{e.displayName}</Text>
              </Group>
              <Group gap="xs" wrap="nowrap">
                {e.detail && <Text size="xs" c="dimmed" className="lh-mono">{e.detail}</Text>}
                <Text size="xs" className="lh-mono">{e.date}</Text>
                <Text size="xs" c="dimmed">
                  {e.daysUntil === 0 ? 'today' : `in ${e.daysUntil}d`}
                </Text>
              </Group>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Card>
  );
}

function ResearchRowView({
  row,
  onOpenInstrument,
  onEdit,
  onRemoved,
}: {
  row: ResearchRow;
  onOpenInstrument: (instrumentId: string) => void;
  onEdit: (row: ResearchRow) => void;
  onRemoved: () => void;
}) {
  const m = row.metric;
  const dayPct = row.dayChangePct;
  const heldBadge = (() => {
    if (row.kind === 'holding') return <Badge size="xs" variant="filled">Held</Badge>;
    if (row.kind === 'both') return <Badge size="xs" variant="filled">Held + Watch</Badge>;
    return <Badge size="xs" variant="default">Watch</Badge>;
  })();
  const sourceBadge = (() => {
    switch (row.fundamentalsSource) {
      case 'finnhub':
        return <SourcePill label="Finnhub" tooltip="Fundamentals from Finnhub" />;
      case 'yahoo':
        return <SourcePill label="Yahoo" tooltip="Fundamentals from Yahoo Finance (Finnhub free tier is US-only)" />;
      case 'mixed':
        return <SourcePill label="Mixed" tooltip="Finnhub for some fields, Yahoo Finance for the rest" />;
      case 'none':
        return <SourcePill label="No data" tooltip="Neither Finnhub nor Yahoo returned fundamentals for this symbol" />;
      case 'disabled':
        return <SourcePill label="No symbol" tooltip="This instrument has no Yahoo / Finnhub mapping" />;
      default:
        return null;
    }
  })();

  const openHoldingDetail = row.id.startsWith('holding:') || row.id.startsWith('both:')
    ? () => onOpenInstrument(row.id.replace(/^[^:]+:/, ''))
    : null;

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} size="sm" className="lh-mono">
            {row.finnhubSymbol ?? row.yahooSymbol ?? '—'}
          </Text>
          <Text size="xs" c="dimmed" truncate>{row.displayName}</Text>
        </Group>
        <Group gap={6} mt={2}>
          {row.sector && (
            <Badge size="xs" variant="default" radius="xl">{row.sector}</Badge>
          )}
          {row.country && (
            <Badge size="xs" variant="default" radius="xl">{row.country}</Badge>
          )}
        </Group>
        {row.notes && (
          <Text size="xs" c="dimmed" mt={2} fs="italic">
            {row.notes}
          </Text>
        )}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {row.price != null && row.priceCurrency
          ? currencyFmt(row.price, row.priceCurrency)
          : '—'}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        <Text size="sm" c={pnlColor(dayPct)} className="lh-mono">
          {dayPct != null ? signedPct(dayPct) : '—'}
        </Text>
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">{compactMoney(m?.marketCap ?? null)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">{num1(m?.peTTM ?? null)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">{num1(m?.peForward ?? null)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">{num2(m?.epsTTM ?? null)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">{pct(m?.dividendYieldAnnual ?? null)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">
        <Text size="sm" c={pnlColor(m?.revenueGrowthTTMYoy ?? null)} className="lh-mono">
          {m?.revenueGrowthTTMYoy != null ? signedPct(m.revenueGrowthTTMYoy) : '—'}
        </Text>
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        <Text size="sm" c={pnlColor(m?.epsGrowthQuarterlyYoy ?? null)} className="lh-mono">
          {m?.epsGrowthQuarterlyYoy != null ? signedPct(m.epsGrowthQuarterlyYoy) : '—'}
        </Text>
      </Table.Td>
      <Table.Td>
        <RangeBar
          low={m?.week52Low ?? null}
          high={m?.week52High ?? null}
          current={row.price}
        />
      </Table.Td>
      <Table.Td>
        <DateCell
          date={row.nextEarnings?.date ?? null}
          extra={
            row.nextEarnings?.epsEstimate != null
              ? `est ${row.nextEarnings.epsEstimate.toFixed(2)}`
              : null
          }
        />
      </Table.Td>
      <Table.Td>
        <DateCell
          date={row.nextExDividend?.date ?? null}
          extra={
            row.nextExDividend && row.nextExDividend.amount > 0
              ? `${row.nextExDividend.amount.toFixed(2)} ${row.nextExDividend.currency ?? ''}`.trim()
              : null
          }
        />
      </Table.Td>
      <Table.Td>
        <Stack gap={2}>
          <Group gap={4} wrap="nowrap">
            {heldBadge}
            {sourceBadge}
          </Group>
          {row.quantity != null && (
            <Text size="xs" c="dimmed" className="lh-mono">
              {num(row.quantity)} · {money(row.marketValueBase)}
            </Text>
          )}
          {row.unrealizedPnlPct != null && (
            <Text size="xs" c={pnlColor(row.unrealizedPnlPct)} className="lh-mono">
              {signedPct(row.unrealizedPnlPct)}
            </Text>
          )}
        </Stack>
      </Table.Td>
      <Table.Td>
        <RowMenu
          row={row}
          onOpenInstrument={openHoldingDetail}
          onEdit={() => onEdit(row)}
          onRemoved={onRemoved}
        />
      </Table.Td>
    </Table.Tr>
  );
}

function RowMenu({
  row,
  onOpenInstrument,
  onEdit,
  onRemoved,
}: {
  row: ResearchRow;
  onOpenInstrument: (() => void) | null;
  onEdit: () => void;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (!row.watchlistId) return;
    setRemoving(true);
    try {
      await api.removeWatchlist(row.watchlistId);
      onRemoved();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" size="sm" disabled={removing}>
          ⋯
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onOpenInstrument && (
          <Menu.Item onClick={onOpenInstrument}>Open instrument detail</Menu.Item>
        )}
        {row.watchlistId && <Menu.Item onClick={onEdit}>Edit notes / symbols</Menu.Item>}
        {row.watchlistId && (
          <Menu.Item color="red" onClick={remove}>
            Remove from watchlist
          </Menu.Item>
        )}
        {row.profile?.weburl && (
          <Menu.Item component="a" href={row.profile.weburl} target="_blank" rel="noreferrer">
            Open company site
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

function RangeBar({
  low,
  high,
  current,
}: {
  low: number | null;
  high: number | null;
  current: number | null;
}) {
  if (low == null || high == null || current == null || high <= low) {
    return <Text size="xs" c="dimmed">—</Text>;
  }
  const pctPos = Math.max(0, Math.min(1, (current - low) / (high - low)));
  return (
    <Tooltip
      label={`Low ${low.toFixed(2)} · Now ${current.toFixed(2)} · High ${high.toFixed(2)}`}
    >
      <Stack gap={2} style={{ minWidth: 100 }}>
        <div
          style={{
            position: 'relative',
            height: 6,
            background: 'var(--mantine-color-dark-5)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${pctPos * 100}%`,
              top: -2,
              width: 2,
              height: 10,
              background: 'var(--mantine-color-yellow-5)',
            }}
          />
        </div>
        <Group gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" className="lh-mono">{low.toFixed(2)}</Text>
          <Text size="xs" c="dimmed" className="lh-mono" ml="auto">{high.toFixed(2)}</Text>
        </Group>
      </Stack>
    </Tooltip>
  );
}

function DateCell({ date, extra }: { date: string | null; extra: string | null }) {
  if (!date) return <Text size="xs" c="dimmed">—</Text>;
  const days = daysFromToday(date);
  return (
    <Stack gap={0}>
      <Text size="xs" className="lh-mono">{date}</Text>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c={days <= 7 ? 'yellow' : 'dimmed'}>
          {days < 0 ? `${-days}d ago` : days === 0 ? 'today' : `in ${days}d`}
        </Text>
        {extra && <Text size="xs" c="dimmed" className="lh-mono">· {extra}</Text>}
      </Group>
    </Stack>
  );
}

function AddTickerModal({
  opened,
  onClose,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FinnhubSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FinnhubSearchHit | null>(null);
  const [notes, setNotes] = useState('');
  const [yahooSymbol, setYahooSymbol] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      setQuery('');
      setHits([]);
      setSelected(null);
      setNotes('');
      setYahooSymbol('');
      setError(null);
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const term = query.trim();
    if (term.length < 1) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await api.searchSymbol(term);
        if (!cancelled) setHits(res.hits ?? []);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, opened]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const finnhubSymbol = (selected?.symbol ?? query).trim().toUpperCase();
    if (!finnhubSymbol) {
      setError('Pick a symbol from the list, or type one manually.');
      setSaving(false);
      return;
    }
    try {
      // If the user didn't explicitly supply a Yahoo symbol, default it to
      // the entered Finnhub symbol — that way non-US tickers (e.g.
      // `NOVO-B.CO`, `IGN1L.VS`) still get queried via the Yahoo fallback
      // when Finnhub free tier 403s. Finnhub-search picks already select a
      // US-friendly symbol so the duplicate doesn't hurt.
      const yh = yahooSymbol.trim() || (selected ? null : finnhubSymbol);
      const res = await api.addWatchlist({
        finnhubSymbol,
        yahooSymbol: yh,
        displayName: selected?.description?.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? 'Save failed');
      } else {
        onSaved();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add ticker to watchlist" size="lg">
      <Stack gap="sm">
        <Alert color="gray" variant="light" p="xs">
          <Text size="xs" c="dimmed">
            Type a Finnhub symbol (e.g. <Pill size="xs" mx={2}>AAPL</Pill> for US stocks) or a
            Yahoo symbol below to use Yahoo Finance for non-US listings (e.g.
            <Pill size="xs" mx={2}>NVO</Pill>, <Pill size="xs" mx={2}>NOVO-B.CO</Pill>,
            <Pill size="xs" mx={2}>IGN1L.VS</Pill>).
          </Text>
        </Alert>
        <TextInput
          label="Search (Finnhub — US only on free tier)"
          placeholder="AAPL, Novo Nordisk, Alphabet..."
          value={query}
          onChange={e => {
            setQuery(e.currentTarget.value);
            setSelected(null);
          }}
          rightSection={searching ? <Loader size="xs" /> : null}
          autoFocus
          data-autofocus
        />
        {hits.length > 0 && (
          <Card padding="xs" withBorder>
            <Stack gap={2} mah={240} style={{ overflowY: 'auto' }}>
              {hits.map(h => (
                <Group
                  key={h.symbol}
                  justify="space-between"
                  wrap="nowrap"
                  onClick={() => setSelected(h)}
                  style={{
                    cursor: 'pointer',
                    padding: 6,
                    borderRadius: 4,
                    background:
                      selected?.symbol === h.symbol
                        ? 'var(--mantine-color-dark-6)'
                        : undefined,
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600} size="sm" className="lh-mono">{h.symbol}</Text>
                    <Text size="xs" c="dimmed" truncate>{h.description}</Text>
                  </Group>
                  {h.type && <Badge size="xs" variant="default">{h.type}</Badge>}
                </Group>
              ))}
            </Stack>
          </Card>
        )}
        <TextInput
          label="Yahoo symbol (optional)"
          description="Falls back to Yahoo for the price when Finnhub returns no data — useful for European / Baltic listings."
          value={yahooSymbol}
          onChange={e => setYahooSymbol(e.currentTarget.value)}
          placeholder={selected?.symbol ?? ''}
        />
        <Textarea
          label="Notes (optional)"
          placeholder="Buy under €40, monitor margins..."
          minRows={2}
          value={notes}
          onChange={e => setNotes(e.currentTarget.value)}
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>
            Add {selected?.symbol ?? query.trim().toUpperCase()}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function EditTickerModal({
  row,
  onClose,
  onSaved,
  onRemoved,
}: {
  row: ResearchRow | null;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [yahooSymbol, setYahooSymbol] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (row) {
      setNotes(row.notes ?? '');
      setYahooSymbol(row.yahooSymbol ?? '');
      setError(null);
    }
  }, [row]);

  if (!row || !row.watchlistId) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateWatchlist(row.watchlistId!, {
        notes,
        yahooSymbol: yahooSymbol.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? 'Save failed');
      } else {
        onSaved();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await api.removeWatchlist(row.watchlistId!);
      if (!res.ok) {
        setError(res.error ?? 'Delete failed');
        setSaving(false);
      } else {
        onRemoved();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed');
      setSaving(false);
    }
  };

  return (
    <Modal opened={!!row} onClose={onClose} title={`Edit ${row.finnhubSymbol ?? row.displayName}`}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {row.displayName}
          {row.sector ? ` · ${row.sector}` : ''}
          {row.country ? ` · ${row.country}` : ''}
        </Text>
        <TextInput
          label="Yahoo symbol (optional)"
          value={yahooSymbol}
          onChange={e => setYahooSymbol(e.currentTarget.value)}
          placeholder={row.finnhubSymbol ?? ''}
        />
        <Textarea
          label="Notes"
          minRows={3}
          value={notes}
          onChange={e => setNotes(e.currentTarget.value)}
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          <Button color="red" variant="subtle" onClick={remove} loading={saving}>
            Remove
          </Button>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function SourcePill({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip label={tooltip}>
      <Badge size="xs" variant="default" radius="xl">
        {label}
      </Badge>
    </Tooltip>
  );
}

// ---- helpers ----

function num1(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(1);
}

function num2(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function compactMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

function daysFromToday(isoDate: string): number {
  const target = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}
