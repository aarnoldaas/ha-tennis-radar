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
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { Broker, Transaction } from '../../shared/types';
import { BROKERS } from '../../shared/brokers';
import { api } from '../lib/api';
import { BROKER_OPTIONS, brokerLabel } from '../lib/utils';
import { money, signedMoney } from '../lib/format';
import { downloadCsv } from '../lib/csv';

type BrokerFilter = Broker | 'all';

type CashflowType = 'deposit' | 'withdrawal' | 'dividend';

// Lithuanian GPM311 investicinė-sąskaita `rusis` codes:
//   II = įmokos (deposit / contribution)
//   PP = piniginis paėmimas (withdrawal)
//   IV = investicijų vaisiai (dividends etc.)
const RUSIS_BY_TYPE: Record<CashflowType, 'II' | 'PP' | 'IV'> = {
  deposit: 'II',
  withdrawal: 'PP',
  dividend: 'IV',
};

const TYPE_PALETTE: Record<CashflowType, { label: string; color: string }> = {
  deposit: { label: 'Deposit', color: 'teal' },
  withdrawal: { label: 'Withdrawal', color: 'red' },
  dividend: { label: 'Dividend', color: 'cyan' },
};

/**
 * Cashflow tab — external cash flows on the brokerage accounts: deposits,
 * withdrawals, and dividend payouts. Running cash balances are not tracked;
 * this is a contribution + payout log. It also feeds the Lithuanian GPM311
 * investicinė-sąskaita CSV export (five required columns, II/PP/IV codes).
 */
export function CashflowTab() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerFilter>('all');
  const [year, setYear] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    api
      .transactions()
      .then(rows => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(e => {
        if (!cancelled) setError(e?.message || 'Failed to load cashflow');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cashflows = useMemo(
    () =>
      (transactions ?? []).filter(
        t => t.type === 'deposit' || t.type === 'withdrawal' || t.type === 'dividend',
      ),
    [transactions],
  );

  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const t of cashflows) ys.add(t.date.slice(0, 4));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [cashflows]);

  const filtered = useMemo(() => {
    return cashflows.filter(t => {
      if (broker !== 'all' && t.broker !== broker) return false;
      if (year !== 'all' && !t.date.startsWith(year)) return false;
      return true;
    });
  }, [cashflows, broker, year]);

  const totals = useMemo(() => {
    let deposited = 0;
    let withdrawn = 0;
    let dividends = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    let dividendCount = 0;
    for (const t of filtered) {
      if (t.type === 'deposit') {
        deposited += t.amountEur;
        depositCount += 1;
      } else if (t.type === 'withdrawal') {
        withdrawn += -t.amountEur;
        withdrawalCount += 1;
      } else {
        dividends += t.amountEur;
        dividendCount += 1;
      }
    }
    return {
      deposited,
      withdrawn,
      dividends,
      net: deposited - withdrawn,
      depositCount,
      withdrawalCount,
      dividendCount,
    };
  }, [filtered]);

  if (error) {
    return (
      <Alert color="red" title="Unable to load cashflow">
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
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
        <Kpi
          label="Deposited"
          value={money(totals.deposited)}
          sub={`${totals.depositCount} transfer${totals.depositCount === 1 ? '' : 's'} in`}
          color="teal"
        />
        <Kpi
          label="Withdrawn"
          value={money(totals.withdrawn)}
          sub={`${totals.withdrawalCount} transfer${totals.withdrawalCount === 1 ? '' : 's'} out`}
          color="red"
        />
        <Kpi
          label="Dividends (net)"
          value={money(totals.dividends)}
          sub={`${totals.dividendCount} payout${totals.dividendCount === 1 ? '' : 's'}`}
          color="cyan"
        />
        <Kpi
          label="Net contribution"
          value={signedMoney(totals.net)}
          sub="Deposited − withdrawn"
          color={totals.net >= 0 ? 'teal' : 'red'}
        />
      </SimpleGrid>

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
              value={year}
              onChange={v => v && setYear(v)}
              data={[{ value: 'all', label: 'All years' }, ...years.map(y => ({ value: y, label: y }))]}
              w={120}
              allowDeselect={false}
            />
          </Group>
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              {filtered.length} of {cashflows.length} transfers
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={() => downloadCsv(buildGpm311Csv(filtered), `cashflow-${broker}-${year}.csv`)}
              disabled={filtered.length === 0}
            >
              Download CSV
            </Button>
          </Group>
        </Group>
      </Card>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Direction</Table.Th>
                <Table.Th ta="right">Amount (€)</Table.Th>
                <Table.Th>Note</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No deposits, withdrawals, or dividends match these filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filtered.map(t => {
                const palette = TYPE_PALETTE[t.type as CashflowType];
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td className="lh-mono">{t.date}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="dot" color="yellow">
                        {brokerLabel(t.broker)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={palette.color}>
                        {palette.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" className="lh-mono" c={palette.color}>
                      {signedMoney(t.amountEur, { precise: true })}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" lineClamp={1} maw={360}>
                        {t.note ?? ''}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

/**
 * GPM311 investicinė-sąskaita CSV. Header names match the importer spec
 * exactly (lowercase); only the five required columns are emitted. The
 * `suma` for dividends mirrors the broker's own statement figure (gross
 * for IB, net for Swedbank — see `BROKERS[...].gpm311.dividendAmount`) so
 * declared amounts stay reconcilable against broker paperwork.
 */
function buildGpm311Csv(rows: Transaction[]): string {
  const header = 'saskaita,rusis,data,suma,valstybe';
  const lines: string[] = [header];
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const t of sorted) {
    const acct = BROKERS[t.broker]?.gpm311;
    const rusis = RUSIS_BY_TYPE[t.type as CashflowType];
    if (!acct || !rusis) continue;
    const suma =
      t.type === 'dividend' && acct.dividendAmount === 'gross'
        ? t.grossEur ?? t.amountEur
        : t.amountEur;
    lines.push(
      [acct.saskaita, rusis, t.date, Math.abs(suma).toFixed(2), acct.valstybe].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card padding="sm" withBorder radius="md">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} className="lh-mono" c={color} mt={2}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={2}>
          {sub}
        </Text>
      )}
    </Card>
  );
}
