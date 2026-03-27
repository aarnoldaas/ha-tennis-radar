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
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

const BASE = (window as any).INGRESS_PATH || '';

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
}

interface InvestmentData {
  transactions: ITransaction[];
  holdings: IHolding[];
}

type SortDir = 'asc' | 'desc';

const TYPE_COLORS: Record<string, string> = {
  BUY: 'green',
  SELL: 'red',
  DIVIDEND: 'blue',
  TAX: 'orange',
  FEE: 'yellow',
  TRANSFER: 'gray',
  INTEREST: 'cyan',
};

function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: SortDir;
  onSort: (field: string) => void;
}) {
  const active = sortField === field;
  return (
    <UnstyledButton onClick={() => onSort(field)} style={{ fontWeight: 600 }}>
      {label} {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </UnstyledButton>
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
              <Table.Td><Text fw={600}>{h.symbol}</Text></Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.totalQuantity, h.totalQuantity % 1 === 0 ? 0 : 4)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.averageCostBasis)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{formatNum(h.totalCostBasisEur)}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatNum(h.currentPrice) : '—'}</Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>{h.currentPrice > 0 ? formatNum(h.currentValueEur) : '—'}</Table.Td>
              <Table.Td style={{ textAlign: 'right', color: h.unrealizedPnl >= 0 ? '#51cf66' : '#ff6b6b' }}>
                {h.currentPrice > 0 ? formatNum(h.unrealizedPnlEur) : '—'}
              </Table.Td>
              <Table.Td style={{ textAlign: 'right', color: h.unrealizedPnlPercent >= 0 ? '#51cf66' : '#ff6b6b' }}>
                {h.currentPrice > 0 ? `${formatNum(h.unrealizedPnlPercent)}%` : '—'}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr style={{ fontWeight: 700 }}>
            <Table.Td>Total</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td style={{ textAlign: 'right' }}>{formatNum(totals.totalCost)}</Table.Td>
            <Table.Td />
            <Table.Td style={{ textAlign: 'right' }}>{formatNum(totals.totalValue)}</Table.Td>
            <Table.Td style={{ textAlign: 'right', color: totals.totalPnl >= 0 ? '#51cf66' : '#ff6b6b' }}>
              {formatNum(totals.totalPnl)}
            </Table.Td>
            <Table.Td style={{ textAlign: 'right', color: totals.totalPnl >= 0 ? '#51cf66' : '#ff6b6b' }}>
              {totals.totalCost > 0 ? `${formatNum((totals.totalPnl / totals.totalCost) * 100)}%` : '—'}
            </Table.Td>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea>
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
              <Table.Td><Text fw={t.symbol ? 600 : 400}>{t.symbol || '—'}</Text></Table.Td>
              <Table.Td style={{ maxWidth: 300 }}>
                <Text size="sm" truncate="end">{t.description}</Text>
              </Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>
                {t.quantity !== 0 ? formatNum(t.quantity, Math.abs(t.quantity) % 1 === 0 ? 0 : 4) : '—'}
              </Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>
                {t.pricePerUnit > 0 ? formatNum(t.pricePerUnit) : '—'}
              </Table.Td>
              <Table.Td style={{ textAlign: 'right' }}>
                {formatNum(t.amount)} {t.currency}
              </Table.Td>
              <Table.Td>{(t.raw as any)?.debitCredit || '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

const theme = createTheme({ primaryColor: 'blue', defaultRadius: 'md' });

function App() {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/investments`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Container size="xl" py="md">
        <Group justify="space-between" mb="md">
          <Title order={3}>Investments</Title>
          <Button variant="subtle" component="a" href={`${BASE}/`} size="xs">
            Back to Life Helper
          </Button>
        </Group>

        {loading && (
          <Center py="xl"><Loader size="sm" /></Center>
        )}

        {error && (
          <Alert color="red" title="Error" mb="md">{error}</Alert>
        )}

        {data && (
          <Tabs defaultValue="holdings">
            <Tabs.List mb="md">
              <Tabs.Tab value="holdings">
                Holdings ({data.holdings.length})
              </Tabs.Tab>
              <Tabs.Tab value="transactions">
                Transactions ({data.transactions.length})
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="holdings">
              {data.holdings.length > 0
                ? <Card padding="xs"><HoldingsTable holdings={data.holdings} /></Card>
                : <Text c="dimmed">No holdings found.</Text>
              }
            </Tabs.Panel>

            <Tabs.Panel value="transactions">
              {data.transactions.length > 0
                ? <Card padding="xs"><TransactionsTable transactions={data.transactions} /></Card>
                : <Text c="dimmed">No transactions found.</Text>
              }
            </Tabs.Panel>
          </Tabs>
        )}
      </Container>
    </MantineProvider>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
