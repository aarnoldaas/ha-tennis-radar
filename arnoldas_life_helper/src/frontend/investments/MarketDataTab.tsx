import { useMemo } from 'react';
import {
  Card, Text, Group, Stack, Table, ScrollArea,
  Tooltip as MantineTooltip, Anchor, Alert, Badge, UnstyledButton,
} from '@mantine/core';
import type { InvestmentData } from './types';
import { formatNum, formatMarketCap, IR_URLS } from './utils';
import { pnlColor } from './utils';

export function MarketDataTab({ data, onSelectStock }: { data: InvestmentData; onSelectStock?: (ticker: string) => void }) {
  const stockInfo = data.stockInfo || [];

  return (
    <Stack gap="md">
      {/* Stock Fundamentals */}
      {stockInfo.length > 0 ? (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Stock Fundamentals — click a ticker for full details</Text>
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
                  <Table.Th style={{ textAlign: 'right' }}>5Y Div Growth</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Div Rate</Table.Th>
                  <Table.Th>Ex-Div Date</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Market Cap</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>52w High</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>52w Low</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Beta</Table.Th>
                  <Table.Th>IR</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stockInfo.map(si => {
                  const pctFrom52High = si.fiftyTwoWeekHigh
                    ? ((si.currentPrice - si.fiftyTwoWeekHigh) / si.fiftyTwoWeekHigh) * 100
                    : null;
                  return (
                    <Table.Tr key={si.ticker}>
                      <Table.Td>
                        <UnstyledButton onClick={() => onSelectStock?.(si.ticker)}>
                          <Text fw={600} style={{ textDecoration: 'underline dotted', color: '#74c0fc', cursor: 'pointer' }}>{si.ticker}</Text>
                        </UnstyledButton>
                      </Table.Td>
                      <Table.Td style={{ maxWidth: 180 }}><Text size="sm" truncate="end">{si.name}</Text></Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(si.currentPrice)} {si.currency}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.peRatio != null ? formatNum(si.peRatio, 1) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.forwardPeRatio != null ? formatNum(si.forwardPeRatio, 1) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{si.epsTrailingTwelveMonths != null ? formatNum(si.epsTrailingTwelveMonths) : '\u2014'}</Table.Td>
                      <Table.Td style={{ textAlign: 'right', color: si.dividendYield != null && si.dividendYield > 0 ? '#51cf66' : undefined }}>
                        {si.dividendYield != null && !isNaN(si.dividendYield) ? `${formatNum(si.dividendYield, 2)}%` : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.divGrowthRate5Y != null
                          ? <Text span size="sm" c={si.divGrowthRate5Y >= 0 ? '#51cf66' : '#ff6b6b'}>{si.divGrowthRate5Y >= 0 ? '+' : ''}{formatNum(si.divGrowthRate5Y, 1)}%</Text>
                          : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.dividendRate != null ? `${formatNum(si.dividendRate)} ${si.currency}` : '\u2014'}
                      </Table.Td>
                      <Table.Td>
                        {si.exDividendDate ? (() => {
                          const today = new Date().toISOString().slice(0, 10);
                          const isUpcoming = si.exDividendDate >= today;
                          const daysUntil = Math.ceil(
                            (new Date(si.exDividendDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                          );
                          return (
                            <MantineTooltip label={isUpcoming ? `In ${daysUntil} days` : 'Past'} withArrow>
                              <Text
                                span
                                size="sm"
                                fw={isUpcoming ? 700 : 400}
                                c={isUpcoming ? (daysUntil <= 14 ? 'orange' : '#51cf66') : 'dimmed'}
                              >
                                {si.exDividendDate}
                              </Text>
                            </MantineTooltip>
                          );
                        })() : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.marketCap != null ? formatMarketCap(si.marketCap) : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.fiftyTwoWeekHigh != null ? (
                          <span>
                            {formatNum(si.fiftyTwoWeekHigh)}
                            {pctFrom52High != null && (
                              <Text span size="xs" c={pctFrom52High >= 0 ? '#51cf66' : '#ff6b6b'}>
                                {' '}({formatNum(pctFrom52High, 1)}%)
                              </Text>
                            )}
                          </span>
                        ) : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.fiftyTwoWeekLow != null ? formatNum(si.fiftyTwoWeekLow) : '\u2014'}
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        {si.beta != null ? formatNum(si.beta, 2) : '\u2014'}
                      </Table.Td>
                      <Table.Td>
                        {IR_URLS[si.ticker] ? (
                          <Anchor href={IR_URLS[si.ticker]} target="_blank" size="xs">IR</Anchor>
                        ) : '\u2014'}
                      </Table.Td>
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
    </Stack>
  );
}

export default MarketDataTab;
