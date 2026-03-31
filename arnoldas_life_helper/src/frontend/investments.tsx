import { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  Container,
  Group,
  Stack,
  Center,
  Tabs,
  Badge,
  Card,
  Text,
  Title,
  Button,
  Table,
  Loader,
  Alert,
  ScrollArea,
  UnstyledButton,
  SimpleGrid,
  Progress,
  Select,
  TextInput,
  FileButton,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

const BASE = (window as any).INGRESS_PATH || '';

// --- Types ---

interface ITransaction {
  id: string;
  broker: string;
  type: string;
  date: string;
  symbol: string;
  description: string;
  quantity: number;
  pricePerUnit: number;
  amount: number;
  currency: string;
  fees: number;
  amountInBaseCurrency: number;
  raw?: { debitCredit?: string };
}

interface ILot {
  acquisitionDate: string;
  remainingQuantity: number;
  costBasisPerShare: number;
  source: string;
  broker: string;
  currency: string;
}

interface IHolding {
  symbol: string;
  name: string;
  brokers?: string[];
  lots?: ILot[];
  totalQuantity: number;
  averageCostBasis: number;
  totalCostBasis: number;
  currency: string;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  totalCostBasisEur: number;
  currentValueEur: number;
  unrealizedPnlEur: number;
  priceLastUpdated: string | null;
}

interface IRealizedTrade {
  sellTransactionId: string;
  symbol: string;
  broker: string;
  sellDate: string;
  quantity: number;
  salePricePerShare: number;
  proceeds: number;
  currency: string;
  totalCostBasis: number;
  realizedPnl: number;
  fees: number;
  holdPeriod: 'short-term' | 'long-term';
  proceedsEur: number;
  totalCostBasisEur: number;
  realizedPnlEur: number;
}

interface IDividendPayment {
  transactionId: string;
  date: string;
  symbol: string;
  broker: string;
  amount: number;
  currency: string;
  amountEur: number;
  description: string;
}

interface InterestSummary {
  flexibleCashEur: number;
  flexibleCashUsd: number;
  savingsEur: number;
  savingsUsd: number;
  totalEur: number;
}

interface AllocationEntry {
  name: string;
  valueEur: number;
  percent: number;
}

interface AllocationBreakdown {
  byGeography: AllocationEntry[];
  byAssetClass: AllocationEntry[];
  byCurrency: AllocationEntry[];
  bySector: AllocationEntry[];
}

interface RiskWarning {
  type: string;
  severity: 'warning' | 'info';
  message: string;
}

interface RsuByYear {
  year: number;
  totalShares: number;
  totalCompensation: number;
  totalCompensationEur: number;
}

interface RsuVesting {
  grantId: string;
  vestingDate: string;
  shares: number;
  fmvAtVesting: number;
  compensationValue: number;
  compensationValueEur: number;
  isSameDaySale: boolean;
}

interface RsuByGrant {
  grantId: string;
  totalShares: number;
  totalCompensation: number;
  vestings: RsuVesting[];
}

interface RsuCompensationSummary {
  totalCompensation: number;
  totalCompensationEur: number;
  byYear: RsuByYear[];
  byGrant?: RsuByGrant[];
  cumulative?: Array<{ date: string; cumulativeCompensation: number; cumulativeCompensationEur: number }>;
}

interface EsppSummary {
  totalSharesPurchased: number;
  totalCostBasis: number;
  totalFmvAtPurchase: number;
  totalDiscountCaptured: number;
  totalDiscountCapturedEur: number;
  averageDiscountPercent: number;
}

interface StockStats {
  symbol: string;
  currentQty: number;
  costBasisEur: number;
  currentValueEur: number;
  unrealizedPnlEur: number;
  realizedPnlEur: number;
  dividendsEur: number;
  feesEur: number;
  totalPnlEur: number;
  totalInvestedEur: number;
  tradeCount: number;
  firstDate: string;
  isOpen: boolean;
}

interface StockInfo {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  peRatio: number | null;
  forwardPeRatio: number | null;
  epsTrailingTwelveMonths: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  exDividendDate: string | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  beta: number | null;
  earningsDate: string | null;
  lastUpdated: string;
}

interface PriceHistoryEntry {
  date: string;
  price: number;
  currency: string;
}

interface AiSuggestions {
  suggestions: string | null;
  generatedAt: string | null;
}

interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
  realizedTrades: IRealizedTrade[];
  dividends: IDividendPayment[];
  interestSummary: InterestSummary | null;
  totalRealizedPnlEur: number;
  totalDividendsEur: number;
  totalInterestEur: number;
  priceRefreshTime: string | null;
  allocation: AllocationBreakdown;
  riskWarnings: RiskWarning[];
  rsuCompensation: RsuCompensationSummary;
  esppSummary: EsppSummary;
  tickerMeta?: Record<string, { geography: string; sector: string; currencyExposure: string }>;
  portfolioSummary: { totalCost: number; totalValue: number; unrealizedPnl: number; totalRealizedPnl: number; totalDividends: number; totalInterest: number; totalIncome: number; totalReturn: number; totalReturnPct: number };
  stockStats: StockStats[];
  stockStatsTotals: { totalInvested: number; realizedPnl: number; unrealizedPnl: number; dividends: number; totalPnl: number };
  dividendsByStock: Array<{ symbol: string; count: number; totalEur: number }>;
  realizedTradeSummary: { totalPnl: number; shortTermPnl: number; longTermPnl: number; shortTermCount: number; longTermCount: number };
  rsuByYearWithCumulative: Array<{ year: number; totalShares: number; totalCompensation: number; totalCompensationEur: number; cumulativeUsd: number; cumulativeEur: number }>;
  priceHistory: Record<string, PriceHistoryEntry[]>;
  stockInfo: StockInfo[];
}

type SortDir = 'asc' | 'desc';

const TYPE_COLORS: Record<string, string> = {
  BUY: 'green',
  SELL: 'red',
  CRYPTO_SELL: 'red',
  DIVIDEND: 'blue',
  TAX: 'orange',
  FEE: 'yellow',
  TRANSFER: 'gray',
  INTEREST: 'cyan',
  RSU_VEST: 'violet',
  ESPP_PURCHASE: 'grape',
};

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatEur(n: number): string {
  return `\u20AC${formatNum(n)}`;
}

function pnlColor(n: number): string {
  return n >= 0 ? '#51cf66' : '#ff6b6b';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatHoldingsForClipboard(holdings: IHolding[]): string {
  const sorted = [...holdings].sort((a, b) => b.currentValueEur - a.currentValueEur);
  const totalCost = holdings.reduce((s, h) => s + h.totalCostBasisEur, 0);
  const totalValue = holdings.reduce((s, h) => s + h.currentValueEur, 0);
  const totalPnl = holdings.reduce((s, h) => s + h.unrealizedPnlEur, 0);

  const lines = [
    `My investment portfolio holdings (all values in EUR):`,
    ``,
    `| Symbol | Qty | Avg Cost | Total Cost | Price | Value | P&L | P&L % |`,
    `|--------|-----|----------|------------|-------|-------|-----|-------|`,
  ];
  for (const h of sorted) {
    const qty = h.totalQuantity % 1 === 0 ? h.totalQuantity.toFixed(0) : h.totalQuantity.toFixed(4);
    lines.push(
      `| ${h.symbol} | ${qty} | ${h.averageCostBasis.toFixed(2)} ${h.currency} | ${h.totalCostBasisEur.toFixed(2)} | ${h.currentPrice > 0 ? h.currentPrice.toFixed(2) : 'N/A'} | ${h.currentPrice > 0 ? h.currentValueEur.toFixed(2) : 'N/A'} | ${h.currentPrice > 0 ? h.unrealizedPnlEur.toFixed(2) : 'N/A'} | ${h.currentPrice > 0 ? h.unrealizedPnlPercent.toFixed(2) + '%' : 'N/A'} |`
    );
  }
  lines.push(
    `| **Total** | | | **${totalCost.toFixed(2)}** | | **${totalValue.toFixed(2)}** | **${totalPnl.toFixed(2)}** | **${totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) + '%' : 'N/A'}** |`
  );
  return lines.join('\n');
}

// --- Components ---

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: SortDir;
  onSort: (field: string) => void;
}) {
  const active = sortField === field;
  return (
    <UnstyledButton onClick={() => onSort(field)} style={{ fontWeight: 600 }}>
      {label} {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
    </UnstyledButton>
  );
}

function PortfolioSummaryCard({ data }: { data: InvestmentData }) {
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

function HoldingsTable({ holdings }: { holdings: IHolding[] }) {
  const [sortField, setSortField] = useState('currentValueEur');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    if (!search) return holdings;
    const q = search.toLowerCase();
    return holdings.filter(h => h.symbol.toLowerCase().includes(q) || h.name.toLowerCase().includes(q));
  }, [holdings, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(() => ({
    totalCost: filtered.reduce((s, h) => s + h.totalCostBasisEur, 0),
    totalValue: filtered.reduce((s, h) => s + h.currentValueEur, 0),
    totalPnl: filtered.reduce((s, h) => s + h.unrealizedPnlEur, 0),
  }), [filtered]);

  return (
    <Stack gap="xs">
      <TextInput
        placeholder="Search by symbol..."
        size="xs"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        style={{ maxWidth: 250 }}
      />
    <ScrollArea>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Qty" field="totalQuantity" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Avg Cost" field="averageCostBasis" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Total Cost" field="totalCostBasisEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Price" field="currentPrice" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Value" field="currentValueEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L" field="unrealizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L %" field="unrealizedPnlPercent" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map(h => {
            const isExpanded = expanded === h.symbol;
            const hasLots = h.lots && h.lots.length > 1;
            return (
              <>
                <Table.Tr
                  key={h.symbol}
                  onClick={hasLots ? () => setExpanded(isExpanded ? null : h.symbol) : undefined}
                  style={hasLots ? { cursor: 'pointer' } : undefined}
                >
                  <Table.Td>
                    <Group gap={4}>
                      {hasLots && <Text size="sm" c="dimmed">{isExpanded ? '\u25BC' : '\u25B6'}</Text>}
                      <Text fw={600}>{h.symbol}</Text>
                      {h.brokers?.map(b => (
                        <Badge key={b} size="xs" variant="light" color="gray">{b}</Badge>
                      ))}
                      {h.priceLastUpdated === null && h.currentPrice > 0 && (
                        <Badge size="xs" color="yellow" variant="dot">stale</Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.totalQuantity, h.totalQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.averageCostBasis)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(h.totalCostBasisEur)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatNum(h.currentPrice) : '\u2014'}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatEur(h.currentValueEur) : '\u2014'}</Table.Td>
                  <Table.Td style={{ textAlign: 'right', color: pnlColor(h.unrealizedPnl) }}>
                    {h.currentPrice > 0 ? formatEur(h.unrealizedPnlEur) : '\u2014'}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', color: pnlColor(h.unrealizedPnlPercent) }}>
                    {h.currentPrice > 0 ? `${formatNum(h.unrealizedPnlPercent)}%` : '\u2014'}
                  </Table.Td>
                </Table.Tr>
                {isExpanded && h.lots && (
                  <Table.Tr key={h.symbol + '-lots'}>
                    <Table.Td colSpan={8} style={{ padding: 0, background: 'var(--mantine-color-body)' }}>
                      <div style={{ padding: '8px 16px' }}>
                        <Text size="xs" fw={600} c="dimmed" mb="xs">Tax Lots ({h.lots.length})</Text>
                        <Table striped>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Acquired</Table.Th>
                              <Table.Th>Source</Table.Th>
                              <Table.Th>Broker</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Cost/Share</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Total Cost</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {h.lots.map((lot, i) => (
                              <Table.Tr key={lot.acquisitionDate + '-' + i}>
                                <Table.Td>{lot.acquisitionDate}</Table.Td>
                                <Table.Td>
                                  <Badge size="xs" variant="light" color={lot.source === 'RSU' ? 'violet' : lot.source === 'ESPP' ? 'grape' : 'blue'}>
                                    {lot.source}
                                  </Badge>
                                </Table.Td>
                                <Table.Td><Text size="sm">{lot.broker}</Text></Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.remainingQuantity, lot.remainingQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.costBasisPerShare)} {lot.currency}</Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.remainingQuantity * lot.costBasisPerShare)} {lot.currency}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                )}
              </>
            );
          })}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr style={{ fontWeight: 700 }}>
            <Table.Td>Total</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalCost)}</Table.Td>
            <Table.Td />
            <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalValue)}</Table.Td>
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>
              {formatEur(totals.totalPnl)}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>
              {totals.totalCost > 0 ? `${formatNum((totals.totalPnl / totals.totalCost) * 100)}%` : '\u2014'}
            </Table.Td>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea>
    </Stack>
  );
}

function RealizedTradesTable({ trades }: { trades: IRealizedTrade[] }) {
  const [sortField, setSortField] = useState('sellDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [year, setYear] = useState<string>('all');

  const years = useMemo(() => {
    const yrs = [...new Set(trades.map(t => t.sellDate.slice(0, 4)))].sort().reverse();
    return [{ value: 'all', label: 'All Years' }, ...yrs.map(y => ({ value: y, label: y }))];
  }, [trades]);

  const filtered = useMemo(
    () => year === 'all' ? trades : trades.filter(t => t.sellDate.startsWith(year)),
    [trades, year]
  );

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(() => {
    const shortTerm = filtered.filter(t => t.holdPeriod === 'short-term');
    const longTerm = filtered.filter(t => t.holdPeriod === 'long-term');
    return {
      total: filtered.reduce((s, t) => s + t.realizedPnlEur, 0),
      shortTermPnl: shortTerm.reduce((s, t) => s + t.realizedPnlEur, 0),
      longTermPnl: longTerm.reduce((s, t) => s + t.realizedPnlEur, 0),
      shortTermCount: shortTerm.length,
      longTermCount: longTerm.length,
    };
  }, [filtered]);

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Select
          data={years}
          value={year}
          onChange={(v) => v && setYear(v)}
          size="xs"
          style={{ width: 140 }}
        />
        {year !== 'all' && (
          <Group gap="md">
            <Text size="xs" c="dimmed">
              Short-term ({totals.shortTermCount}): <Text span size="xs" c={pnlColor(totals.shortTermPnl)} fw={600}>{formatEur(totals.shortTermPnl)}</Text>
            </Text>
            <Text size="xs" c="dimmed">
              Long-term ({totals.longTermCount}): <Text span size="xs" c={pnlColor(totals.longTermPnl)} fw={600}>{formatEur(totals.longTermPnl)}</Text>
            </Text>
          </Group>
        )}
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><SortHeader label="Date" field="sellDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Qty" field="quantity" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Cost Basis" field="totalCostBasisEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Proceeds" field="proceedsEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="P&L" field="realizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Hold" field="holdPeriod" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((t, i) => (
              <Table.Tr key={t.sellTransactionId + '-' + i}>
                <Table.Td>{t.sellDate}</Table.Td>
                <Table.Td><Text fw={600}>{t.symbol}</Text></Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatNum(t.quantity, t.quantity % 1 === 0 ? 0 : 4)}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.totalCostBasisEur)}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.proceedsEur)}</Table.Td>
                <Table.Td style={{ textAlign: 'right', color: pnlColor(t.realizedPnlEur) }}>
                  {formatEur(t.realizedPnlEur)}
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" color={t.holdPeriod === 'long-term' ? 'teal' : 'gray'} variant="light">
                    {t.holdPeriod}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ fontWeight: 700 }}>
              <Table.Td>Total ({filtered.length})</Table.Td>
              <Table.Td />
              <Table.Td />
              <Table.Td />
              <Table.Td />
              <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.total) }}>{formatEur(totals.total)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function IncomeCard({ data }: { data: InvestmentData }) {
  const hasDividends = data.dividends.length > 0;
  const hasInterest = data.interestSummary && data.interestSummary.totalEur > 0;
  const [showDividendBreakdown, setShowDividendBreakdown] = useState(false);
  if (!hasDividends && !hasInterest) return null;

  const totalIncome = data.totalDividendsEur + data.totalInterestEur;
  const dividendsByStock = data.dividendsByStock;

  return (
    <Card padding="sm" mb="md" withBorder>
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={600}>Income Summary</Text>
          {hasDividends && dividendsByStock.length > 1 && (
            <UnstyledButton onClick={() => setShowDividendBreakdown(!showDividendBreakdown)}>
              <Text size="xs" c="dimmed">{showDividendBreakdown ? '\u25BC' : '\u25B6'} by stock</Text>
            </UnstyledButton>
          )}
        </Group>
        <Group gap="lg">
          {hasDividends && (
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">Dividends ({data.dividends.length})</Text>
              <Text size="sm">{formatEur(data.totalDividendsEur)}</Text>
            </Stack>
          )}
          {hasInterest && data.interestSummary && (
            <Stack gap={0} align="flex-end">
              <Text size="xs" c="dimmed">Interest</Text>
              <Text size="sm">{formatEur(data.interestSummary.totalEur)}</Text>
            </Stack>
          )}
          <Stack gap={0} align="flex-end">
            <Text size="xs" c="dimmed">Total Income</Text>
            <Text size="sm" fw={700} c="cyan">{formatEur(totalIncome)}</Text>
          </Stack>
        </Group>
      </Group>
      {showDividendBreakdown && (
        <Table striped mt="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Symbol</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Payments</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Total (EUR)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dividendsByStock.map(d => (
              <Table.Tr key={d.symbol}>
                <Table.Td><Text fw={600}>{d.symbol}</Text></Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{d.count}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>{formatEur(d.totalEur)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Card>
  );
}

function TransactionsTable({ transactions }: { transactions: ITransaction[] }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const types = useMemo(() => {
    const ts = [...new Set(transactions.map(t => t.type))].sort();
    return [{ value: 'all', label: 'All Types' }, ...ts.map(t => ({ value: t, label: t }))];
  }, [transactions]);

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = transactions;
    if (typeFilter !== 'all') {
      result = result.filter(t => t.type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.broker.toLowerCase().includes(q)
      );
    }
    return result;
  }, [transactions, search, typeFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortField, sortDir]);

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <TextInput
          placeholder="Search symbol, description..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ width: 250 }}
        />
        <Select
          data={types}
          value={typeFilter}
          onChange={(v) => v && setTypeFilter(v)}
          size="xs"
          style={{ width: 160 }}
        />
        {filtered.length !== transactions.length && (
          <Text size="xs" c="dimmed">{filtered.length} of {transactions.length}</Text>
        )}
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th><SortHeader label="Date" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Qty" field="quantity" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Price" field="pricePerUnit" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Amount" field="amount" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
              <Table.Th>Flow</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((t, i) => (
              <Table.Tr key={t.id + '-' + i}>
                <Table.Td>{t.date}</Table.Td>
                <Table.Td>
                  <Badge color={TYPE_COLORS[t.type] || 'gray'} variant="light" size="sm">
                    {t.type}
                  </Badge>
                </Table.Td>
                <Table.Td><Text fw={t.symbol ? 600 : 400}>{t.symbol || '\u2014'}</Text></Table.Td>
                <Table.Td style={{ maxWidth: 300 }}>
                  <Text size="sm" truncate="end">{t.description}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {t.quantity !== 0 ? formatNum(t.quantity, Math.abs(t.quantity) % 1 === 0 ? 0 : 4) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {t.pricePerUnit > 0 ? formatNum(t.pricePerUnit) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {formatNum(t.amount)} {t.currency}
                </Table.Td>
                <Table.Td>
                  {(t.raw as any)?.debitCredit
                    ? <Text size="sm" c={(t.raw as any).debitCredit === 'K' ? '#51cf66' : '#ff6b6b'}>{(t.raw as any).debitCredit === 'K' ? 'In' : 'Out'}</Text>
                    : '\u2014'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function AllocationPanel({ allocation }: { allocation: AllocationBreakdown }) {
  const sections = [
    { title: 'Geography', data: allocation.byGeography },
    { title: 'Currency Exposure', data: allocation.byCurrency },
    { title: 'Sector', data: allocation.bySector },
  ];

  const COLORS = ['blue', 'teal', 'violet', 'orange', 'pink', 'cyan', 'yellow', 'red', 'gray'];

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      {sections.map(section => (
        <Card key={section.title} padding="sm" withBorder>
          <Text size="sm" fw={600} mb="sm">{section.title}</Text>
          <Stack gap="xs">
            {section.data.map((entry, i) => (
              <div key={entry.name}>
                <Group justify="space-between" mb={2}>
                  <Text size="xs">{entry.name}</Text>
                  <Text size="xs" fw={600}>{formatNum(entry.percent)}%</Text>
                </Group>
                <Progress value={entry.percent} size="sm" color={COLORS[i % COLORS.length]} />
              </div>
            ))}
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

function EquityCompPanel({ rsu, espp, rsuByYearWithCumulative: byYearWithCumulative }: { rsu: RsuCompensationSummary; espp: EsppSummary; rsuByYearWithCumulative: InvestmentData['rsuByYearWithCumulative'] }) {
  const hasRsu = rsu.byYear.length > 0;
  const hasEspp = espp.totalSharesPurchased > 0;
  const [rsuView, setRsuView] = useState<string>('year');
  const [expandedGrant, setExpandedGrant] = useState<string | null>(null);

  if (!hasRsu && !hasEspp) return <Text c="dimmed">No equity compensation data found.</Text>;

  return (
    <Stack gap="md">
      {hasRsu && (
        <Card padding="sm" withBorder>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={600}>RSU Compensation</Text>
            {rsu.byGrant && rsu.byGrant.length > 0 && (
              <Select
                data={[
                  { value: 'year', label: 'By Year' },
                  { value: 'grant', label: 'By Grant' },
                ]}
                value={rsuView}
                onChange={(v) => v && setRsuView(v)}
                size="xs"
                style={{ width: 130 }}
              />
            )}
          </Group>
          <Group gap="xl" mb="sm">
            <Stack gap={0}>
              <Text size="xs" c="dimmed">Total (USD)</Text>
              <Text size="sm" fw={700}>${formatNum(rsu.totalCompensation)}</Text>
            </Stack>
            <Stack gap={0}>
              <Text size="xs" c="dimmed">Total (EUR)</Text>
              <Text size="sm" fw={700}>{formatEur(rsu.totalCompensationEur)}</Text>
            </Stack>
          </Group>

          {rsuView === 'year' && (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Year</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Shares</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Value (USD)</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Value (EUR)</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Cumulative (EUR)</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {byYearWithCumulative.map(y => (
                  <Table.Tr key={y.year}>
                    <Table.Td>{y.year}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(y.totalShares, 0)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>${formatNum(y.totalCompensation)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatEur(y.totalCompensationEur)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatEur(y.cumulativeEur)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {rsuView === 'grant' && rsu.byGrant && (
            <Stack gap="xs">
              {rsu.byGrant.map(g => {
                const isExpanded = expandedGrant === g.grantId;
                return (
                  <Card key={g.grantId} padding="xs" withBorder>
                    <UnstyledButton onClick={() => setExpandedGrant(isExpanded ? null : g.grantId)} style={{ width: '100%' }}>
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">{isExpanded ? '\u25BC' : '\u25B6'}</Text>
                          <Text size="sm" fw={600}>Grant {g.grantId}</Text>
                        </Group>
                        <Group gap="md">
                          <Text size="xs" c="dimmed">{formatNum(g.totalShares, 0)} shares</Text>
                          <Text size="sm" fw={600}>${formatNum(g.totalCompensation)}</Text>
                        </Group>
                      </Group>
                    </UnstyledButton>
                    {isExpanded && (
                      <Table striped mt="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Vesting Date</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Shares</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>FMV</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Value (USD)</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Value (EUR)</Table.Th>
                            <Table.Th>Same-Day Sale</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {g.vestings.map((v, i) => (
                            <Table.Tr key={v.vestingDate + '-' + i}>
                              <Table.Td>{v.vestingDate}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>{formatNum(v.shares, 0)}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>${formatNum(v.fmvAtVesting)}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>${formatNum(v.compensationValue)}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>{formatEur(v.compensationValueEur)}</Table.Td>
                              <Table.Td>
                                {v.isSameDaySale && <Badge size="xs" color="orange" variant="light">sold</Badge>}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Card>
                );
              })}
            </Stack>
          )}
        </Card>
      )}
      {hasEspp && (
        <Card padding="sm" withBorder>
          <Text size="sm" fw={600} mb="sm">ESPP Summary</Text>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Shares Purchased</Text>
              <Text size="sm" fw={700}>{formatNum(espp.totalSharesPurchased, 0)}</Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Cost Basis (USD)</Text>
              <Text size="sm" fw={700}>${formatNum(espp.totalCostBasis)}</Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Discount Captured</Text>
              <Text size="sm" fw={700} c="green">${formatNum(espp.totalDiscountCaptured)}</Text>
            </Stack>
            <Stack gap={0} align="center">
              <Text size="xs" c="dimmed">Avg Discount</Text>
              <Text size="sm" fw={700} c="green">{formatNum(espp.averageDiscountPercent)}%</Text>
            </Stack>
          </SimpleGrid>
        </Card>
      )}
    </Stack>
  );
}

function StockTransactions({ symbol, transactions }: { symbol: string; transactions: ITransaction[] }) {
  const filtered = useMemo(
    () => transactions
      .filter(t => t.symbol === symbol)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [symbol, transactions]
  );

  if (filtered.length === 0) return <Text size="sm" c="dimmed" p="xs">No transactions.</Text>;

  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Date</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Description</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>Fees</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {filtered.map((t, i) => (
          <Table.Tr key={t.id + '-' + i}>
            <Table.Td>{t.date}</Table.Td>
            <Table.Td>
              <Badge color={TYPE_COLORS[t.type] || 'gray'} variant="light" size="sm">
                {t.type}
              </Badge>
            </Table.Td>
            <Table.Td style={{ maxWidth: 250 }}>
              <Text size="sm" truncate="end">{t.description}</Text>
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
              {t.quantity !== 0 ? formatNum(t.quantity, Math.abs(t.quantity) % 1 === 0 ? 0 : 4) : '\u2014'}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
              {t.pricePerUnit > 0 ? `${formatNum(t.pricePerUnit)} ${t.currency}` : '\u2014'}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
              {formatNum(t.amount)} {t.currency}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>
              {t.fees > 0 ? `${formatNum(t.fees)} ${t.currency}` : '\u2014'}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function StockBreakdownPanel({ data }: { data: InvestmentData }) {
  const [sortField, setSortField] = useState('totalPnlEur');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const stats = data.stockStats;
  const totals = data.stockStatsTotals;

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...stats].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [stats, sortField, sortDir]);

  if (stats.length === 0) return <Text c="dimmed">No stock data found.</Text>;

  const colCount = 8;

  return (
    <ScrollArea>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th><SortHeader label="Symbol" field="symbol" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th><SortHeader label="Status" field="isOpen" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th><SortHeader label="Since" field="firstDate" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Invested" field="totalInvestedEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Realized" field="realizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Unrealized" field="unrealizedPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Dividends" field="dividendsEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
            <Table.Th style={{ textAlign: 'right' }}><SortHeader label="Total P&L" field="totalPnlEur" sortField={sortField} sortDir={sortDir} onSort={onSort} /></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map(st => {
            const isExpanded = expanded === st.symbol;
            return (
              <>
                <Table.Tr
                  key={st.symbol}
                  onClick={() => setExpanded(isExpanded ? null : st.symbol)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Group gap={4}>
                      <Text size="sm" c="dimmed">{isExpanded ? '\u25BC' : '\u25B6'}</Text>
                      <Text fw={600}>{st.symbol}</Text>
                      {data.tickerMeta?.[st.symbol] && (
                        <>
                          <Badge size="xs" variant="light" color="blue">{data.tickerMeta[st.symbol].geography}</Badge>
                          <Badge size="xs" variant="light" color="teal">{data.tickerMeta[st.symbol].sector}</Badge>
                        </>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={st.isOpen ? 'green' : 'gray'} variant="light">
                      {st.isOpen ? 'Open' : 'Closed'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{st.firstDate}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(st.totalInvestedEur)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right', color: pnlColor(st.realizedPnlEur) }}>
                    {st.realizedPnlEur !== 0 ? formatEur(st.realizedPnlEur) : '\u2014'}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', color: pnlColor(st.unrealizedPnlEur) }}>
                    {st.isOpen ? formatEur(st.unrealizedPnlEur) : '\u2014'}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    {st.dividendsEur > 0 ? formatEur(st.dividendsEur) : '\u2014'}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right', color: pnlColor(st.totalPnlEur) }}>
                    {formatEur(st.totalPnlEur)}
                  </Table.Td>
                </Table.Tr>
                {isExpanded && (
                  <Table.Tr key={st.symbol + '-txns'}>
                    <Table.Td colSpan={colCount} style={{ padding: 0, background: 'var(--mantine-color-body)' }}>
                      <div style={{ padding: '8px 16px' }}>
                        <Text size="xs" fw={600} c="dimmed" mb="xs">
                          Transactions for {st.symbol}
                        </Text>
                        <StockTransactions symbol={st.symbol} transactions={data.transactions} />
                      </div>
                    </Table.Td>
                  </Table.Tr>
                )}
              </>
            );
          })}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr style={{ fontWeight: 700 }}>
            <Table.Td>Total</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.totalInvested)}</Table.Td>
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.realizedPnl) }}>{formatEur(totals.realizedPnl)}</Table.Td>
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.unrealizedPnl) }}>{formatEur(totals.unrealizedPnl)}</Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>{formatEur(totals.dividends)}</Table.Td>
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totals.totalPnl) }}>{formatEur(totals.totalPnl)}</Table.Td>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea>
  );
}

const BROKERS = [
  { value: 'swedbank', label: 'Swedbank' },
  { value: 'interactive-brokers', label: 'Interactive Brokers' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'wix', label: 'Wix' },
];

function FileUploadPanel({ onDataChange }: { onDataChange: () => void }) {
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [broker, setBroker] = useState<string>('swedbank');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFiles = () => {
    fetch(`${BASE}/api/investments/files`)
      .then(r => r.json())
      .then(setFiles)
      .catch(() => {});
  };

  useEffect(() => { loadFiles(); }, []);

  const handleUpload = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append(broker, file, file.name);
      }
      const res = await fetch(`${BASE}/api/investments/upload`, { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Uploaded ${result.uploaded.length} file(s). Data reloaded.` });
        loadFiles();
        onDataChange();
      } else {
        setMessage({ type: 'error', text: result.error || 'Upload failed' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (brokerKey: string, filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      const res = await fetch(`${BASE}/api/investments/files/${brokerKey}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: `Deleted ${filename}. Data reloaded.` });
        loadFiles();
        onDataChange();
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const totalFiles = Object.values(files).reduce((s, f) => s + f.length, 0);

  return (
    <Stack gap="md">
      {message && (
        <Alert color={message.type === 'success' ? 'green' : 'red'} withCloseButton onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Upload Files</Text>
        <Group>
          <Select
            data={BROKERS}
            value={broker}
            onChange={(v) => v && setBroker(v)}
            size="xs"
            style={{ width: 200 }}
          />
          <FileButton onChange={handleUpload} accept=".csv,.txt" multiple>
            {(props) => (
              <Button {...props} size="xs" loading={uploading}>
                Choose Files
              </Button>
            )}
          </FileButton>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          Select a broker, then choose CSV/TXT files to upload.
        </Text>
      </Card>

      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="sm">Uploaded Files ({totalFiles})</Text>
        {BROKERS.map(b => {
          const brokerFiles = files[b.value] || [];
          if (brokerFiles.length === 0) return null;
          return (
            <div key={b.value}>
              <Text size="xs" fw={600} c="dimmed" mt="sm" mb="xs">{b.label}</Text>
              {brokerFiles.map(f => (
                <Group key={f} justify="space-between" py={2}>
                  <Text size="sm">{f}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => handleDelete(b.value, f)}
                  >
                    Delete
                  </Button>
                </Group>
              ))}
            </div>
          );
        })}
        {totalFiles === 0 && (
          <Text size="sm" c="dimmed">No files uploaded yet.</Text>
        )}
      </Card>
    </Stack>
  );
}

function AiSuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<AiSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/investments/ai-suggestions`)
      .then(r => r.json())
      .then(d => { setSuggestions(d.suggestions ? d : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/investments/ai-suggestions`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSuggestions({ suggestions: result.suggestions, generatedAt: result.generatedAt });
      } else {
        setError(result.error);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Text fw={600}>AI Portfolio Insights</Text>
          {suggestions?.generatedAt && (
            <Text size="xs" c="dimmed">Last updated: {timeAgo(suggestions.generatedAt)}</Text>
          )}
        </Group>
        <Button
          variant="light"
          size="xs"
          color="violet"
          loading={generating}
          onClick={handleGenerate}
        >
          {suggestions ? 'Refresh Insights' : 'Generate Insights'}
        </Button>
      </Group>

      {error && (
        <Alert color="red" variant="light" title="Error">{error}</Alert>
      )}

      {loading && <Center><Loader size="sm" /></Center>}

      {!loading && !suggestions && !error && (
        <Alert color="blue" variant="light">
          Click "Generate Insights" to get AI-powered portfolio analysis and suggestions.
          Requires an Anthropic API key configured in the Tennis Radar Settings tab.
        </Alert>
      )}

      {suggestions?.suggestions && (
        <Card padding="md" withBorder>
          <div
            className="ai-suggestions-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(suggestions.suggestions) }}
          />
        </Card>
      )}
    </Stack>
  );
}

function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${formatNum(n, 0)}`;
}

function MarketDataPanel({ data }: { data: InvestmentData }) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const stockInfo = data.stockInfo || [];
  const priceHistory = data.priceHistory || {};

  const tickers = useMemo(() => {
    const held = data.holdings.map(h => h.symbol);
    const all = [...new Set([...held, ...Object.keys(priceHistory)])];
    return all.sort();
  }, [data.holdings, priceHistory]);

  const selectedHistory = selectedTicker ? (priceHistory[selectedTicker] || []) : [];

  return (
    <Stack gap="md">
      {/* Stock Info Cards */}
      {stockInfo.length > 0 ? (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Stock Fundamentals</Text>
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>P/E</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Fwd P/E</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>EPS</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Div Yield</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Div Rate</Table.Th>
                  <Table.Th>Ex-Div Date</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Market Cap</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>52w High</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>52w Low</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Beta</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stockInfo.map(si => {
                  const pctFrom52High = si.fiftyTwoWeekHigh ? ((si.currentPrice - si.fiftyTwoWeekHigh) / si.fiftyTwoWeekHigh) * 100 : null;
                  return (
                    <Table.Tr key={si.ticker}>
                      <Table.Td><Text fw={600}>{si.ticker}</Text></Table.Td>
                      <Table.Td style={{ maxWidth: 180 }}><Text size="sm" truncate="end">{si.name}</Text></Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(si.currentPrice)} {si.currency}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.peRatio != null ? formatNum(si.peRatio, 1) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.forwardPeRatio != null ? formatNum(si.forwardPeRatio, 1) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.epsTrailingTwelveMonths != null ? formatNum(si.epsTrailingTwelveMonths) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: si.dividendYield != null && si.dividendYield > 0 ? '#51cf66' : undefined }}>
                        {si.dividendYield != null ? `${formatNum(si.dividendYield, 1)}%` : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.dividendRate != null ? `${formatNum(si.dividendRate)} ${si.currency}` : '\u2014'}</Table.Td>
                      <Table.Td>{si.exDividendDate || '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.marketCap != null ? formatMarketCap(si.marketCap) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.fiftyTwoWeekHigh != null ? (
                          <span>
                            {formatNum(si.fiftyTwoWeekHigh)}
                            {pctFrom52High != null && (
                              <Text span size="xs" c={pctFrom52High >= 0 ? '#51cf66' : '#ff6b6b'}> ({formatNum(pctFrom52High, 1)}%)</Text>
                            )}
                          </span>
                        ) : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.fiftyTwoWeekLow != null ? formatNum(si.fiftyTwoWeekLow) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.beta != null ? formatNum(si.beta, 2) : '\u2014'}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      ) : (
        <Alert color="blue" variant="light">
          Click "Refresh Prices" to fetch stock fundamentals (P/E, dividends, market cap, etc.).
        </Alert>
      )}

      {/* Price History */}
      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>Price History</Text>
          <Select
            data={tickers.map(t => ({ value: t, label: t }))}
            value={selectedTicker}
            onChange={(v) => setSelectedTicker(v)}
            placeholder="Select ticker..."
            size="xs"
            style={{ width: 180 }}
            clearable
          />
        </Group>

        {selectedTicker && selectedHistory.length > 0 ? (
          <ScrollArea>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                  <Table.Th>Currency</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Change</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[...selectedHistory].reverse().map((entry, i, arr) => {
                  const prev = arr[i + 1];
                  const change = prev ? ((entry.price - prev.price) / prev.price) * 100 : null;
                  return (
                    <Table.Tr key={entry.date}>
                      <Table.Td>{entry.date}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(entry.price)}</Table.Td>
                      <Table.Td>{entry.currency}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: change != null ? pnlColor(change) : undefined }}>
                        {change != null ? `${change >= 0 ? '+' : ''}${formatNum(change, 1)}%` : '\u2014'}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : selectedTicker ? (
          <Text size="sm" c="dimmed">No price history for {selectedTicker}.</Text>
        ) : (
          <Text size="sm" c="dimmed">Select a ticker to view price history.</Text>
        )}
      </Card>
    </Stack>
  );
}

/** Simple markdown-to-HTML renderer for AI suggestions */
function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 style="margin: 12px 0 4px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin: 16px 0 8px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin: 16px 0 8px">$1</h2>')
    .replace(/^- (.+)$/gm, '<li style="margin-left: 16px">$1</li>')
    .replace(/^\d+\. \*\*(.+?)\*\*(.*)$/gm, '<li style="margin-left: 16px; margin-top: 8px"><strong>$1</strong>$2</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left: 16px; margin-top: 8px">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '\n');
}

// --- App ---

const theme = createTheme({ primaryColor: 'blue', defaultRadius: 'md' });

function App() {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    fetch(`${BASE}/api/investments`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${BASE}/api/investments/refresh`, { method: 'POST' });
      const result = await res.json();
      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="md">
        <Stack gap="lg" mb="md">
          <Group justify="space-between" wrap="wrap">
            <Title order={3}>Life Helper</Title>
            <Group gap="sm">
              <Button
                variant="light"
                size="xs"
                loading={refreshing}
                onClick={handleRefresh}
              >
                Refresh Prices
              </Button>
              {data && data.holdings.length > 0 && (
                <Button
                  variant="light"
                  size="xs"
                  color={copied ? 'green' : 'gray'}
                  onClick={() => {
                    navigator.clipboard.writeText(formatHoldingsForClipboard(data.holdings));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Holdings'}
                </Button>
              )}
            </Group>
          </Group>
          <Tabs value="investments" variant="pills" onChange={(value) => {
            if (value === 'tennis-radar') window.location.href = `${BASE}/`;
            if (value === 'settings') window.location.href = `${BASE}/?screen=settings`;
          }}>
            <Tabs.List>
              <Tabs.Tab value="tennis-radar">Tennis Radar</Tabs.Tab>
              <Tabs.Tab value="settings">Settings</Tabs.Tab>
              <Tabs.Tab value="investments">Investments</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Stack>

        {data?.priceRefreshTime && (
          <Text size="xs" c="dimmed" mb="md">Prices: {timeAgo(data.priceRefreshTime)}</Text>
        )}

        {loading && (
          <Center py="xl"><Loader size="sm" /></Center>
        )}

        {error && (
          <Alert color="red" title="Error" mb="md">{error}</Alert>
        )}

        {data && (
          <>
            <PortfolioSummaryCard data={data} />

            {data.riskWarnings && data.riskWarnings.length > 0 && (
              <Stack gap="xs" mb="md">
                {data.riskWarnings.map((w, i) => (
                  <Alert key={i} color={w.severity === 'warning' ? 'orange' : 'blue'} variant="light">
                    {w.message}
                  </Alert>
                ))}
              </Stack>
            )}

            <IncomeCard data={data} />

            <Tabs defaultValue="holdings">
              <Tabs.List mb="md">
                <Tabs.Tab value="holdings">
                  Holdings ({data.holdings.length})
                </Tabs.Tab>
                <Tabs.Tab value="realized">
                  Realized P&L ({data.realizedTrades.length})
                </Tabs.Tab>
                <Tabs.Tab value="allocation">
                  Allocation
                </Tabs.Tab>
                <Tabs.Tab value="equity">
                  Equity Comp
                </Tabs.Tab>
                <Tabs.Tab value="stocks">
                  Stocks
                </Tabs.Tab>
                <Tabs.Tab value="transactions">
                  Transactions ({data.transactions.length})
                </Tabs.Tab>
                <Tabs.Tab value="market-data">
                  Market Data
                </Tabs.Tab>
                <Tabs.Tab value="upload">
                  Upload
                </Tabs.Tab>
                <Tabs.Tab value="ai-insights">
                  AI Insights
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="holdings">
                {data.holdings.length > 0
                  ? <Card padding="xs"><HoldingsTable holdings={data.holdings} /></Card>
                  : <Text c="dimmed">No holdings found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="realized">
                {data.realizedTrades.length > 0
                  ? <Card padding="xs"><RealizedTradesTable trades={data.realizedTrades} /></Card>
                  : <Text c="dimmed">No realized trades found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="allocation">
                {data.allocation
                  ? <AllocationPanel allocation={data.allocation} />
                  : <Text c="dimmed">No allocation data.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="equity">
                <EquityCompPanel rsu={data.rsuCompensation} espp={data.esppSummary} rsuByYearWithCumulative={data.rsuByYearWithCumulative} />
              </Tabs.Panel>

              <Tabs.Panel value="stocks">
                <Card padding="xs"><StockBreakdownPanel data={data} /></Card>
              </Tabs.Panel>

              <Tabs.Panel value="transactions">
                {data.transactions.length > 0
                  ? <Card padding="xs"><TransactionsTable transactions={data.transactions} /></Card>
                  : <Text c="dimmed">No transactions found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="market-data">
                <Card padding="md"><MarketDataPanel data={data} /></Card>
              </Tabs.Panel>

              <Tabs.Panel value="upload">
                <FileUploadPanel onDataChange={loadData} />
              </Tabs.Panel>

              <Tabs.Panel value="ai-insights">
                <Card padding="md">
                  <AiSuggestionsPanel />
                </Card>
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </Container>
    </MantineProvider>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
