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
import type { Broker, Instrument, Transaction, TxType } from '../../shared/types';
import { api } from '../lib/api';
import { BROKER_OPTIONS, brokerLabel } from '../lib/utils';
import { currencyFmt, num, pnlColor, signedMoney } from '../lib/format';
import { downloadCsv } from '../lib/csv';

type BrokerFilter = Broker | 'all';
type TypeFilter = TxType | 'all';

export const TX_COLORS: Record<TxType, string> = {
  buy: 'blue',
  sell: 'orange',
  dividend: 'teal',
  interest: 'cyan',
  fee: 'red',
  deposit: 'green',
  withdrawal: 'pink',
};

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
  { value: 'fee', label: 'Fee' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
];

export function TransactionsTab() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [year, setYear] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.transactions(), api.instruments()])
      .then(([rows, inst]) => {
        if (!cancelled) {
          setTransactions(rows);
          setInstruments(inst);
        }
      })
      .catch(e => {
        if (!cancelled) setError(e?.message || 'Failed to load transactions');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const t of transactions ?? []) ys.add(t.date.slice(0, 4));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const q = search.trim().toLowerCase();
    return transactions.filter(t => {
      if (broker !== 'all' && t.broker !== broker) return false;
      if (type !== 'all' && t.type !== type) return false;
      if (year !== 'all' && !t.date.startsWith(year)) return false;
      if (q) {
        const sym = (t.symbol || '').toLowerCase();
        const note = (t.note || '').toLowerCase();
        if (!sym.includes(q) && !note.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, broker, type, year, search]);

  const trades = useMemo(
    () => (transactions ?? []).filter(t => t.type === 'buy' || t.type === 'sell'),
    [transactions],
  );

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
              data={[{ value: 'all', label: 'All brokers' }, ...BROKER_OPTIONS]}
            />
            <Select
              size="xs"
              value={type}
              onChange={v => v && setType(v as TypeFilter)}
              data={TYPE_OPTIONS}
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
              onClick={() => downloadCsv(buildTradesCsv(trades, instruments), 'share-trades.csv')}
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
                <Table.Th>Type</Table.Th>
                <Table.Th>Symbol</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Amount (€)</Table.Th>
                <Table.Th>Note</Table.Th>
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
                  <Table.Td className="lh-mono">{t.date}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {brokerLabel(t.broker)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={TX_COLORS[t.type] ?? 'gray'}>
                      {t.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="lh-mono">
                    {t.symbol ? (
                      <Group gap={4} wrap="nowrap">
                        <Text size="sm" className="lh-mono">{t.symbol}</Text>
                        {!t.instrumentId && t.type !== 'interest' && (
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
                    {t.priceNative != null ? (
                      currencyFmt(t.priceNative, t.currency)
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" c={pnlColor(t.amountEur)} className="lh-mono">
                      {signedMoney(t.amountEur, { precise: true })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" lineClamp={1} maw={320}>
                      {t.note ?? ''}
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

function buildTradesCsv(rows: Transaction[], instruments: Instrument[]): string {
  const byId = new Map(instruments.map(i => [i.id, i]));
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
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const inst = t.instrumentId ? byId.get(t.instrumentId) : undefined;
    lines.push(
      [
        t.symbol ?? '',
        inst?.name ?? '',
        inst?.isin ?? '',
        t.type === 'buy' ? 'Buy' : 'Sell',
        t.date,
        t.quantity != null ? String(Math.abs(t.quantity)) : '',
        t.priceNative != null ? formatPrice(t.priceNative) : '',
        `${exchangeLabel(inst?.yahooSymbol, t.broker)} / ${t.currency}`,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function exchangeLabel(yahooSymbol: string | null | undefined, broker: Broker): string {
  if (yahooSymbol) {
    const dot = yahooSymbol.lastIndexOf('.');
    if (dot > 0) {
      const suffix = yahooSymbol.slice(dot + 1).toUpperCase();
      return YAHOO_EXCHANGE_LABELS[suffix] ?? suffix;
    }
  }
  return brokerLabel(broker);
}

function formatPrice(n: number): string {
  return n.toFixed(6).replace(/\.?0+$/, '');
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
