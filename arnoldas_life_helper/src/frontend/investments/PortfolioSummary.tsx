import { Card, Alert } from '@mantine/core';
import type { InvestmentData } from './types';
import { formatNum, formatEur, pnlColor } from './utils';

export function PortfolioSummaryCard({ data }: { data: InvestmentData }) {
  const ps = data.portfolioSummary;
  const hasStalePrice = data.holdings.some(h => h.priceLastUpdated === null && h.currentPrice > 0);

  const metrics = [
    { label: 'Cost Basis', value: formatEur(ps.totalCost), color: undefined },
    { label: 'Unrealized', value: formatEur(ps.unrealizedPnl), color: pnlColor(ps.unrealizedPnl) },
    { label: 'Realized', value: formatEur(ps.totalRealizedPnl), color: pnlColor(ps.totalRealizedPnl) },
    { label: 'Income', value: formatEur(ps.totalIncome), color: 'var(--lh-positive)' },
    { label: 'Return', value: `${formatNum(ps.totalReturnPct)}%`, color: pnlColor(ps.totalReturn) },
  ];

  return (
    <Card padding="md" mb="md" withBorder className="lh-card-accent">
      {hasStalePrice && (
        <Alert color="yellow" mb="sm" variant="light" title="Stale prices">
          Some holdings use hardcoded fallback prices. Click "Refresh Prices" for live data.
        </Alert>
      )}

      {/* Hero metric */}
      <div className="lh-hero-metric">
        <div className="lh-hero-metric-value">{formatEur(ps.totalValue)}</div>
        <div className="lh-hero-metric-label">Portfolio Value</div>
      </div>

      {/* Secondary metrics strip */}
      <div className="lh-metric-strip lh-stagger">
        {metrics.map(m => (
          <div key={m.label} className="lh-metric-item">
            <div className="lh-metric-item-value lh-mono" style={{ color: m.color }}>{m.value}</div>
            <div className="lh-metric-item-label">{m.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
