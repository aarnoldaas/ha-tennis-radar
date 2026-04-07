import { Card, SimpleGrid, Stack, Text, Alert } from '@mantine/core';
import type { InvestmentData } from './types';
import { formatNum, formatEur, pnlColor } from './utils';

export function PortfolioSummaryCard({ data }: { data: InvestmentData }) {
  const ps = data.portfolioSummary;
  const hasStalePrice = data.holdings.some(h => h.priceLastUpdated === null && h.currentPrice > 0);

  const items = [
    { label: 'Portfolio Value', value: formatEur(ps.totalValue), color: undefined },
    { label: 'Cost Basis', value: formatEur(ps.totalCost), color: undefined },
    { label: 'Unrealized P&L', value: formatEur(ps.unrealizedPnl), color: pnlColor(ps.unrealizedPnl) },
    { label: 'Realized P&L', value: formatEur(ps.totalRealizedPnl), color: pnlColor(ps.totalRealizedPnl) },
    { label: 'Income', value: formatEur(ps.totalIncome), color: '#51cf66' },
    { label: 'Total Return', value: `${formatEur(ps.totalReturn)} (${formatNum(ps.totalReturnPct)}%)`, color: pnlColor(ps.totalReturn) },
  ];

  return (
    <Card padding="md" mb="md" withBorder>
      {hasStalePrice && (
        <Alert color="yellow" mb="sm" variant="light" title="Stale prices">
          Some holdings use hardcoded fallback prices. Click "Refresh Prices" for live data.
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs">
        {items.map(item => (
          <Stack key={item.label} gap={2} align="center">
            <Text size="xs" c="dimmed">{item.label}</Text>
            <Text size="sm" fw={700} c={item.color}>{item.value}</Text>
          </Stack>
        ))}
      </SimpleGrid>
    </Card>
  );
}
