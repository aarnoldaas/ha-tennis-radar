import {
  Card, Text, Stack, Table, ScrollArea,
  Anchor, Alert, UnstyledButton,
} from '@mantine/core';
import type { InvestmentData } from './types';
import { formatNum, IR_URLS } from './utils';

export function MarketDataTab({ data, onSelectStock }: { data: InvestmentData; onSelectStock?: (ticker: string) => void }) {
  const stockInfo = data.stockInfo || [];

  return (
    <Stack gap="md">
      {stockInfo.length > 0 ? (
        <Card padding="md" withBorder>
          <Text size="sm" fw={600} mb="sm">Live Prices — click a ticker for full details</Text>
          <ScrollArea>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                  <Table.Th>IR</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {stockInfo.map(si => (
                  <Table.Tr key={si.ticker}>
                    <Table.Td>
                      <UnstyledButton onClick={() => onSelectStock?.(si.ticker)}>
                        <Text fw={600} style={{ textDecoration: 'underline dotted', color: '#74c0fc', cursor: 'pointer' }}>{si.ticker}</Text>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: 180 }}><Text size="sm" truncate="end">{si.name}</Text></Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{formatNum(si.currentPrice)} {si.currency}</Table.Td>
                    <Table.Td>
                      {IR_URLS[si.ticker] ? (
                        <Anchor href={IR_URLS[si.ticker]} target="_blank" size="xs">IR</Anchor>
                      ) : '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      ) : (
        <Alert color="blue" variant="light">
          Click "Refresh Prices" to fetch live prices from Stooq. Tickers without Stooq coverage (Baltic, BYD, E3G1) can be updated via the Price History tab.
        </Alert>
      )}
    </Stack>
  );
}

export default MarketDataTab;
