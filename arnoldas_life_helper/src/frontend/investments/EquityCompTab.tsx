import { useState } from 'react';
import { Card, Text, Group, Stack, SimpleGrid, Table, Select, Badge, UnstyledButton } from '@mantine/core';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { RsuCompensationSummary, EsppSummary, InvestmentData } from './types';
import { formatNum, formatEur } from './utils';
import { CHART_COLORS, tooltipStyle } from './chart-theme';

interface EquityCompTabProps {
  rsu: RsuCompensationSummary;
  espp: EsppSummary;
  rsuByYearWithCumulative: InvestmentData['rsuByYearWithCumulative'];
}

export function EquityCompTab({ rsu, espp, rsuByYearWithCumulative }: EquityCompTabProps) {
  const [rsuView, setRsuView] = useState<string>('year');
  const [expandedGrant, setExpandedGrant] = useState<string | null>(null);

  return (
    <Stack gap="md">
      {/* RSU Combo Chart */}
      <Card padding="md" radius="md" withBorder>
        <Text fw={600} mb="xs">RSU Compensation by Year</Text>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={rsuByYearWithCumulative} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#373A40" />
            <XAxis dataKey="year" tick={{ fill: '#c1c2c5', fontSize: 11 }} />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#c1c2c5', fontSize: 11 }}
              tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#c1c2c5', fontSize: 11 }}
              tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number, name: string) => [formatEur(value), name]}
            />
            <Legend wrapperStyle={{ color: '#c1c2c5', fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="totalCompensationEur" name="Annual (EUR)" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" dataKey="cumulativeEur" name="Cumulative (EUR)" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* RSU View Toggle */}
      <Group>
        <Select
          label="RSU View"
          value={rsuView}
          onChange={v => setRsuView(v || 'year')}
          data={[
            { value: 'year', label: 'By Year' },
            { value: 'grant', label: 'By Grant' },
          ]}
          w={160}
        />
      </Group>

      {/* RSU By Year Table */}
      {rsuView === 'year' && (
        <Card padding="md" radius="md" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Year</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Shares</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Compensation (EUR)</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Cumulative (EUR)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rsuByYearWithCumulative.map(row => (
                <Table.Tr key={row.year}>
                  <Table.Td fw={600}>{row.year}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatNum(row.totalShares, 0)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(row.totalCompensationEur)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatEur(row.cumulativeEur)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td fw={700}>Total</Table.Td>
                <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {formatNum(rsu.byYear.reduce((s, y) => s + y.totalShares, 0), 0)}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>{formatEur(rsu.totalCompensationEur)}</Table.Td>
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Card>
      )}

      {/* RSU By Grant Table */}
      {rsuView === 'grant' && rsu.byGrant && (
        <Card padding="md" radius="md" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Grant ID</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Total Shares</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Total Compensation (USD)</Table.Th>
                <Table.Th>Vestings</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rsu.byGrant.map(grant => (
                <>
                  <Table.Tr key={grant.grantId}>
                    <Table.Td>
                      <UnstyledButton
                        onClick={() => setExpandedGrant(expandedGrant === grant.grantId ? null : grant.grantId)}
                        style={{ fontWeight: 600 }}
                      >
                        {expandedGrant === grant.grantId ? '▾' : '▸'} {grant.grantId}
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(grant.totalShares, 0)}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>${formatNum(grant.totalCompensation)}</Table.Td>
                    <Table.Td>{grant.vestings.length} vestings</Table.Td>
                  </Table.Tr>
                  {expandedGrant === grant.grantId && grant.vestings.map((v, i) => (
                    <Table.Tr key={`${grant.grantId}-${i}`} style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <Table.Td pl={40}>{v.vestingDate}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>{formatNum(v.shares, 0)}</Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>${formatNum(v.compensationValue)}</Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">FMV: ${formatNum(v.fmvAtVesting)}</Text>
                          {v.isSameDaySale && <Badge size="xs" color="orange" variant="light">Same-day sale</Badge>}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* ESPP Summary */}
      <Card padding="md" radius="md" withBorder>
        <Text fw={600} mb="sm">ESPP Summary</Text>
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Shares Purchased</Text>
            <Text fw={600}>{formatNum(espp.totalSharesPurchased, 0)}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Total Cost Basis</Text>
            <Text fw={600}>${formatNum(espp.totalCostBasis)}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Discount Captured</Text>
            <Text fw={600} c="#51cf66">{formatEur(espp.totalDiscountCapturedEur)}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Avg Discount</Text>
            <Text fw={600}>{formatNum(espp.averageDiscountPercent)}%</Text>
          </Stack>
        </SimpleGrid>
      </Card>
    </Stack>
  );
}
