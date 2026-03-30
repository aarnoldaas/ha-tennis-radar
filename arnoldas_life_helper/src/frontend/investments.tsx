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

interface IHolding {
  symbol: string;
  name: string;
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

interface RsuCompensationSummary {
  totalCompensation: number;
  totalCompensationEur: number;
  byYear: RsuByYear[];
}

interface EsppSummary {
  totalSharesPurchased: number;
  totalCostBasis: number;
  totalFmvAtPurchase: number;
  totalDiscountCaptured: number;
  totalDiscountCapturedEur: number;
  averageDiscountPercent: number;
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
  const totalCost = data.holdings.reduce((s, h) => s + h.totalCostBasisEur, 0);
  const totalValue = data.holdings.reduce((s, h) => s + h.currentValueEur, 0);
  const unrealizedPnl = data.holdings.reduce((s, h) => s + h.unrealizedPnlEur, 0);
  const totalIncome = data.totalDividendsEur + data.totalInterestEur;
  const totalReturn = unrealizedPnl + data.totalRealizedPnlEur + totalIncome;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  const hasStalePrice = data.holdings.some(h => h.priceLastUpdated === null && h.currentPrice > 0);

  const items = [
    { label: 'Portfolio Value', value: formatEur(totalValue), color: undefined },
    { label: 'Cost Basis', value: formatEur(totalCost), color: undefined },
    { label: 'Unrealized P&L', value: formatEur(unrealizedPnl), color: pnlColor(unrealizedPnl) },
    { label: 'Realized P&L', value: formatEur(data.totalRealizedPnlEur), color: pnlColor(data.totalRealizedPnlEur) },
    { label: 'Income', value: formatEur(totalIncome), color: '#51cf66' },
    { label: 'Total Return', value: `${formatEur(totalReturn)} (${formatNum(totalReturnPct)}%)`, color: pnlColor(totalReturn) },
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

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [holdings, sortField, sortDir]);

  const totals = useMemo(() => ({
    totalCost: holdings.reduce((s, h) => s + h.totalCostBasisEur, 0),
    totalValue: holdings.reduce((s, h) => s + h.currentValueEur, 0),
    totalPnl: holdings.reduce((s, h) => s + h.unrealizedPnlEur, 0),
  }), [holdings]);

  return (
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
          {sorted.map(h => (
            <Table.Tr key={h.symbol}>
              <Table.Td>
                <Group gap={4}>
                  <Text fw={600}>{h.symbol}</Text>
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
          ))}
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
  );
}

function RealizedTradesTable({ trades }: { trades: IRealizedTrade[] }) {
  const [sortField, setSortField] = useState('sellDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [trades, sortField, sortDir]);

  const totalPnl = trades.reduce((s, t) => s + t.realizedPnlEur, 0);

  return (
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
            <Table.Td>Total</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td />
            <Table.Td />
            <Table.Td style={{ textAlign: 'right', color: pnlColor(totalPnl) }}>{formatEur(totalPnl)}</Table.Td>
            <Table.Td />
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea>
  );
}

function IncomeCard({ data }: { data: InvestmentData }) {
  const hasDividends = data.dividends.length > 0;
  const hasInterest = data.interestSummary && data.interestSummary.totalEur > 0;
  if (!hasDividends && !hasInterest) return null;

  const totalIncome = data.totalDividendsEur + data.totalInterestEur;

  return (
    <Card padding="sm" mb="md" withBorder>
      <Group justify="space-between">
        <Text size="sm" fw={600}>Income Summary</Text>
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
    </Card>
  );
}

function TransactionsTable({ transactions }: { transactions: ITransaction[] }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [transactions, sortField, sortDir]);

  return (
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
            <Table.Th>D/K</Table.Th>
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
              <Table.Td>{(t.raw as any)?.debitCredit || '\u2014'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
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

function EquityCompPanel({ rsu, espp }: { rsu: RsuCompensationSummary; espp: EsppSummary }) {
  const hasRsu = rsu.byYear.length > 0;
  const hasEspp = espp.totalSharesPurchased > 0;
  if (!hasRsu && !hasEspp) return <Text c="dimmed">No equity compensation data found.</Text>;

  return (
    <Stack gap="md">
      {hasRsu && (
        <Card padding="sm" withBorder>
          <Text size="sm" fw={600} mb="sm">RSU Compensation</Text>
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
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Year</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Shares</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Value (USD)</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Value (EUR)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rsu.byYear.map(y => (
                <Table.Tr key={y.year}>
                  <Table.Td>{y.year}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatNum(y.totalShares, 0)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>${formatNum(y.totalCompensation)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(y.totalCompensationEur)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
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
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <Title order={3}>Investments</Title>
            {data?.priceRefreshTime && (
              <Text size="xs" c="dimmed">Prices: {timeAgo(data.priceRefreshTime)}</Text>
            )}
          </Group>
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
            <Button variant="subtle" component="a" href={`${BASE}/`} size="xs">
              Back to Life Helper
            </Button>
          </Group>
        </Group>

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
                <Tabs.Tab value="transactions">
                  Transactions ({data.transactions.length})
                </Tabs.Tab>
                <Tabs.Tab value="upload">
                  Upload
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
                <EquityCompPanel rsu={data.rsuCompensation} espp={data.esppSummary} />
              </Tabs.Panel>

              <Tabs.Panel value="transactions">
                {data.transactions.length > 0
                  ? <Card padding="xs"><TransactionsTable transactions={data.transactions} /></Card>
                  : <Text c="dimmed">No transactions found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="upload">
                <FileUploadPanel onDataChange={loadData} />
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </Container>
    </MantineProvider>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
