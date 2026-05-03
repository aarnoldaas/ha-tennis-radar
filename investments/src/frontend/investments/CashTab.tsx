import { Badge, Card, Group, Stack, Table, Text } from '@mantine/core';
import type { PortfolioSnapshot } from './api';
import { currencyFmt, money } from './format';
import { BROKER_LABEL } from './utils';

export function CashTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const rows = [...snapshot.cash].sort((a, b) => {
    if (a.broker !== b.broker) return a.broker.localeCompare(b.broker);
    return a.currency.localeCompare(b.currency);
  });
  const total = rows.reduce((s, r) => s + r.amountBase, 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Text size="sm" c="dimmed">
          Per-broker per-currency net cash position. Positive Swedbank / IB entries reflect
          accumulated deposits net of trades and fees. Revolut amounts are the reported
          closing balances from the latest summary export.
        </Text>
        <Card padding="sm" withBorder radius="md">
          <Text size="xs" fw={600} tt="uppercase" c="dimmed">
            Total (EUR)
          </Text>
          <Text size="lg" fw={700} className="lh-mono">
            {money(total)}
          </Text>
        </Card>
      </Group>

      <Card padding={0} withBorder>
        <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Broker</Table.Th>
              <Table.Th>Currency</Table.Th>
              <Table.Th ta="right">Amount (native)</Table.Th>
              <Table.Th ta="right">Amount (€)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    No cash movements recorded.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((r, i) => (
              <Table.Tr key={i}>
                <Table.Td>
                  <Badge size="xs" variant="dot" color="yellow">
                    {BROKER_LABEL[r.broker] ?? r.broker}
                  </Badge>
                </Table.Td>
                <Table.Td className="lh-mono">{r.currency}</Table.Td>
                <Table.Td ta="right" className="lh-mono">
                  {currencyFmt(r.amount, r.currency)}
                </Table.Td>
                <Table.Td ta="right" className="lh-mono">
                  <Text
                    size="sm"
                    fw={600}
                    c={r.amountBase > 0 ? undefined : r.amountBase < 0 ? 'red' : 'dimmed'}
                  >
                    {money(r.amountBase, { precise: true })}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
