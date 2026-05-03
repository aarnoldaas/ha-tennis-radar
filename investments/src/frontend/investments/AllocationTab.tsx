import { Card, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import type { AllocationSlice, PortfolioSnapshot } from './api';
import { money, pct } from './format';

export function AllocationTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <DonutCard title="By asset class" slices={snapshot.allocation.byAssetClass} />
        <DonutCard title="By currency" slices={snapshot.allocation.byCurrency} />
        <DonutCard title="By broker" slices={snapshot.allocation.byBroker} />
      </SimpleGrid>
    </Stack>
  );
}

function DonutCard({ title, slices }: { title: string; slices: AllocationSlice[] }) {
  return (
    <Card padding="md" withBorder>
      <Text size="sm" fw={600} mb="sm">
        {title}
      </Text>
      <Donut slices={slices} />
      <Table withRowBorders={false} verticalSpacing={4} mt="sm">
        <Table.Tbody>
          {slices.map((s, i) => (
            <Table.Tr key={s.key}>
              <Table.Td style={{ width: 16 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: colorFor(i),
                  }}
                />
              </Table.Td>
              <Table.Td>
                <Text size="xs" fw={500}>
                  {s.label}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="lh-mono">
                <Text size="xs" c="dimmed">
                  {money(s.valueBase)}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="lh-mono">
                <Text size="xs" fw={600}>
                  {pct(s.pct)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function Donut({ slices }: { slices: AllocationSlice[] }) {
  const total = slices.reduce((s, x) => s + x.valueBase, 0);
  if (total <= 0) {
    return (
      <Text size="xs" c="dimmed" ta="center" py="md">
        No data
      </Text>
    );
  }
  const R = 60;
  const r = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="-80 -80 160 160" width="100%" height={160} role="img" aria-label="Allocation donut">
      {slices.map((s, i) => {
        const frac = s.valueBase / total;
        const len = frac * C;
        const el = (
          <circle
            key={s.key}
            r={R}
            cx={0}
            cy={0}
            fill="transparent"
            stroke={colorFor(i)}
            strokeWidth={20}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90)"
          />
        );
        offset += len;
        return el;
      })}
      <circle r={r} fill="var(--mantine-color-dark-7)" />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="12"
        fill="currentColor"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight={700}
      >
        {money(total)}
      </text>
    </svg>
  );
}

const PALETTE = [
  '#f5a623',
  '#20c997',
  '#4dabf7',
  '#b197fc',
  '#ff6b6b',
  '#fcc419',
  '#51cf66',
  '#74c0fc',
  '#e599f7',
  '#ffa94d',
];

function colorFor(i: number): string {
  return PALETTE[i % PALETTE.length];
}
