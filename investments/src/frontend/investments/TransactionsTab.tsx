import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import {
  api,
  type BrokerKey,
  type MappingsPayload,
  type ResolvedMappingEntry,
  type Transaction,
  type TxKind,
} from './api';
import { BROKER_LABEL, BROKERS } from './utils';
import { currencyFmt, num } from './format';

type BrokerFilter = BrokerKey | 'all';
type KindFilter = TxKind | 'all';

const KIND_COLORS: Record<TxKind, string> = {
  buy: 'blue',
  sell: 'orange',
  dividend: 'teal',
  interest: 'cyan',
  tax: 'red',
  deposit: 'green',
  withdrawal: 'pink',
};

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
  { value: 'tax', label: 'Tax' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
];

export function TransactionsTab() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [mappings, setMappings] = useState<MappingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [year, setYear] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.transactions(), api.mappings()])
      .then(([rows, map]) => {
        if (!cancelled) {
          setTransactions(rows);
          setMappings(map);
        }
      })
      .catch(e => {
        if (!cancelled) setError(e?.message || 'Failed to load transactions');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const instrumentById = useMemo(() => {
    const map = new Map<string, ResolvedMappingEntry>();
    for (const entry of mappings?.resolved ?? []) map.set(entry.instrumentId, entry);
    return map;
  }, [mappings]);

  const trades = useMemo(
    () => (transactions ?? []).filter(t => t.kind === 'buy' || t.kind === 'sell'),
    [transactions],
  );

  const years = useMemo(() => {
    if (!transactions) return [];
    const ys = new Set<string>();
    for (const t of transactions) ys.add(t.timestamp.slice(0, 4));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const q = search.trim().toLowerCase();
    return transactions.filter(t => {
      if (broker !== 'all' && t.broker !== broker) return false;
      if (kind !== 'all' && t.kind !== kind) return false;
      if (year !== 'all' && !t.timestamp.startsWith(year)) return false;
      if (q) {
        const sym = (t.rawSymbol || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        if (!sym.includes(q) && !notes.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, broker, kind, year, search]);

  const handleExportTrades = () => {
    const csv = buildTradesCsv(trades, instrumentById);
    downloadCsv(csv, 'share-trades.csv');
  };

  if (error) {
    return (
      <Alert color="red" title="Unable to load transactions">
        {error}
      </Alert>
    );
  }
  if (!transactions) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={broker}
              onChange={v => setBroker(v as BrokerFilter)}
              data={[
                { value: 'all', label: 'All brokers' },
                ...BROKERS.map(b => ({ value: b.value, label: b.label })),
              ]}
            />
            <Select
              size="xs"
              value={kind}
              onChange={v => v && setKind(v as KindFilter)}
              data={KIND_OPTIONS}
              w={140}
              allowDeselect={false}
            />
            <Select
              size="xs"
              value={year}
              onChange={v => v && setYear(v)}
              data={[{ value: 'all', label: 'All years' }, ...years.map(y => ({ value: y, label: y }))]}
              w={120}
              allowDeselect={false}
            />
            <TextInput
              size="xs"
              placeholder="Filter symbol or note…"
              value={search}
              onChange={e => setSearch(e.currentTarget.value)}
              w={220}
            />
          </Group>
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              {filtered.length} of {transactions.length} rows
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={handleExportTrades}
              disabled={trades.length === 0}
            >
              Export trades CSV
            </Button>
          </Group>
        </Group>
      </Card>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={840}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th>Symbol</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No transactions match these filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filtered.map(t => (
                <Table.Tr key={t.id}>
                  <Table.Td className="lh-mono">{t.timestamp}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[t.broker] ?? t.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={KIND_COLORS[t.kind] ?? 'gray'}>
                      {t.kind}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="lh-mono">
                    {t.rawSymbol ? (
                      <Group gap={4} wrap="nowrap">
                        <Text size="sm" className="lh-mono">{t.rawSymbol}</Text>
                        {!t.instrumentId && (
                          <Badge size="xs" color="orange" variant="light">unmapped</Badge>
                        )}
                      </Group>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.quantity != null ? num(t.quantity) : <Text size="xs" c="dimmed">—</Text>}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.price != null ? currencyFmt(t.price, t.currency) : <Text size="xs" c="dimmed">—</Text>}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {currencyFmt(t.amount, t.currency)}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" lineClamp={1} maw={320}>
                      {t.notes ?? ''}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

const YAHOO_EXCHANGE_LABELS: Record<string, string> = {
  VS: 'Vilnius Stock Exchange',
  CO: 'NASDAQ Copenhagen',
  L: 'London Stock Exchange',
  DE: 'Xetra',
  F: 'Frankfurt',
  HK: 'Hong Kong',
  ST: 'Stockholm',
  SA: 'São Paulo',
  TO: 'Toronto',
  PA: 'Paris',
  AS: 'Amsterdam',
  MI: 'Milan',
  SW: 'SIX Swiss',
  AX: 'ASX',
  T: 'Tokyo',
  SS: 'Shanghai',
  SZ: 'Shenzhen',
  NS: 'NSE India',
  BO: 'BSE India',
};

function buildTradesCsv(
  rows: Transaction[],
  instrumentById: Map<string, ResolvedMappingEntry>,
): string {
  const header = [
    'Ticker',
    'Name',
    'ISIN',
    'Transaction type',
    'Transaction date',
    'Number of shares',
    'Price per share',
    'Exchange & currency',
  ];
  const lines = [header.map(csvCell).join(',')];
  const sorted = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const t of sorted) {
    const inst = t.instrumentId ? instrumentById.get(t.instrumentId) : undefined;
    const ticker = tradeTicker(t, inst);
    const name = inst?.name ?? '';
    const isin = inst?.isin ?? t.isin ?? '';
    const type = t.kind === 'buy' ? 'Buy' : 'Sell';
    const date = t.timestamp.slice(0, 10);
    const shares =
      t.quantity != null ? String(Math.abs(t.quantity)) : '';
    const price = t.price != null ? formatPrice(t.price) : '';
    const exchange = exchangeLabel(inst?.yahooSymbol, t.broker);
    const exchangeAndCurrency = `${exchange} / ${t.currency}`;
    lines.push(
      [ticker, name, isin, type, date, shares, price, exchangeAndCurrency]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function tradeTicker(t: Transaction, inst?: ResolvedMappingEntry): string {
  if (t.rawSymbol) return t.rawSymbol;
  if (inst?.yahooSymbol) {
    const dot = inst.yahooSymbol.lastIndexOf('.');
    return dot > 0 ? inst.yahooSymbol.slice(0, dot) : inst.yahooSymbol;
  }
  return '';
}

function exchangeLabel(yahooSymbol: string | null | undefined, broker: BrokerKey): string {
  if (yahooSymbol) {
    const dot = yahooSymbol.lastIndexOf('.');
    if (dot > 0) {
      const suffix = yahooSymbol.slice(dot + 1).toUpperCase();
      return YAHOO_EXCHANGE_LABELS[suffix] ?? suffix;
    }
  }
  return BROKER_LABEL[broker] ?? broker;
}

function formatPrice(n: number): string {
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, '');
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
