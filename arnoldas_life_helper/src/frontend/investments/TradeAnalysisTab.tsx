import { useState, useMemo } from 'react';
import { Card, Text, Group, Badge, Stack, Select, ScrollArea, Table, UnstyledButton } from '@mantine/core';
import type { InvestmentData, SortDir } from './types';
import { formatNum, formatEur, pnlColor } from './utils';
import { SortHeader } from './HoldingsTab';

export function TradeAnalysisTab({ data, onSelectStock }: { data: InvestmentData; onSelectStock?: (ticker: string) => void }) {
  const [sortField, setSortField] = useState('totalBoughtQty');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  const analysis = data.stockTradeAnalysis || [];

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let items = analysis;
    if (filter === 'open') items = items.filter(a => a.isOpen);
    if (filter === 'closed') items = items.filter(a => !a.isOpen);
    return [...items].sort((a, b) => {
      const av = (a as any)[sortField] ?? -Infinity;
      const bv = (b as any)[sortField] ?? -Infinity;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [analysis, sortField, sortDir, filter]);

  if (analysis.length === 0) return <Text c="dimmed">No trade data found.</Text>;

  return (
    <Card padding="xs">
      <Group mb="sm">
        <Select
          size="xs"
          value={filter}
          onChange={(v) => setFilter((v || 'all') as any)}
          data={[
            { value: 'all', label: 'All stocks' },
            { value: 'open', label: 'Currently held' },
            { value: 'closed', label: 'Fully sold' },
          ]}
          style={{ width: 160 }}
        />
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Avg Buy" field="avgBuyPrice" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Avg Sell" field="avgSellPrice" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Current" field="currentPrice" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Last Buy" field="lastBuyDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Last Sell" field="lastSellDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Bought" field="totalBoughtQty" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Sold" field="totalSoldQty" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Buys" field="buyCount" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Sells" field="sellCount" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Win %" field="winRate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Best" field="bestTradeEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Worst" field="worstTradeEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Avg Hold" field="avgHoldDays" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map(a => (
              <Table.Tr key={a.symbol}>
                <Table.Td>
                  <Group gap={4}>
                    <UnstyledButton onClick={() => onSelectStock?.(a.symbol)}>
                      <Text fw={600} style={{ textDecoration: 'underline dotted', color: '#74c0fc', cursor: 'pointer' }}>{a.symbol}</Text>
                    </UnstyledButton>
                    <Badge size="xs" color={a.isOpen ? 'green' : 'gray'} variant="light">
                      {a.isOpen ? 'Open' : 'Closed'}
                    </Badge>
                  </Group>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {formatNum(a.avgBuyPrice)} {a.currency}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {a.avgSellPrice !== null ? `${formatNum(a.avgSellPrice)} ${a.currency}` : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {a.currentPrice !== null
                    ? <Text span c={a.currentPrice >= a.avgBuyPrice ? '#51cf66' : '#ff6b6b'}>{formatNum(a.currentPrice)} {a.currency}</Text>
                    : '\u2014'}
                </Table.Td>
                <Table.Td>
                  {a.lastBuyDate
                    ? <><Text span size="sm">{a.lastBuyDate}</Text>{a.lastBuyPrice !== null && <Text span size="xs" c="dimmed"> @ {formatNum(a.lastBuyPrice)}</Text>}</>
                    : '\u2014'}
                </Table.Td>
                <Table.Td>
                  {a.lastSellDate
                    ? <><Text span size="sm">{a.lastSellDate}</Text>{a.lastSellPrice !== null && <Text span size="xs" c="dimmed"> @ {formatNum(a.lastSellPrice)}</Text>}</>
                    : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatNum(a.totalBoughtQty, a.totalBoughtQty % 1 === 0 ? 0 : 2)}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{a.totalSoldQty > 0 ? formatNum(a.totalSoldQty, a.totalSoldQty % 1 === 0 ? 0 : 2) : '\u2014'}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{a.buyCount}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{a.sellCount > 0 ? a.sellCount : '\u2014'}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {a.winRate !== null
                    ? <Text span c={a.winRate >= 50 ? '#51cf66' : '#ff6b6b'}>{formatNum(a.winRate, 0)}%</Text>
                    : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', color: a.bestTradeEur !== null ? '#51cf66' : undefined }}>
                  {a.bestTradeEur !== null ? formatEur(a.bestTradeEur) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', color: a.worstTradeEur !== null ? pnlColor(a.worstTradeEur) : undefined }}>
                  {a.worstTradeEur !== null ? formatEur(a.worstTradeEur) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {a.avgHoldDays !== null ? `${a.avgHoldDays}d` : '\u2014'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
}

export default TradeAnalysisTab;
