import { useState, useMemo } from 'react';
import { Table, Text, Group, Badge, Stack, ScrollArea, Card, UnstyledButton, ActionIcon } from '@mantine/core';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { InvestmentData, SortDir } from './types';
import { formatNum, formatEur, pnlColor } from './utils';
import { SortHeader } from './HoldingsTab';
import { CHART_GREEN, CHART_RED, tooltipStyle } from './chart-theme';

export function StocksTab({ data, onSelectStock }: { data: InvestmentData; onSelectStock?: (ticker: string) => void }) {
  const [sortField, setSortField] = useState('totalPnlEur');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const stats = data.stockStats;
  const totals = data.stockStatsTotals;

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [stats, sortField, sortDir]);

  /* Top 10 gainers + top 10 losers for the bar chart */
  const chartData = useMemo(() => {
    const byPnl = [...stats].sort((a, b) => b.totalPnlEur - a.totalPnlEur);
    const gainers = byPnl.filter(s => s.totalPnlEur > 0).slice(0, 10);
    const losers = byPnl.filter(s => s.totalPnlEur < 0).slice(-10).reverse();
    return [...gainers, ...losers].map(s => ({
      symbol: s.symbol,
      totalPnlEur: Math.round(s.totalPnlEur * 100) / 100,
    }));
  }, [stats]);

  if (stats.length === 0) return <Text c="dimmed">No stock data found.</Text>;

  return (
    <Stack gap="md">
      {/* Horizontal bar chart: top gainers & losers */}
      {chartData.length > 0 && (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Top Gainers & Losers (Total P&L)</Text>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#373A40" />
              <XAxis type="number" tick={{ fill: '#c1c2c5', fontSize: 12 }} />
              <YAxis type="category" dataKey="symbol" tick={{ fill: '#c1c2c5', fontSize: 12 }} width={70} />
              <Tooltip
                formatter={(value: number) => [formatEur(value), 'Total P&L']}
                {...tooltipStyle}
              />
              <Bar dataKey="totalPnlEur" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.totalPnlEur >= 0 ? CHART_GREEN : CHART_RED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Stock breakdown table */}
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Status" field="isOpen" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Since" field="firstDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Invested" field="totalInvestedEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Realized" field="realizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Unrealized" field="unrealizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Dividends" field="dividendsEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Total P&L" field="totalPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map(st => (
              <Table.Tr key={st.symbol}>
                <Table.Td>
                  <Group gap={4}>
                    <UnstyledButton onClick={() => onSelectStock?.(st.symbol)} style={{ cursor: 'pointer' }}>
                      <Text fw={600} style={{ textDecoration: 'underline dotted', color: '#74c0fc' }}>{st.symbol}</Text>
                    </UnstyledButton>
                    {data.tickerMeta?.[st.symbol] && (
                      <>
                        <Badge size="xs" variant="light" color="blue">{data.tickerMeta[st.symbol].geography}</Badge>
                        <Badge size="xs" variant="light" color="teal">{data.tickerMeta[st.symbol].sector}</Badge>
                      </>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" color={st.isOpen ? 'green' : 'gray'} variant="light">
                    {st.isOpen ? 'Open' : 'Closed'}
                  </Badge>
                </Table.Td>
                <Table.Td>{st.firstDate}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(st.totalInvestedEur)}</Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(st.realizedPnlEur) }}>
                  {st.realizedPnlEur !== 0 ? formatEur(st.realizedPnlEur) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(st.unrealizedPnlEur) }}>
                  {st.isOpen ? formatEur(st.unrealizedPnlEur) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {st.dividendsEur > 0 ? formatEur(st.dividendsEur) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(st.totalPnlEur) }}>
                  {formatEur(st.totalPnlEur)}
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" size="xs" onClick={() => onSelectStock?.(st.symbol)}>→</ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ fontWeight: 700 }}>
              <Table.Td>Total</Table.Td>
              <Table.Td />
              <Table.Td />
              <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalInvested)}</Table.Td>
              <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.realizedPnl) }}>{formatEur(totals.realizedPnl)}</Table.Td>
              <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.unrealizedPnl) }}>{formatEur(totals.unrealizedPnl)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.dividends)}</Table.Td>
              <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>{formatEur(totals.totalPnl)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

export default StocksTab;
