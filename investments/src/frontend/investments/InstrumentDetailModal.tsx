import { useEffect, useState } from 'react';
import {
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Tabs,
} from '@mantine/core';
import type { InstrumentDetail } from './api';
import { api } from './api';
import { currencyFmt, money, num, pnlColor, signedMoney } from './format';
import { BROKER_LABEL } from './utils';

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
            <Text fw={700} size="lg">
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
            <Stat label="Avg cost (native)" value={currencyFmt(h.avgCost, h.currency)} />
            <Stat
              label="Avg cost (€)"
              value={money(h.avgCostBase, { precise: true })}
            />
            <Stat
              label="Market price"
              value={h.marketPrice ? currencyFmt(h.marketPrice, h.currency) : '—'}
            />
            <Stat
              label="Market value"
              value={h.marketValueBase != null ? money(h.marketValueBase) : '—'}
            />
            <Stat
              label="Unrealized P&L"
              value={signedMoney(h.unrealizedPnlBase)}
              color={pnlColor(h.unrealizedPnlBase)}
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
          <Tabs.Tab value="lots">Open lots ({detail.openLots.length})</Tabs.Tab>
          <Tabs.Tab value="txs">Transactions ({detail.transactions.length})</Tabs.Tab>
          <Tabs.Tab value="realized">Realized ({detail.realized.length})</Tabs.Tab>
          <Tabs.Tab value="income">Income ({detail.income.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="lots" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Acquired</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Cost/unit (native)</Table.Th>
                <Table.Th ta="right">Cost/unit (€)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.openLots.map(lot => (
                <Table.Tr key={lot.sourceTxId}>
                  <Table.Td className="lh-mono">{lot.acquiredAt}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[lot.broker] ?? lot.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">{num(lot.quantity)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {currencyFmt(lot.costPerUnit, lot.costCurrency)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(lot.costPerUnitBase, { precise: true })}
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
                <Table.Th>Kind</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.transactions.map(t => (
                <Table.Tr key={t.id}>
                  <Table.Td className="lh-mono">{t.timestamp}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[t.broker] ?? t.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={kindColor(t.kind)}>
                      {t.kind}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.quantity != null ? num(t.quantity) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {t.price != null ? currencyFmt(t.price, t.currency) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {currencyFmt(t.amount, t.currency)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Tabs.Panel>

        <Tabs.Panel value="realized" pt="sm">
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Acquired</Table.Th>
                <Table.Th>Sold</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Proceeds (€)</Table.Th>
                <Table.Th ta="right">Cost (€)</Table.Th>
                <Table.Th ta="right">P&L</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detail.realized.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="lh-mono">{r.acquiredAt}</Table.Td>
                  <Table.Td className="lh-mono">{r.soldAt}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[r.broker] ?? r.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">{num(r.quantity)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(r.proceedsBase)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(r.costBasisBase)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" fw={600} c={pnlColor(r.realizedPnlBase)}>
                      {signedMoney(r.realizedPnlBase)}
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
                <Table.Th>Kind</Table.Th>
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
                      {BROKER_LABEL[r.broker] ?? r.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light">{r.kind}</Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(r.grossBase)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(r.taxBase)}</Table.Td>
                  <Table.Td ta="right" className="lh-mono">{money(r.netBase)}</Table.Td>
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

function kindColor(kind: string): string {
  switch (kind) {
    case 'buy':
      return 'blue';
    case 'sell':
      return 'orange';
    case 'dividend':
      return 'teal';
    case 'interest':
      return 'cyan';
    case 'tax':
      return 'red';
    default:
      return 'gray';
  }
}
