import { Card, SimpleGrid, Text } from '@mantine/core';
import type { PortfolioSnapshot } from './api';
import { money, signedMoney, signedPct, pnlColor } from './format';

export function OverviewTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const k = snapshot.kpis;

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
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
    </SimpleGrid>
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
