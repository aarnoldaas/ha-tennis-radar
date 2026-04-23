import { useMemo } from 'react';
import { Card, Text, Group, Stack } from '@mantine/core';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Treemap,
} from 'recharts';
import type { InvestmentData } from './types';
import { formatEur, formatNum } from './utils';
import { CHART_COLORS, tooltipStyle } from './chart-theme';

function LegendList({ data, colors }: { data: { name: string; display: string }[]; colors: string[] }) {
  return (
    <Stack gap={2} mt="xs">
      {data.map((item, i) => (
        <Group key={item.name} justify="space-between">
          <Group gap={6}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors[i % colors.length], flexShrink: 0 }} />
            <Text size="xs">{item.name}</Text>
          </Group>
          <Text size="xs" c="dimmed" className="lh-mono">{item.display}</Text>
        </Group>
      ))}
    </Stack>
  );
}

// Custom treemap content renderer
function TreemapContent(props: any) {
  const { x, y, width, height, name, value } = props;
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: props.fill || '#2c2e33', stroke: '#1a1b1e', strokeWidth: 2 }} />
      {width > 50 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fill="#e4e5e7" fontSize={11} fontWeight={600} fontFamily="'DM Sans', sans-serif">
            {name}
          </text>
          <text x={x + 6} y={y + 30} fill="#909296" fontSize={10} fontFamily="'JetBrains Mono', monospace">
            {formatEur(value)}
          </text>
        </>
      )}
    </g>
  );
}

export function DashboardOverview({ data }: { data: InvestmentData }) {
  // Holdings treemap data
  const holdingsTree = useMemo(() => {
    const sorted = [...data.holdings]
      .filter(h => h.currentValueEur > 0)
      .sort((a, b) => b.currentValueEur - a.currentValueEur);
    return sorted.map((h, i) => ({
      name: h.symbol,
      value: h.currentValueEur,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data.holdings]);

  // Geographic allocation
  const geoPie = useMemo(() => {
    return data.allocation?.byGeography?.map(e => ({ name: e.name, value: e.percent })) || [];
  }, [data.allocation]);

  // Sector allocation as horizontal bars
  const sectorBars = useMemo(() => {
    return (data.allocation?.bySector || [])
      .sort((a, b) => b.percent - a.percent)
      .map(e => ({ name: e.name, percent: e.percent, valueEur: e.valueEur }));
  }, [data.allocation]);

  if (data.holdings.length === 0) return null;

  return (
    <div className="lh-bento-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
      {/* Large: Holdings Treemap */}
      <Card padding="sm" withBorder style={{ gridColumn: '1 / -1' }}>
        <Text size="sm" fw={600} mb="xs">Holdings by Value</Text>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={holdingsTree}
              dataKey="value"
              isAnimationActive={false}
              content={<TreemapContent />}
            />
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Geographic allocation donut */}
      <Card padding="sm" withBorder>
        <Text size="sm" fw={600} mb="xs">Geographic Allocation</Text>
        {geoPie.length > 0 ? (
          <>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={geoPie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                    {geoPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${formatNum(v as number)}%`} {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <LegendList
              data={geoPie.map(item => ({ name: item.name, display: `${formatNum(item.value)}%` }))}
              colors={CHART_COLORS}
            />
          </>
        ) : <Text size="xs" c="dimmed">No allocation data</Text>}
      </Card>

      {/* Sector allocation horizontal bars */}
      <Card padding="sm" withBorder>
        <Text size="sm" fw={600} mb="xs">Sector Allocation</Text>
        {sectorBars.length > 0 ? (
          <>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorBars} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2e33" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#909296', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#e4e5e7', fontSize: 10 }} width={70} />
                  <Tooltip
                    formatter={(v, _, props: any) => [`${formatNum(v as number)}% (${formatEur(props.payload.valueEur)})`, 'Allocation']}
                    {...tooltipStyle}
                  />
                  <Bar dataKey="percent" radius={[0, 4, 4, 0]} fill="var(--lh-accent)">
                    {sectorBars.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <LegendList
              data={sectorBars.map(item => ({ name: item.name, display: `${formatNum(item.percent)}%` }))}
              colors={CHART_COLORS}
            />
          </>
        ) : <Text size="xs" c="dimmed">No allocation data</Text>}
      </Card>
    </div>
  );
}
