import { useEffect, useState } from 'react';
import {
  Badge,
  Center,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import type { InstrumentDetail, TxType } from '../shared/types';
import { api } from './lib/api';
import { currencyFmt, money, num, pnlColor, signedMoney } from './lib/format';
import { brokerLabel } from './lib/utils';

export function InstrumentDetailModal({
  instrumentId,
  onClose,
}: {
  instrumentId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InstrumentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!instrumentId) return;
    setLoading(true);
    setDetail(null);
    api
      .instrument(instrumentId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [instrumentId]);

  return (
    <Modal
      opened={!!instrumentId}
      onClose={onClose}
      size="xl"
      title={
        detail ? (
          <Group gap="xs">
            <Text fw={700} size="lg" className="lh-mono">
              {detail.instrument.symbol}
            </Text>
            <Text fw={500} size="sm" c="dimmed">
              {detail.instrument.name}
            </Text>
            <Badge size="sm" variant="light">
              {detail.instrument.assetClass}
            </Badge>
            <Badge size="sm" variant="default">
              {detail.instrument.currency}
            </Badge>
            {detail.instrument.isin && (
              <Text size="xs" c="dimmed" className="lh-mono">
                {detail.instrument.isin}
              </Text>
            )}
          </Group>
        ) : (
          'Loading…'
        )
      }
    >
      {loading && (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      )}
      {!loading && detail && <InstrumentBody detail={detail} />}
    </Modal>
  );
}

function InstrumentBody({ detail }: { detail: InstrumentDetail }) {
  const h = detail.holding;

  return (
    <Stack gap="md">
      {h ? (
        <Card padding="md" withBorder>
          <Group justify="space-between" wrap="wrap">
            <Stat label="Quantity" value={num(h.quantity)} />
            <Stat label="Avg cost (€)" value={money(h.avgCostEur, { precise: true })} />
            <Stat label="Cost basis (€)" value={money(h.costEur)} />
            <Stat
              label="Price"
              value={h.priceNative != null ? currencyFmt(h.priceNative, h.currency) : '—'}
            />
            <Stat label="Value (€)" value={money(h.valueEur)} />
            <Stat
              label="Gain"
              value={h.priced ? signedMoney(h.gainEur) : '—'}
              color={h.priced ? pnlColor(h.gainEur) : undefined}
            />
          </Group>
        </Card>
      ) : (
        <Card padding="md" withBorder>
          <Text size="sm" c="dimmed">No open position. History below.</Text>
        </Card>
      )}

      <Tabs defaultValue="lots">
        <Tabs.List>
          <Tabs.Tab value="lots">Open lots ({detail.lots.length})</Tabs.Tab>
          <Tabs.Tab value="txs">Transactions ({detail.transactions.length})</Tabs.Tab>
          <Tabs.Tab value="sales">Sales ({detail.sales.length})</Tabs.Tab>
          <Tabs.Tab value="income">Income ({detail.income.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="lots" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Acquired</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Buy price</Table.Th>
                <Table.Th ta="right">Cost (€)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.lots.map((lot, i) => (
                <Table.Tr key={`${lot.date}:${i}`}>
                  <Table.Td className="lh-mono">{lot.date}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {brokerLabel(lot.broker)}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">{num(lot.quantity)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {currencyFmt(lot.priceNative, lot.currency)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(lot.costEur, { precise: true })}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="txs" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Amount (€)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.transactions.map(t => (
                <Table.Tr key={t.id}>
                  <Table.Td className="lh-mono">{t.date}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {brokerLabel(t.broker)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={typeColor(t.type)}>
                      {t.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.quantity != null ? num(t.quantity) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.priceNative != null ? currencyFmt(t.priceNative, t.currency) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" c={pnlColor(t.amountEur)} className="lh-mono">
                      {signedMoney(t.amountEur, { precise: true })}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="sales" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Bought</Table.Th>
                <Table.Th>Sold</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Proceeds (€)</Table.Th>
                <Table.Th ta="right">Cost (€)</Table.Th>
                <Table.Th ta="right">Gain</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.sales.map((s, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="lh-mono">{s.buyDate}</Table.Td>
                  <Table.Td className="lh-mono">{s.sellDate}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {brokerLabel(s.broker)}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">{num(s.quantity)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(s.proceedsEur)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(s.costEur)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" fw={600} c={pnlColor(s.gainEur)}>
                      {signedMoney(s.gainEur)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="income" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Year</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th ta="right">Gross (€)</Table.Th>
                <Table.Th ta="right">Tax (€)</Table.Th>
                <Table.Th ta="right">Net (€)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.income.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="lh-mono">{r.year}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {brokerLabel(r.broker)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light">{r.type}</Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.grossEur, { precise: true })}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.taxEur, { precise: true })}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.netEur, { precise: true })}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Stack gap={0} miw={120}>
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="md" fw={600} className="lh-mono" c={color}>
        {value}
      </Text>
    </Stack>
  );
}

function typeColor(type: TxType): string {
  switch (type) {
    case 'buy':
      return 'blue';
    case 'sell':
      return 'orange';
    case 'dividend':
      return 'teal';
    case 'interest':
      return 'cyan';
    case 'fee':
      return 'red';
    default:
      return 'gray';
  }
}
