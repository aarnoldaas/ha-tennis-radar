import { Card, Text, Stack, SimpleGrid, Group } from '@mantine/core';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { AllocationBreakdown, AllocationEntry } from './types';
import { CHART_COLORS, tooltipStyle } from './chart-theme';
import { formatEur, formatNum } from './utils';

function AllocationDonut({ title, data }: { title: string; data: AllocationEntry[] }) {
  const chartData = data.map(e => ({ name: e.name, value: e.valueEur, percent: e.percent }));

  return (
    <Card padding="sm" withBorder>
      <Text size="sm" fw={600} mb="sm">{title}</Text>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatEur(value)}
            contentStyle={tooltipStyle.contentStyle}
            itemStyle={tooltipStyle.itemStyle}
            labelStyle={tooltipStyle.labelStyle}
          />
        </PieChart>
      </ResponsiveContainer>
      <Stack gap={4} mt="sm">
        {data.map((entry, i) => (
          <Group key={entry.name} justify="space-between" gap="xs">
            <Group gap={6}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                flexShrink: 0,
              }} />
              <Text size="xs">{entry.name}</Text>
            </Group>
            <Group gap="xs">
              <Text size="xs" c="dimmed">{formatEur(entry.valueEur)}</Text>
              <Text size="xs" fw={600}>{formatNum(entry.percent)}%</Text>
            </Group>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

export function AllocationTab({ allocation }: { allocation: AllocationBreakdown }) {
  const sections = [
    { title: 'Geography', data: allocation.byGeography },
    { title: 'Currency Exposure', data: allocation.byCurrency },
    { title: 'Sector', data: allocation.bySector },
  ];

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      {sections.map(section => (
        <AllocationDonut key={section.title} title={section.title} data={section.data} />
      ))}
    </SimpleGrid>
  );
}
