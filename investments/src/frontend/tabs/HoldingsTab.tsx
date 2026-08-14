import { Badge, Card, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import type { Holding, Portfolio, TradeRef } from '../../shared/types';
import { currencyFmt, money, num, pnlColor, signedMoney, signedPct } from '../lib/format';
import { brokerLabel } from '../lib/utils';

export function HoldingsTab({
  portfolio,
  onOpenInstrument,
}: {
  portfolio: Portfolio;
  onOpenInstrument: (id: string) => void;
}) {
  const holdings = portfolio.holdings;

  if (holdings.length === 0) {
    return (
      <Card padding="xl" withBorder>
        <Text size="sm" c="dimmed" ta="center">
          No open positions. Upload broker files to populate the portfolio.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={960}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Instrument</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Avg cost (€)</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Value (€)</Table.Th>
                <Table.Th ta="right">Gain</Table.Th>
                <Table.Th>Last buy</Table.Th>
                <Table.Th>Last sell</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {holdings.map(h => (
                <HoldingRow key={h.instrumentId} h={h} onOpen={() => onOpenInstrument(h.instrumentId)} />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function HoldingRow({ h, onOpen }: { h: Holding; onOpen: () => void }) {
  return (
    <Table.Tr style={{ cursor: 'pointer' }} onClick={onOpen}>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} size="sm" className="lh-mono">{h.symbol}</Text>
          <Text size="xs" c="dimmed" truncate>{h.name}</Text>
          {!h.priced && (
            <Tooltip label="No live quote — shown at cost. Map a Yahoo symbol on the Instruments tab.">
              <Badge size="xs" color="gray" variant="light">unpriced</Badge>
            </Tooltip>
          )}
        </Group>
        <Group gap={6} mt={2}>
          <Badge size="xs" variant="default" radius="xl">{h.assetClass}</Badge>
          <Badge size="xs" variant="default" radius="xl">{h.currency}</Badge>
        </Group>
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">{num(h.quantity)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {money(h.avgCostEur, { precise: true })}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {h.priceNative != null ? currencyFmt(h.priceNative, h.currency) : '—'}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">{money(h.valueEur)}</Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {h.priced ? (
          <Stack gap={0} align="flex-end">
            <Text size="sm" fw={600} c={pnlColor(h.gainEur)} className="lh-mono">
              {signedMoney(h.gainEur)}
            </Text>
            <Text size="xs" c={pnlColor(h.gainEur)} className="lh-mono">
              {signedPct(h.gainPct)}
            </Text>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">—</Text>
        )}
      </Table.Td>
      <Table.Td>
        <TradeCell trade={h.lastBuy} />
      </Table.Td>
      <Table.Td>
        <TradeCell trade={h.lastSell} />
      </Table.Td>
    </Table.Tr>
  );
}

function TradeCell({ trade }: { trade: TradeRef | null }) {
  if (!trade) return <Text size="xs" c="dimmed">—</Text>;
  return (
    <Stack gap={0}>
      <Text size="xs" className="lh-mono">{trade.date}</Text>
      <Text size="xs" c="dimmed" className="lh-mono">
        {num(trade.quantity)} @ {currencyFmt(trade.priceNative, trade.currency)}
      </Text>
      <Text size="xs" c="dimmed">{brokerLabel(trade.broker)}</Text>
    </Stack>
  );
}
