import { Card, Group, Stack, Text, SimpleGrid, Badge } from '@mantine/core';
import type { PortfolioSnapshot } from './api';
import { money, pct, signedMoney, signedPct, pnlColor } from './format';
import { BROKER_LABEL } from './utils';

export function OverviewTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const k = snapshot.kpis;
  const asOf = new Date(snapshot.asOf);

  const cashByBroker: Record<string, number> = {};
  for (const c of snapshot.cash) {
    cashByBroker[c.broker] = (cashByBroker[c.broker] ?? 0) + c.amountBase;
  }

  const holdingsByBroker: Record<string, number> = {};
  for (const h of snapshot.holdings) {
    const mv = h.marketValueBase ?? h.costBasisBase;
    for (const b of h.perBroker) {
      const share = h.quantity > 0 ? (b.quantity / h.quantity) * mv : 0;
      holdingsByBroker[b.broker] = (holdingsByBroker[b.broker] ?? 0) + share;
    }
  }

  const brokers = Array.from(
    new Set([...Object.keys(holdingsByBroker), ...Object.keys(cashByBroker)]),
  ).sort();

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
        <Kpi label="Total value" value={money(k.totalValueBase)} />
        <Kpi label="Invested" value={money(k.invested)} dim />
        <Kpi
          label="Unrealized P&L"
          value={signedMoney(k.unrealizedPnlBase)}
          sub={signedPct(k.unrealizedPnlPct)}
          color={pnlColor(k.unrealizedPnlBase)}
        />
        <Kpi
          label="Realized YTD"
          value={signedMoney(k.realizedYtdBase)}
          color={pnlColor(k.realizedYtdBase)}
        />
        <Kpi label="Dividends YTD" value={money(k.dividendsYtdBase)} color="teal" />
        <Kpi label="Cash" value={money(k.totalCashBase)} dim />
      </SimpleGrid>

      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>Value by broker</Text>
          <Text size="xs" c="dimmed">
            As of {asOf.toLocaleString()} · Base {snapshot.baseCurrency}
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
          {brokers.map(b => {
            const hold = holdingsByBroker[b] ?? 0;
            const cash = cashByBroker[b] ?? 0;
            const total = hold + cash;
            const share = k.totalValueBase > 0 ? total / k.totalValueBase : 0;
            return (
              <Card key={b} padding="sm" withBorder radius="md">
                <Group justify="space-between" mb={4}>
                  <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                    {BROKER_LABEL[b] ?? b}
                  </Text>
                  <Badge size="xs" variant="light">{pct(share)}</Badge>
                </Group>
                <Text size="lg" fw={700} className="lh-mono">{money(total)}</Text>
                <Text size="xs" c="dimmed" mt={2}>
                  {money(hold)} invested · {money(cash)} cash
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </Card>
    </Stack>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
  dim,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  dim?: boolean;
}) {
  return (
    <Card padding="sm" withBorder radius="md">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text
        size="xl"
        fw={700}
        className="lh-mono"
        c={dim ? 'dimmed' : color}
        mt={2}
      >
        {value}
      </Text>
      {sub && (
        <Text size="xs" c={color ?? 'dimmed'} mt={2} className="lh-mono">
          {sub}
        </Text>
      )}
    </Card>
  );
}
