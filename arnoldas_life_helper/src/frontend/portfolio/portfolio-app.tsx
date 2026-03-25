import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Container,
  Group,
  Stack,
  SimpleGrid,
  Center,
  Tabs,
  Badge,
  Paper,
  Text,
  Title,
  Button,
  TextInput,
  Select,
  Table,
  Loader,
  Alert,
  Progress,
  NumberInput,
} from '@mantine/core';
import type {
  PortfolioData,
  PortfolioFilesResponse,
  NormalizedTrade,
  NormalizedDividend,
  NormalizedFee,
  Position,
  WixData,
} from './types';
import { parseInteractiveBrokers } from './parsers/ib-parser';
import { parseSwedbank } from './parsers/swedbank-parser';
import { parseWix } from './parsers/wix-parser';
import { parseRevolut } from './parsers/revolut-parser';
import { aggregatePortfolio } from './aggregator';

const BASE = (window as any).INGRESS_PATH || '';

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtEur(n: number): string {
  return `${fmt(n)} EUR`;
}

function pnlColor(n: number): string {
  if (n > 0) return 'green';
  if (n < 0) return 'red';
  return 'dimmed';
}

function pnlSign(n: number): string {
  return n >= 0 ? `+${fmt(n)}` : fmt(n);
}

// --- Summary Card ---
function SummaryCard({ label, value, subValue, color }: {
  label: string;
  value: string;
  subValue?: string;
  color?: string;
}) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="xl" fw={700} c={color} mt={4}>{value}</Text>
      {subValue && <Text size="xs" c="dimmed" mt={2}>{subValue}</Text>}
    </Paper>
  );
}

// --- Overview Tab ---
function OverviewTab({ data }: { data: PortfolioData }) {
  const { summary, positions } = data;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <SummaryCard
          label="Portfolio Value"
          value={fmtEur(summary.totalValue)}
          subValue={`${pnlSign(summary.unrealizedPnL)} EUR (${fmt(summary.unrealizedPnLPct, 1)}%)`}
          color={pnlColor(summary.unrealizedPnL)}
        />
        <SummaryCard
          label="Total Invested"
          value={fmtEur(summary.totalCost)}
        />
        <SummaryCard
          label="Realized P&L"
          value={`${pnlSign(summary.realizedPnL)} EUR`}
          subValue={`${data.closedTrades.length} closed trades`}
          color={pnlColor(summary.realizedPnL)}
        />
        <SummaryCard
          label="Dividends"
          value={fmtEur(summary.totalDividends)}
          subValue={`${data.dividendSummary.paymentCount} payments`}
        />
        <SummaryCard
          label="Total Fees"
          value={fmtEur(data.totalFees)}
        />
        <SummaryCard
          label="Positions"
          value={String(summary.positionCount)}
        />
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">Top Holdings</Text>
        <Stack gap="xs">
          {positions.slice(0, 8).map(p => {
            const weight = summary.totalValue > 0 ? (p.currentValueEUR / summary.totalValue) * 100 : 0;
            return (
              <Group key={p.symbol} justify="space-between" wrap="nowrap">
                <Group gap="xs" style={{ flex: 1 }}>
                  <Text size="sm" fw={600} style={{ minWidth: 70 }}>{p.symbol}</Text>
                  <Text size="xs" c="dimmed" truncate>{p.description}</Text>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" fw={500}>{fmtEur(p.currentValueEUR)}</Text>
                  <Badge size="xs" variant="light" color="gray">{fmt(weight, 1)}%</Badge>
                  <Text size="xs" c={pnlColor(p.unrealizedPnLPct)} fw={500}>
                    {pnlSign(p.unrealizedPnLPct)}%
                  </Text>
                </Group>
              </Group>
            );
          })}
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">By Broker</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {['IB', 'Swedbank', 'WIX', 'Revolut'].map(broker => {
            const brokerPositions = positions.filter(p => p.brokers.includes(broker));
            const brokerValue = brokerPositions.reduce((sum, p) => sum + p.currentValueEUR, 0);
            return (
              <Paper key={broker} withBorder p="sm" radius="md">
                <Text size="xs" c="dimmed">{broker}</Text>
                <Text size="sm" fw={600}>{fmtEur(brokerValue)}</Text>
                <Text size="xs" c="dimmed">{brokerPositions.length} positions</Text>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}

// --- Holdings Tab ---
function HoldingsTab({ data }: { data: PortfolioData }) {
  const [sortField, setSortField] = useState<string>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const positions = useMemo(() => {
    const list = data.positions.map(p => {
      const override = priceOverrides[p.symbol];
      if (override !== undefined) {
        const newValue = p.totalQuantity * override;
        const newPnL = newValue - p.totalCostEUR;
        return {
          ...p,
          currentPriceEUR: override / p.totalQuantity * p.totalQuantity, // per share
          currentValueEUR: newValue,
          unrealizedPnLEUR: newPnL,
          unrealizedPnLPct: p.totalCostEUR > 0 ? (newPnL / p.totalCostEUR) * 100 : 0,
        };
      }
      return p;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case 'symbol': return dir * a.symbol.localeCompare(b.symbol);
        case 'qty': return dir * (a.totalQuantity - b.totalQuantity);
        case 'cost': return dir * (a.avgCostEUR - b.avgCostEUR);
        case 'price': return dir * (a.currentPriceEUR - b.currentPriceEUR);
        case 'value': return dir * (a.currentValueEUR - b.currentValueEUR);
        case 'pnl': return dir * (a.unrealizedPnLEUR - b.unrealizedPnLEUR);
        case 'pnlPct': return dir * (a.unrealizedPnLPct - b.unrealizedPnLPct);
        default: return dir * (a.currentValueEUR - b.currentValueEUR);
      }
    });
    return list;
  }, [data.positions, sortField, sortDir, priceOverrides]);

  const totalValue = positions.reduce((s, p) => s + p.currentValueEUR, 0);

  const SortHeader = ({ field, children }: { field: string; children: string }) => (
    <Table.Th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => toggleSort(field)}
    >
      {children} {sortField === field ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
    </Table.Th>
  );

  return (
    <Stack gap="md">
      <div style={{ overflowX: 'auto' }}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <SortHeader field="symbol">Symbol</SortHeader>
              <Table.Th>Name</Table.Th>
              <SortHeader field="qty">Qty</SortHeader>
              <SortHeader field="cost">Avg Cost</SortHeader>
              <Table.Th>Cur. Price</Table.Th>
              <SortHeader field="value">EUR Value</SortHeader>
              <Table.Th>Weight</Table.Th>
              <SortHeader field="pnl">P&L</SortHeader>
              <SortHeader field="pnlPct">P&L %</SortHeader>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {positions.map(p => {
              const weight = totalValue > 0 ? (p.currentValueEUR / totalValue) * 100 : 0;
              return (
                <Table.Tr key={p.symbol}>
                  <Table.Td><Text size="sm" fw={600}>{p.symbol}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed" truncate style={{ maxWidth: 150 }}>{p.description}</Text></Table.Td>
                  <Table.Td>{fmt(p.totalQuantity, p.totalQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                  <Table.Td>{fmt(p.avgCostEUR)}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={priceOverrides[p.symbol] ?? p.currentPriceEUR}
                      onChange={v => {
                        if (typeof v === 'number') {
                          setPriceOverrides(prev => ({ ...prev, [p.symbol]: v }));
                        }
                      }}
                      decimalScale={2}
                      step={0.1}
                      style={{ width: 90 }}
                      hideControls
                    />
                  </Table.Td>
                  <Table.Td><Text size="sm" fw={500}>{fmt(p.currentValueEUR)}</Text></Table.Td>
                  <Table.Td>{fmt(weight, 1)}%</Table.Td>
                  <Table.Td>
                    <Text size="sm" c={pnlColor(p.unrealizedPnLEUR)} fw={500}>
                      {pnlSign(p.unrealizedPnLEUR)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={pnlColor(p.unrealizedPnLPct)} fw={500}>
                      {pnlSign(p.unrealizedPnLPct)}%
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}

// --- Trades Tab ---
function TradesTab({ data }: { data: PortfolioData }) {
  const [search, setSearch] = useState('');
  const [brokerFilter, setBrokerFilter] = useState<string | null>(null);
  const [sideFilter, setSideFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const pageSize = 25;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let list = [...data.trades];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    }
    if (brokerFilter) list = list.filter(t => t.broker === brokerFilter);
    if (sideFilter) list = list.filter(t => t.side === sideFilter);

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case 'date': return dir * a.date.localeCompare(b.date);
        case 'symbol': return dir * a.symbol.localeCompare(b.symbol);
        case 'qty': return dir * (a.quantity - b.quantity);
        case 'price': return dir * (a.price - b.price);
        case 'total': return dir * (a.totalEUR - b.totalEUR);
        case 'fee': return dir * (a.commission - b.commission);
        default: return dir * a.date.localeCompare(b.date);
      }
    });

    return list;
  }, [data.trades, search, brokerFilter, sideFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const SortHeader = ({ field, children }: { field: string; children: string }) => (
    <Table.Th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => toggleSort(field)}
    >
      {children} {sortField === field ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
    </Table.Th>
  );

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap">
        <TextInput
          placeholder="Search symbol..."
          value={search}
          onChange={e => { setSearch(e.currentTarget.value); setPage(0); }}
          size="xs"
          style={{ width: 160 }}
        />
        <Select
          placeholder="Broker"
          data={[
            { value: '', label: 'All Brokers' },
            { value: 'IB', label: 'IB' },
            { value: 'Swedbank', label: 'Swedbank' },
            { value: 'WIX', label: 'WIX' },
            { value: 'Revolut', label: 'Revolut' },
          ]}
          value={brokerFilter ?? ''}
          onChange={v => { setBrokerFilter(v || null); setPage(0); }}
          size="xs"
          style={{ width: 130 }}
          clearable
        />
        <Select
          placeholder="Side"
          data={[
            { value: '', label: 'All' },
            { value: 'BUY', label: 'BUY' },
            { value: 'SELL', label: 'SELL' },
          ]}
          value={sideFilter ?? ''}
          onChange={v => { setSideFilter(v || null); setPage(0); }}
          size="xs"
          style={{ width: 100 }}
          clearable
        />
        <Text size="xs" c="dimmed">{filtered.length} trades</Text>
      </Group>

      <div style={{ overflowX: 'auto' }}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <SortHeader field="date">Date</SortHeader>
              <SortHeader field="symbol">Symbol</SortHeader>
              <Table.Th>Side</Table.Th>
              <SortHeader field="qty">Qty</SortHeader>
              <SortHeader field="price">Price</SortHeader>
              <Table.Th>Cur</Table.Th>
              <SortHeader field="total">EUR Total</SortHeader>
              <SortHeader field="fee">Fee</SortHeader>
              <Table.Th>Broker</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paged.map((t, i) => (
              <Table.Tr key={`${t.date}-${t.symbol}-${i}`}>
                <Table.Td><Text size="xs">{t.date}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={500}>{t.symbol}</Text></Table.Td>
                <Table.Td>
                  <Badge
                    size="xs"
                    color={t.side === 'BUY' ? 'blue' : 'orange'}
                    variant="light"
                  >
                    {t.side}
                  </Badge>
                </Table.Td>
                <Table.Td>{fmt(t.quantity, t.quantity % 1 === 0 ? 0 : 4)}</Table.Td>
                <Table.Td>{fmt(t.price, 2)}</Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{t.currency}</Text></Table.Td>
                <Table.Td>{fmt(t.totalEUR)}</Table.Td>
                <Table.Td>{t.commission > 0 ? fmt(t.commission) : '-'}</Table.Td>
                <Table.Td><Badge size="xs" variant="dot">{t.broker}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Group justify="center" gap="sm">
          <Button size="xs" variant="default" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Prev
          </Button>
          <Text size="xs" c="dimmed">
            Page {page + 1} of {totalPages}
          </Text>
          <Button size="xs" variant="default" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </Group>
      )}
    </Stack>
  );
}

// --- Dividends Tab ---
function DividendsTab({ data }: { data: PortfolioData }) {
  const { dividends, dividendSummary } = data;
  const sorted = useMemo(() =>
    [...dividends].sort((a, b) => b.date.localeCompare(a.date)),
    [dividends]
  );

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <SummaryCard
          label="Total Net Income"
          value={fmtEur(dividendSummary.totalNet)}
        />
        <SummaryCard
          label="Tax Withheld"
          value={fmtEur(dividendSummary.totalTax)}
        />
        <SummaryCard
          label="Payments"
          value={String(dividendSummary.paymentCount)}
        />
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">By Symbol</Text>
        <Stack gap="xs">
          {Object.entries(dividendSummary.bySymbol)
            .sort((a, b) => b[1].net - a[1].net)
            .map(([symbol, d]) => (
              <Group key={symbol} justify="space-between">
                <Text size="sm" fw={500}>{symbol}</Text>
                <Group gap="xs">
                  <Text size="sm">{fmtEur(d.net)}</Text>
                  <Text size="xs" c="dimmed">({d.count} payments)</Text>
                </Group>
              </Group>
            ))}
        </Stack>
      </Paper>

      <div style={{ overflowX: 'auto' }}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Symbol</Table.Th>
              <Table.Th>Company</Table.Th>
              <Table.Th>Gross</Table.Th>
              <Table.Th>Tax</Table.Th>
              <Table.Th>Net</Table.Th>
              <Table.Th>Broker</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((d, i) => (
              <Table.Tr key={`${d.date}-${d.symbol}-${i}`}>
                <Table.Td><Text size="xs">{d.date}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={500}>{d.symbol}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed" truncate style={{ maxWidth: 180 }}>{d.company}</Text></Table.Td>
                <Table.Td>{fmt(d.grossAmount)}</Table.Td>
                <Table.Td><Text size="xs" c="red">{fmt(d.taxWithheld)}</Text></Table.Td>
                <Table.Td><Text size="sm" fw={500} c="green">{fmt(d.netAmount)}</Text></Table.Td>
                <Table.Td><Badge size="xs" variant="dot">{d.broker}</Badge></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}

// --- WIX Tab ---
function WixTab({ wixData }: { wixData: WixData }) {
  const currentPrice = 73.0; // WIX current price USD
  const usdToEur = 0.84;
  const currentHeld = wixData.totalVested - wixData.totalSold +
    wixData.esppPurchases.filter(e => e.type === 'Keep').reduce((s, e) => s + e.shares, 0);
  const positionValueUSD = currentHeld * currentPrice;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        <SummaryCard
          label="Total Vested"
          value={`${wixData.totalVested} shares`}
          subValue={`${wixData.grants.length} grants`}
        />
        <SummaryCard
          label="Total Sold"
          value={`${wixData.totalSold} shares`}
          subValue={`$${fmt(wixData.totalSoldProceeds)} proceeds`}
        />
        <SummaryCard
          label="Currently Held"
          value={`${currentHeld} shares`}
          subValue={`~$${fmt(positionValueUSD)} (~${fmtEur(positionValueUSD * usdToEur)})`}
        />
        <SummaryCard
          label="ESPP Purchases"
          value={`${wixData.esppPurchases.length}`}
          subValue={`${wixData.esppPurchases.filter(e => e.type === 'Quick Sale').length} quick sales`}
        />
      </SimpleGrid>

      {/* Grant Vesting */}
      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">RSU Grants</Text>
        <Stack gap="sm">
          {wixData.grants.map(g => {
            const pct = g.totalShares > 0 ? (g.vestedShares / g.totalShares) * 100 : 0;
            return (
              <Paper key={g.grantId} withBorder p="sm" radius="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>{g.grantId}</Text>
                  <Text size="xs" c="dimmed">Grant date: {g.grantDate}</Text>
                </Group>
                <Group justify="space-between" mb={4}>
                  <Text size="xs">{g.vestedShares} / {g.totalShares} vested</Text>
                  <Text size="xs" c="dimmed">{fmt(pct, 0)}%</Text>
                </Group>
                <Progress value={pct} size="sm" color={pct >= 100 ? 'green' : 'blue'} />
                {g.upcomingShares > 0 && (
                  <Text size="xs" c="blue" mt={4}>{g.upcomingShares} shares upcoming</Text>
                )}
              </Paper>
            );
          })}
        </Stack>
      </Paper>

      {/* Sell History */}
      <Paper withBorder p="md" radius="md">
        <Text fw={600} size="sm" mb="sm">Sell History</Text>
        <div style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Shares</Table.Th>
                <Table.Th>Price USD</Table.Th>
                <Table.Th>Total USD</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {wixData.sells
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((s, i) => (
                  <Table.Tr key={i}>
                    <Table.Td><Text size="xs">{s.date}</Text></Table.Td>
                    <Table.Td>{s.quantity}</Table.Td>
                    <Table.Td>${fmt(s.price)}</Table.Td>
                    <Table.Td>${fmt(s.totalEUR / usdToEur)}</Table.Td>
                    <Table.Td><Text size="xs" c="dimmed" truncate style={{ maxWidth: 200 }}>{s.notes || ''}</Text></Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </div>
      </Paper>

      {/* ESPP */}
      {wixData.esppPurchases.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text fw={600} size="sm" mb="sm">ESPP Purchases</Text>
          <div style={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Shares</Table.Th>
                  <Table.Th>Price USD</Table.Th>
                  <Table.Th>Total USD</Table.Th>
                  <Table.Th>Type</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {wixData.esppPurchases.map((e, i) => (
                  <Table.Tr key={i}>
                    <Table.Td><Text size="xs">{e.date}</Text></Table.Td>
                    <Table.Td>{e.shares}</Table.Td>
                    <Table.Td>${fmt(e.priceUSD)}</Table.Td>
                    <Table.Td>${fmt(e.totalUSD)}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={e.type === 'Quick Sale' ? 'orange' : 'green'} variant="light">
                        {e.type}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </Paper>
      )}
    </Stack>
  );
}

// --- Main Portfolio App ---
export function PortfolioApp() {
  const [tab, setTab] = useState<string | null>('overview');
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/portfolio/files`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const files: PortfolioFilesResponse = await res.json();

      // Parse each broker
      const allTrades: NormalizedTrade[] = [];
      const allDividends: NormalizedDividend[] = [];
      const allFees: NormalizedFee[] = [];
      let wixData: WixData | null = null;

      if (files['interactive-brokers']) {
        const ib = parseInteractiveBrokers(files['interactive-brokers']);
        allTrades.push(...ib.trades);
      }

      if (files['swedbank']) {
        const sw = parseSwedbank(files['swedbank']);
        allTrades.push(...sw.trades);
        allDividends.push(...sw.dividends);
        allFees.push(...sw.fees);
      }

      if (files['wix']) {
        const wix = parseWix(files['wix']);
        allTrades.push(...wix.trades);
        wixData = wix.wixData;
      }

      if (files['revolut']) {
        const rev = parseRevolut(files['revolut']);
        allTrades.push(...rev.trades);
      }

      // Aggregate
      const portfolio = aggregatePortfolio(allTrades, allDividends, allFees, wixData);
      setData(portfolio);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Center py={80}>
        <Stack align="center" gap="sm">
          <Loader size="md" />
          <Text size="sm" c="dimmed">Loading portfolio data...</Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="red" variant="light" title="Error loading portfolio">
        {error}
        <Button variant="light" size="xs" mt="sm" onClick={loadData}>Retry</Button>
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs" align="baseline">
          <Text size="xl" fw={700}>{fmtEur(data.summary.totalValue)}</Text>
          <Text size="sm" c={pnlColor(data.summary.unrealizedPnL)} fw={500}>
            {pnlSign(data.summary.unrealizedPnL)} EUR ({fmt(data.summary.unrealizedPnLPct, 1)}%)
          </Text>
        </Group>
        <Button variant="default" size="xs" onClick={loadData}>Refresh</Button>
      </Group>

      <Tabs value={tab} onChange={setTab} variant="pills">
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="holdings">Holdings</Tabs.Tab>
          <Tabs.Tab value="trades">Trades</Tabs.Tab>
          <Tabs.Tab value="dividends">Dividends</Tabs.Tab>
          {data.wixData && <Tabs.Tab value="wix">WIX RSU</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <OverviewTab data={data} />
        </Tabs.Panel>

        <Tabs.Panel value="holdings" pt="md">
          <HoldingsTab data={data} />
        </Tabs.Panel>

        <Tabs.Panel value="trades" pt="md">
          <TradesTab data={data} />
        </Tabs.Panel>

        <Tabs.Panel value="dividends" pt="md">
          <DividendsTab data={data} />
        </Tabs.Panel>

        {data.wixData && (
          <Tabs.Panel value="wix" pt="md">
            <WixTab wixData={data.wixData} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
