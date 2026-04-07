import { useState } from 'react';
import { Card, Group, Stack, Text, Table, UnstyledButton } from '@mantine/core';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { InvestmentData } from './types';
import { formatEur } from './utils';
import { CHART_COLORS, tooltipStyle } from './chart-theme';

export function IncomeCard({ data }: { data: InvestmentData }) {
  const hasDividends = data.dividends.length > 0;
  const hasInterest = data.interestSummary && data.interestSummary.totalEur > 0;
  const [showDividendBreakdown, setShowDividendBreakdown] = useState(false);
  if (!hasDividends && !hasInterest) return null;

  const totalIncome = data.totalDividendsEur + data.totalInterestEur;
  const dividendsByStock = data.dividendsByStock;

  const pieData = dividendsByStock.map(d => ({ name: d.symbol, value: d.totalEur }));

  return (
    <Card padding="sm" mb="md" withBorder>
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={600}>Income Summary</Text>
          {hasDividends && dividendsByStock.length > 1 && (
            <UnstyledButton onClick={() => setShowDividendBreakdown(!showDividendBreakdown)}>
              <Text size="xs" c="dimmed">{showDividendBreakdown ? '\u25BC' : '\u25B6'} by stock</Text>
            </UnstyledButton>
          )}
        </Group>
        <Group gap="lg">
          {hasDividends && (
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">Dividends ({data.dividends.length})</Text>
              <Text size="sm">{formatEur(data.totalDividendsEur)}</Text>
            </Stack>
          )}
          {hasInterest && data.interestSummary && (
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">Interest</Text>
              <Text size="sm">{formatEur(data.interestSummary.totalEur)}</Text>
            </Stack>
          )}
          <Stack gap={0} align="flex-end">
            <Text size="xs" c="dimmed">Total Income</Text>
            <Text size="sm" fw={700} c="cyan">{formatEur(totalIncome)}</Text>
          </Stack>
        </Group>
      </Group>
      {showDividendBreakdown && (
        <Group mt="sm" align="flex-start" gap="xl">
          {pieData.length > 1 && (
            <div style={{ width: 220, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatEur(value)}
                    {...tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <Table striped style={{ flex: 1 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Symbol</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Payments</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Total (EUR)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {dividendsByStock.map((d, i) => (
                <Table.Tr key={d.symbol}>
                  <Table.Td>
                    <Group gap={6}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <Text fw={600}>{d.symbol}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{d.count}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(d.totalEur)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Group>
      )}
    </Card>
  );
}
