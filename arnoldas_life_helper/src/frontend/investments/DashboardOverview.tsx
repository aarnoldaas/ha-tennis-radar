import { useMemo } from 'react';
import { Card, Text, Group, SimpleGrid, Stack } from '@mantine/core';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { InvestmentData } from './types';
import { formatEur, formatNum } from './utils';
import { CHART_COLORS, tooltipStyle } from './chart-theme';

export function DashboardOverview({ data }: { data: InvestmentData }) {
  const holdingsPie = useMemo(() => {
    const sorted = [...data.holdings]
      .filter(h => h.currentValueEur > 0)
      .sort((a, b) => b.currentValueEur - a.currentValueEur);
    const top = sorted.slice(0, 8);
    const otherValue = sorted.slice(8).reduce((s, h) => s + h.currentValueEur, 0);
    const items = top.map(h => ({ name: h.symbol, value: h.currentValueEur }));
    if (otherValue > 0) items.push({ name: 'Other', value: otherValue });
    return items;
  }, [data.holdings]);

  const allocationPie = useMemo(() => {
    return data.allocation?.bySector?.map(e => ({ name: e.name, value: e.percent })) || [];
  }, [data.allocation]);

  const geoPie = useMemo(() => {
    return data.allocation?.byGeography?.map(e => ({ name: e.name, value: e.percent })) || [];
  }, [data.allocation]);

  if (data.holdings.length === 0) return null;

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mb="md">
      <Card padding="sm" withBorder>
        <Text size="sm" fw={600} mb="xs">Holdings by Value</Text>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={holdingsPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                {holdingsPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatEur(v)} {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <Stack gap={2} mt="xs">
          {holdingsPie.map((item, i) => (
            <Group key={item.name} justify="space-between">
              <Group gap={6}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <Text size="xs">{item.name}</Text>
              </Group>
              <Text size="xs" c="dimmed">{formatEur(item.value)}</Text>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card padding="sm" withBorder>
        <Text size="sm" fw={600} mb="xs">Geographic Allocation</Text>
        {geoPie.length > 0 ? (
          <>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={geoPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                    {geoPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${formatNum(v)}%`} {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <Stack gap={2} mt="xs">
              {geoPie.map((item, i) => (
                <Group key={item.name} justify="space-between">
                  <Group gap={6}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <Text size="xs">{item.name}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">{formatNum(item.value)}%</Text>
                </Group>
              ))}
            </Stack>
          </>
        ) : <Text size="xs" c="dimmed">No allocation data</Text>}
      </Card>

      <Card padding="sm" withBorder>
        <Text size="sm" fw={600} mb="xs">Sector Allocation</Text>
        {allocationPie.length > 0 ? (
          <>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocationPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                    {allocationPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${formatNum(v)}%`} {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <Stack gap={2} mt="xs">
              {allocationPie.map((item, i) => (
                <Group key={item.name} justify="space-between">
                  <Group gap={6}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <Text size="xs">{item.name}</Text>
                  </Group>
                  <Text size="xs" c="dimmed">{formatNum(item.value)}%</Text>
                </Group>
              ))}
            </Stack>
          </>
        ) : <Text size="xs" c="dimmed">No allocation data</Text>}
      </Card>
    </SimpleGrid>
  );
}
