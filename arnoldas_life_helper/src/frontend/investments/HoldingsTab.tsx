import { useState, useMemo } from 'react';
import {
  Table, Text, Group, Badge, Stack, TextInput,
  ScrollArea, UnstyledButton, Card, SimpleGrid, ActionIcon,
} from '@mantine/core';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { IHolding, SortDir } from './types';
import { formatNum, formatEur, pnlColor } from './utils';
import { CHART_COLORS } from './chart-theme';

export function SortHeader({ label, field, sortField, sortDir, onSort }: {
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

export function HoldingsTab({ holdings, onSelectStock }: { holdings: IHolding[]; onSelectStock?: (ticker: string) => void }) {
  const [sortField, setSortField] = useState('currentValueEur');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    if (!search) return holdings;
    const q = search.toLowerCase();
    return holdings.filter(h => h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  }, [holdings, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(() => ({
    totalCost: filtered.reduce((s, h) => s + h.totalCostBasisEur, 0),
    totalValue: filtered.reduce((s, h) => s + h.currentValueEur, 0),
    totalPnl: filtered.reduce((s, h) => s + h.unrealizedPnlEur, 0),
  }), [filtered]);

  const donutData = useMemo(() => {
    const byValue = [...holdings].sort((a, b) => b.currentValueEur - a.currentValueEur);
    const top10 = byValue.slice(0, 10);
    const rest = byValue.slice(10);
    const entries = top10.map(h => ({ name: h.symbol, value: h.currentValueEur }));
    if (rest.length > 0) {
      entries.push({ name: 'Other', value: rest.reduce((s, h) => s + h.currentValueEur, 0) });
    }
    return entries;
  }, [holdings]);

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Holdings Breakdown</Text>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              dataKey="value"
              paddingAngle={2}
            >
              {donutData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatEur(value)}
              contentStyle={{
                backgroundColor: '#25262b',
                border: '1px solid #373A40',
                borderRadius: 8,
                fontSize: 12,
                color: '#c1c2c5',
              }}
              itemStyle={{ color: '#c1c2c5' }}
            />
            <Legend
              formatter={(value: string) => <span style={{ color: '#c1c2c5', fontSize: 12 }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Stack gap="xs">
        <TextInput
          placeholder="Search by symbol..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ maxWidth: 250 }}
        />
        <ScrollArea>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Qty" field="totalQuantity" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Avg Cost" field="averageCostBasis" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Total Cost" field="totalCostBasisEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Price" field="currentPrice" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Value" field="currentValueEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L" field="unrealizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L %" field="unrealizedPnlPercent" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map(h => {
                const isExpanded = expanded === h.symbol;
                const hasLots = h.lots && h.lots.length > 1;
                return (
                  <>
                    <Table.Tr
                      key={h.symbol}
                      onClick={hasLots ? () => setExpanded(isExpanded ? null : h.symbol) : undefined}
                      style={hasLots ? { cursor: 'pointer' } : undefined}
                    >
                      <Table.Td>
                        <Group gap={4}>
                          {hasLots && <Text size="sm" c="dimmed">{isExpanded ? '\u25BC' : '\u25B6'}</Text>}
                          <Text fw={600}>{h.symbol}</Text>
                          {h.brokers?.map(b => (
                            <Badge key={b} size="xs" variant="light" color="gray">{b}</Badge>
                          ))}
                          {h.priceLastUpdated === null && h.currentPrice > 0 && (
                            <Badge size="xs" color="yellow" variant="dot">stale</Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.totalQuantity, h.totalQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.averageCostBasis)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatEur(h.totalCostBasisEur)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatNum(h.currentPrice) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatEur(h.currentValueEur) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: pnlColor(h.unrealizedPnl) }}>
                        {h.currentPrice > 0 ? formatEur(h.unrealizedPnlEur) : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: pnlColor(h.unrealizedPnlPercent) }}>
                        {h.currentPrice > 0 ? `${formatNum(h.unrealizedPnlPercent)}%` : '\u2014'}
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" size="xs" onClick={() => onSelectStock?.(h.symbol)}>→</ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                    {isExpanded && h.lots && (
                      <Table.Tr key={h.symbol + '-lots'}>
                        <Table.Td colSpan={8} style={{ padding: 0, background: 'var(--mantine-color-body)' }}>
                          <div style={{ padding: '8px 16px' }}>
                            <Text size="xs" fw={600} c="dimmed" mb="xs">Tax Lots ({h.lots.length})</Text>
                            <Table striped>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>Acquired</Table.Th>
                                  <Table.Th>Source</Table.Th>
                                  <Table.Th>Broker</Table.Th>
                                  <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                                  <Table.Th style={{ textAlign: 'right' }}>Cost/Share</Table.Th>
                                  <Table.Th style={{ textAlign: 'right' }}>Total Cost</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {h.lots.map((lot, i) => (
                                  <Table.Tr key={lot.acquisitionDate + '-' + i}>
                                    <Table.Td>{lot.acquisitionDate}</Table.Td>
                                    <Table.Td>
                                      <Badge size="xs" variant="light" color={lot.source === 'RSU' ? 'violet' : lot.source === 'ESPP' ? 'grape' : 'blue'}>
                                        {lot.source}
                                      </Badge>
                                    </Table.Td>
                                    <Table.Td><Text size="sm">{lot.broker}</Text></Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.remainingQuantity, lot.remainingQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.costBasisPerShare)} {lot.currency}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.remainingQuantity * lot.costBasisPerShare)} {lot.currency}</Table.Td>
                                  </Table.Tr>
                                ))}
                              </Table.Tbody>
                            </Table>
                          </div>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </>
                );
              })}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr style={{ fontWeight: 700 }}>
                <Table.Td>Total</Table.Td>
                <Table.Td />
                <Table.Td />
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalCost)}</Table.Td>
                <Table.Td />
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalValue)}</Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>
                  {formatEur(totals.totalPnl)}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>
                  {totals.totalCost > 0 ? `${formatNum((totals.totalPnl / totals.totalCost) * 100)}%` : '\u2014'}
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea>
      </Stack>
    </Stack>
  );
}
