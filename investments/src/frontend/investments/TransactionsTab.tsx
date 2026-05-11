import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
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
import { api, type BrokerKey, type Transaction, type TxKind } from './api';
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
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [year, setYear] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .transactions()
      .then(rows => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(e => {
        if (!cancelled) setError(e?.message || 'Failed to load transactions');
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          <Text size="xs" c="dimmed">
            {filtered.length} of {transactions.length} rows
          </Text>
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
