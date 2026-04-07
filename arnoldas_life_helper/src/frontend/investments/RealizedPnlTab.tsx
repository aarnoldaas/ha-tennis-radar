import { useState, useMemo } from 'react';
import { Table, Text, Group, Badge, Stack, Select, ScrollArea, Card } from '@mantine/core';
import { UnstyledButton } from '@mantine/core';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { IRealizedTrade, SortDir } from './types';
import { formatNum, formatEur, pnlColor } from './utils';
import { CHART_GREEN, CHART_RED, tooltipStyle } from './chart-theme';

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: SortDir;
  onSort: (field: string) => void;
}) {
  const active = sortField === field;
  return (
    <UnstyledButton onClick={() => onSort(field)} style={{ fontWeight: 600 }}>
      {label} {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
    </UnstyledButton>
  );
}

export function RealizedPnlTab({ trades }: { trades: IRealizedTrade[] }) {
  const [sortField, setSortField] = useState('sellDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Monthly P&L data for bar chart
  const monthlyPnl = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades) {
      const month = t.sellDate.slice(0, 7); // YYYY-MM
      map.set(month, (map.get(month) || 0) + t.realizedPnlEur);
    }
    const sorted = [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-24);
    return sorted.map(([month, pnl]) => ({ month, pnl }));
  }, [trades]);

  // Available years
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) set.add(t.sellDate.slice(0, 4));
    return [...set].sort().reverse();
  }, [trades]);

  // Filtered & sorted trades
  const filtered = useMemo(() => {
    let list = trades;
    if (yearFilter !== 'all') {
      list = list.filter(t => t.sellDate.startsWith(yearFilter));
    }
    return [...list].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [trades, yearFilter, sortField, sortDir]);

  const totalPnl = filtered.reduce((s, t) => s + t.realizedPnlEur, 0);

  // Year breakdown
  const yearBreakdown = useMemo(() => {
    if (yearFilter === 'all') return null;
    const shortTerm = filtered.filter(t => t.holdPeriod === 'short-term');
    const longTerm = filtered.filter(t => t.holdPeriod === 'long-term');
    return {
      shortTermPnl: shortTerm.reduce((s, t) => s + t.realizedPnlEur, 0),
      shortTermCount: shortTerm.length,
      longTermPnl: longTerm.reduce((s, t) => s + t.realizedPnlEur, 0),
      longTermCount: longTerm.length,
    };
  }, [filtered, yearFilter]);

  return (
    <Stack gap="md">
      {/* Monthly P&L Chart */}
      <Card padding="md" radius="md" withBorder>
        <Text fw={600} mb="xs">Monthly Realized P&L</Text>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyPnl} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#373A40" />
            <XAxis dataKey="month" tick={{ fill: '#c1c2c5', fontSize: 11 }} />
            <YAxis tick={{ fill: '#c1c2c5', fontSize: 11 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number) => [formatEur(value), 'P&L']}
            />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {monthlyPnl.map((entry, i) => (
                <Cell key={i} fill={entry.pnl >= 0 ? CHART_GREEN : CHART_RED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Filters */}
      <Group>
        <Select
          label="Year"
          value={yearFilter}
          onChange={v => setYearFilter(v || 'all')}
          data={[{ value: 'all', label: 'All Years' }, ...years.map(y => ({ value: y, label: y }))]}
          w={140}
        />
      </Group>

      {/* Year breakdown summary */}
      {yearBreakdown && (
        <Group gap="lg">
          <Text size="sm">
            Short-term ({yearBreakdown.shortTermCount}): <Text span c={pnlColor(yearBreakdown.shortTermPnl)} fw={600}>{formatEur(yearBreakdown.shortTermPnl)}</Text>
          </Text>
          <Text size="sm">
            Long-term ({yearBreakdown.longTermCount}): <Text span c={pnlColor(yearBreakdown.longTermPnl)} fw={600}>{formatEur(yearBreakdown.longTermPnl)}</Text>
          </Text>
        </Group>
      )}

      {/* Table */}
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><SortHeader label="Date" field="sellDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Qty" field="quantity" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Cost Basis (EUR)" field="totalCostBasisEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Proceeds (EUR)" field="proceedsEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L (EUR)" field="realizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Hold Period" field="holdPeriod" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map(t => (
              <Table.Tr key={t.sellTransactionId}>
                <Table.Td>{t.sellDate}</Table.Td>
                <Table.Td fw={600}>{t.symbol}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatNum(t.quantity, t.quantity % 1 === 0 ? 0 : 4)}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.totalCostBasisEur)}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.proceedsEur)}</Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(t.realizedPnlEur) }}>{formatEur(t.realizedPnlEur)}</Table.Td>
                <Table.Td>
                  <Badge color={t.holdPeriod === 'long-term' ? 'teal' : 'gray'} variant="light" size="sm">
                    {t.holdPeriod}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Total P&L</Table.Td>
              <Table.Td style={{ textAlign: 'right', fontWeight: 700, color: pnlColor(totalPnl) }}>{formatEur(totalPnl)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
