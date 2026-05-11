import { useMemo } from 'react';
import {
  Alert,
  Badge,
  Card,
  Group,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { MergedHolding, PortfolioSnapshot } from './api';
import { currencyFmt, money, num, pnlColor, signedMoney, signedPct } from './format';
import { BROKER_LABEL } from './utils';

export function HoldingsTab({
  snapshot,
  onOpenInstrument,
}: {
  snapshot: PortfolioSnapshot;
  onOpenInstrument: (id: string) => void;
}) {
  const sorted = useMemo(() => {
    return [...snapshot.holdings].sort((a, b) => {
      const av = a.marketValueBase ?? a.costBasisBase;
      const bv = b.marketValueBase ?? b.costBasisBase;
      return bv - av;
    });
  }, [snapshot.holdings]);

  if (sorted.length === 0) {
    return (
      <Stack gap="md">
        {snapshot.unresolved.length > 0 && <UnresolvedBanner snapshot={snapshot} />}
        <Card padding="xl" withBorder>
          <Text size="sm" c="dimmed" ta="center">
            No open positions. Upload broker files to populate the portfolio.
          </Text>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {snapshot.unresolved.length > 0 && <UnresolvedBanner snapshot={snapshot} />}
      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={720}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Instrument</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Avg cost (€)</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Market value</Table.Th>
                <Table.Th ta="right">Unrealized P&L</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map(h => (
                <HoldingRow
                  key={h.instrumentId}
                  h={h}
                  onOpen={() => onOpenInstrument(h.instrumentId)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function HoldingRow({ h, onOpen }: { h: MergedHolding; onOpen: () => void }) {
  const mv = h.marketValueBase;
  const pnl = h.unrealizedPnlBase;
  const pnlPct = h.unrealizedPnlPct;

  return (
    <Table.Tr style={{ cursor: 'pointer' }} onClick={onOpen}>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} size="sm" className="lh-mono">{h.symbol}</Text>
          <Text size="xs" c="dimmed" truncate>{h.name}</Text>
        </Group>
        <Group gap={6} mt={2}>
          <Badge size="xs" variant="default" radius="xl">{h.assetClass}</Badge>
          <Badge size="xs" variant="default" radius="xl">{h.currency}</Badge>
        </Group>
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">{num(h.quantity)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {money(h.avgCostBase, { precise: true })}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {h.marketPrice != null ? currencyFmt(h.marketPrice, h.currency) : '—'}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {mv != null ? money(mv) : <Text size="xs" c="dimmed" span>@ cost {money(h.costBasisBase)}</Text>}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {pnl != null ? (
          <Stack gap={0} align="flex-end">
            <Text size="sm" fw={600} c={pnlColor(pnl)} className="lh-mono">
              {signedMoney(pnl)}
            </Text>
            <Text size="xs" c={pnlColor(pnl)} className="lh-mono">
              {signedPct(pnlPct)}
            </Text>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">—</Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

function UnresolvedBanner({ snapshot }: { snapshot: PortfolioSnapshot }) {
  return (
    <Alert color="yellow" variant="light" title="Unresolved instruments">
      <Text size="xs" mb="xs">
        {snapshot.unresolved.length} broker symbol(s) are not in the curated instrument master.
        Add a Yahoo ticker via the Mappings tab to merge these into holdings.
      </Text>
      <Group gap={4} wrap="wrap">
        {snapshot.unresolved.slice(0, 12).map(u => (
          <Badge key={`${u.broker}:${u.rawSymbol}`} size="xs" variant="light">
            {BROKER_LABEL[u.broker] ?? u.broker}: {u.rawSymbol} × {u.count}
          </Badge>
        ))}
        {snapshot.unresolved.length > 12 && (
          <Text size="xs" c="dimmed">+{snapshot.unresolved.length - 12} more</Text>
        )}
      </Group>
    </Alert>
  );
}
