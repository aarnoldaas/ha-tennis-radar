import { useMemo } from 'react';
import {
  Stack, Group, Text, Button, Card, Badge, SimpleGrid,
  Table, ScrollArea, Tabs,
  Tooltip as MantineTooltip, Anchor,
} from '@mantine/core';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { InvestmentData } from './types';
import { formatNum, formatEur, formatMarketCap, pnlColor, TYPE_COLORS, IR_URLS } from './utils';
import { CHART_COLORS, tooltipStyle } from './chart-theme';

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card padding="sm" withBorder>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} style={{ color }}>{value}</Text>
    </Card>
  );
}

export function StockDetailView({
  ticker,
  data,
  onBack,
}: {
  ticker: string;
  data: InvestmentData;
  onBack: () => void;
}) {
  const info = data.stockInfo?.find(s => s.ticker === ticker);
  const stats = data.stockStats?.find(s => s.symbol === ticker);
  const tradeAnalysis = data.stockTradeAnalysis?.find(s => s.symbol === ticker);
  const holding = data.holdings?.find(h => h.symbol === ticker);
  const priceHistory = (data.priceHistory?.[ticker] || []).slice().reverse();

  const transactions = useMemo(
    () => (data.transactions || [])
      .filter(t => t.symbol === ticker)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [data.transactions, ticker],
  );

  const realizedTrades = useMemo(
    () => (data.realizedTrades || [])
      .filter(t => t.symbol === ticker)
      .sort((a, b) => b.sellDate.localeCompare(a.sellDate)),
    [data.realizedTrades, ticker],
  );

  const dividends = useMemo(
    () => (data.dividends || [])
      .filter(d => d.symbol === ticker)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [data.dividends, ticker],
  );

  const chartData = useMemo(
    () => [...priceHistory].reverse().map(e => ({ date: e.date, price: e.price })),
    [priceHistory],
  );

  const meta = data.tickerMeta?.[ticker];
  const name = info?.name || holding?.name || ticker;

  return (
    <Stack gap="md">
      {/* Header */}
      <Group gap="sm">
        <Button variant="subtle" size="xs" onClick={onBack}>← Back</Button>
        <Text fw={700} size="xl">{ticker}</Text>
        <Text c="dimmed" size="sm">{name}</Text>
        {meta && (
          <>
            <Badge size="xs" variant="light" color="blue">{meta.geography}</Badge>
            <Badge size="xs" variant="light" color="teal">{meta.sector}</Badge>
          </>
        )}
        {info && (
          <Text fw={600} size="lg">
            {formatNum(info.currentPrice)} {info.currency}
          </Text>
        )}
        {IR_URLS[ticker] && (
          <Anchor href={IR_URLS[ticker]} target="_blank" size="xs">IR</Anchor>
        )}
      </Group>

      {/* P&L Summary */}
      {stats && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
          <StatCard label="Invested" value={formatEur(stats.totalInvestedEur)} />
          <StatCard label="Unrealized P&L" value={stats.isOpen ? formatEur(stats.unrealizedPnlEur) : '—'} color={stats.isOpen ? pnlColor(stats.unrealizedPnlEur) : undefined} />
          <StatCard label="Realized P&L" value={stats.realizedPnlEur !== 0 ? formatEur(stats.realizedPnlEur) : '—'} color={stats.realizedPnlEur !== 0 ? pnlColor(stats.realizedPnlEur) : undefined} />
          <StatCard label="Dividends" value={stats.dividendsEur > 0 ? formatEur(stats.dividendsEur) : '—'} color={stats.dividendsEur > 0 ? '#51cf66' : undefined} />
          <StatCard label="Total P&L" value={formatEur(stats.totalPnlEur)} color={pnlColor(stats.totalPnlEur)} />
        </SimpleGrid>
      )}

      {/* Fundamentals */}
      {info && (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Fundamentals</Text>
          <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }}>
            <StatCard label="P/E" value={info.peRatio != null ? formatNum(info.peRatio, 1) : '—'} />
            <StatCard label="Fwd P/E" value={info.forwardPeRatio != null ? formatNum(info.forwardPeRatio, 1) : '—'} />
            <StatCard label="EPS" value={info.epsTrailingTwelveMonths != null ? `${formatNum(info.epsTrailingTwelveMonths)} ${info.currency}` : '—'} />
            <StatCard label="Div Yield" value={info.dividendYield != null && !isNaN(info.dividendYield) ? `${formatNum(info.dividendYield, 2)}%` : '—'} color={info.dividendYield != null && info.dividendYield > 0 ? '#51cf66' : undefined} />
            <StatCard label="5Y Div Growth" value={info.divGrowthRate5Y != null ? `${info.divGrowthRate5Y >= 0 ? '+' : ''}${formatNum(info.divGrowthRate5Y, 1)}%` : '—'} color={info.divGrowthRate5Y != null ? (info.divGrowthRate5Y >= 0 ? '#51cf66' : '#ff6b6b') : undefined} />
            <StatCard label="Div Rate" value={info.dividendRate != null ? `${formatNum(info.dividendRate)} ${info.currency}` : '—'} />
            <StatCard label="Ex-Div" value={info.exDividendDate || '—'} />
            <StatCard label="Market Cap" value={info.marketCap != null ? formatMarketCap(info.marketCap) : '—'} />
            <StatCard label="52w High" value={info.fiftyTwoWeekHigh != null ? `${formatNum(info.fiftyTwoWeekHigh)} ${info.currency}` : '—'} />
            <StatCard label="52w Low" value={info.fiftyTwoWeekLow != null ? `${formatNum(info.fiftyTwoWeekLow)} ${info.currency}` : '—'} />
            <StatCard label="Beta" value={info.beta != null ? formatNum(info.beta, 2) : '—'} />
            {info.earningsDate && <StatCard label="Earnings" value={info.earningsDate} />}
          </SimpleGrid>
        </Card>
      )}

      {/* Trade Analysis */}
      {tradeAnalysis && (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Trade Analysis</Text>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }}>
            <StatCard label="Avg Buy" value={`${formatNum(tradeAnalysis.avgBuyPrice)} ${tradeAnalysis.currency}`} />
            <StatCard
              label="Avg Sell"
              value={tradeAnalysis.avgSellPrice != null ? `${formatNum(tradeAnalysis.avgSellPrice)} ${tradeAnalysis.currency}` : '—'}
            />
            <StatCard
              label="Win Rate"
              value={tradeAnalysis.winRate != null ? `${formatNum(tradeAnalysis.winRate, 0)}%` : '—'}
              color={tradeAnalysis.winRate != null ? (tradeAnalysis.winRate >= 50 ? '#51cf66' : '#ff6b6b') : undefined}
            />
            <StatCard label="Buys / Sells" value={`${tradeAnalysis.buyCount} / ${tradeAnalysis.sellCount}`} />
            <StatCard
              label="Avg Hold"
              value={tradeAnalysis.avgHoldDays != null ? `${tradeAnalysis.avgHoldDays}d` : '—'}
            />
            {tradeAnalysis.bestTradeEur != null && (
              <StatCard label="Best Trade" value={formatEur(tradeAnalysis.bestTradeEur)} color="#51cf66" />
            )}
            {tradeAnalysis.worstTradeEur != null && (
              <StatCard label="Worst Trade" value={formatEur(tradeAnalysis.worstTradeEur)} color={pnlColor(tradeAnalysis.worstTradeEur)} />
            )}
          </SimpleGrid>
        </Card>
      )}

      {/* Current holding lots */}
      {holding && holding.lots && holding.lots.length > 0 && (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Current Holding — {formatNum(holding.totalQuantity, 0)} shares @ avg {formatNum(holding.averageCostBasis)} {holding.currency}</Text>
          <ScrollArea>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Acquired</Table.Th>
                  <Table.Th>Broker</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Cost Basis / Share</Table.Th>
                  <Table.Th>Source</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {holding.lots.map((lot, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{lot.acquisitionDate}</Table.Td>
                    <Table.Td>{lot.broker}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.remainingQuantity, lot.remainingQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(lot.costBasisPerShare)} {lot.currency}</Table.Td>
                    <Table.Td>{lot.source}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Price History Chart */}
      {chartData.length > 0 && (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Price History ({chartData.length} entries)</Text>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#373A40" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#c1c2c5', fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#c1c2c5', fontSize: 12 }}
                tickFormatter={(v: number) => formatNum(v, 0)}
              />
              <Tooltip
                formatter={(value: number) => [formatNum(value), 'Price']}
                labelFormatter={(label: string) => `Date: ${label}`}
                {...tooltipStyle}
              />
              <Line type="monotone" dataKey="price" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Detail Tabs */}
      <Tabs defaultValue="transactions">
        <Tabs.List mb="sm">
          <Tabs.Tab value="transactions">Transactions ({transactions.length})</Tabs.Tab>
          {realizedTrades.length > 0 && (
            <Tabs.Tab value="realized">Realized Trades ({realizedTrades.length})</Tabs.Tab>
          )}
          {dividends.length > 0 && (
            <Tabs.Tab value="dividends">Dividends ({dividends.length})</Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="transactions">
          {transactions.length === 0 ? (
            <Text size="sm" c="dimmed">No transactions.</Text>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Broker</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Fees</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {transactions.map((t, i) => (
                    <Table.Tr key={t.id + '-' + i}>
                      <Table.Td>{t.date}</Table.Td>
                      <Table.Td>
                        <Badge color={TYPE_COLORS[t.type] || 'gray'} variant="light" size="sm">{t.type}</Badge>
                      </Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{t.broker}</Text></Table.Td>
                      <Table.Td style={{ maxWidth: 280 }}>
                        <MantineTooltip label={t.description} withArrow openDelay={300}>
                          <Text size="sm" truncate="end">{t.description}</Text>
                        </MantineTooltip>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {t.quantity !== 0 ? formatNum(t.quantity, Math.abs(t.quantity) % 1 === 0 ? 0 : 4) : '—'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {t.pricePerUnit > 0 ? `${formatNum(t.pricePerUnit)} ${t.currency}` : '—'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {formatNum(t.amount)} {t.currency}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {t.fees > 0 ? `${formatNum(t.fees)} ${t.currency}` : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Tabs.Panel>

        {realizedTrades.length > 0 && (
          <Tabs.Panel value="realized">
            <ScrollArea>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Sell Date</Table.Th>
                    <Table.Th>Broker</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Sale Price</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Proceeds</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Cost Basis</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Realized P&L</Table.Th>
                    <Table.Th>Hold</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {realizedTrades.map(t => (
                    <Table.Tr key={t.sellTransactionId}>
                      <Table.Td>{t.sellDate}</Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{t.broker}</Text></Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(t.quantity, t.quantity % 1 === 0 ? 0 : 4)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(t.salePricePerShare)} {t.currency}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.proceedsEur)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatEur(t.totalCostBasisEur)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: pnlColor(t.realizedPnlEur) }}>
                        {formatEur(t.realizedPnlEur)}
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={t.holdPeriod === 'long-term' ? 'green' : 'orange'}>
                          {t.holdPeriod}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Tabs.Panel>
        )}

        {dividends.length > 0 && (
          <Tabs.Panel value="dividends">
            <ScrollArea>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Broker</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Amount</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>EUR</Table.Th>
                    <Table.Th>Description</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dividends.map(d => (
                    <Table.Tr key={d.transactionId}>
                      <Table.Td>{d.date}</Table.Td>
                      <Table.Td><Text size="sm" c="dimmed">{d.broker}</Text></Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(d.amount)} {d.currency}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: '#51cf66' }}>{formatEur(d.amountEur)}</Table.Td>
                      <Table.Td style={{ maxWidth: 300 }}>
                        <Text size="sm" c="dimmed" truncate="end">{d.description}</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}
