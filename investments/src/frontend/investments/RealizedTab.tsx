import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { PortfolioSnapshot } from './api';
import { money, num, pnlColor, signedMoney } from './format';
import { BROKER_LABEL } from './utils';

export function RealizedTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of snapshot.realized) s.add(r.soldAt.slice(0, 4));
    return ['all', ...[...s].sort().reverse()];
  }, [snapshot.realized]);

  const [year, setYear] = useState<string>(years.length > 1 ? years[1] : 'all');

  const filtered = useMemo(() => {
    return snapshot.realized.filter(r => year === 'all' || r.soldAt.startsWith(year));
  }, [snapshot.realized, year]);

  const total = filtered.reduce((s, r) => s + r.realizedPnlBase, 0);
  const proceeds = filtered.reduce((s, r) => s + r.proceedsBase, 0);
  const cost = filtered.reduce((s, r) => s + r.costBasisBase, 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          size="xs"
          data={years.map(y => ({ value: y, label: y === 'all' ? 'All time' : y }))}
          value={year}
          onChange={setYear}
        />
        <Group gap="lg">
          <Summary label="Proceeds" value={money(proceeds)} />
          <Summary label="Cost basis" value={money(cost)} />
          <Summary label="Net P&L" value={signedMoney(total)} color={pnlColor(total)} />
        </Group>
      </Group>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Sold</Table.Th>
                <Table.Th>Instrument</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Held (d)</Table.Th>
                <Table.Th ta="right">Proceeds</Table.Th>
                <Table.Th ta="right">Cost</Table.Th>
                <Table.Th ta="right">P&L</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No realized trades in this period.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filtered.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="lh-mono">{r.soldAt}</Table.Td>
                  <Table.Td>
                    <Text size="sm" className="lh-mono" fw={600}>
                      {r.symbol}
                    </Text>
                    <Text size="xs" c="dimmed">
                      acquired {r.acquiredAt}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[r.broker] ?? r.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {num(r.quantity)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {r.holdingDays}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.proceedsBase)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.costBasisBase)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" fw={600} c={pnlColor(r.realizedPnlBase)}>
                      {signedMoney(r.realizedPnlBase)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack gap={0} align="flex-end">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="md" fw={700} className="lh-mono" c={color}>
        {value}
      </Text>
    </Stack>
  );
}
