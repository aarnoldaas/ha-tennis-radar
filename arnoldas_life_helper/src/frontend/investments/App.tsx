import { useState, useEffect } from 'react';
import {
  MantineProvider,
  createTheme,
  Container,
  Group,
  Stack,
  Tabs,
  Title,
  Button,
  Text,
  Center,
  Loader,
  Alert,
  Card,
} from '@mantine/core';
import '@mantine/core/styles.css';
import '../custom.css';

import type { InvestmentData } from './types';
import { BASE, formatHoldingsForClipboard, timeAgo } from './utils';

import { PortfolioSummaryCard } from './PortfolioSummary';
import { DashboardOverview } from './DashboardOverview';
import { IncomeCard } from './IncomeCard';
import { HoldingsTab } from './HoldingsTab';
import { RealizedPnlTab } from './RealizedPnlTab';
import { AllocationTab } from './AllocationTab';
import { EquityCompTab } from './EquityCompTab';
import { TradeAnalysisTab } from './TradeAnalysisTab';
import { StocksTab } from './StocksTab';
import { TransactionsTab } from './TransactionsTab';
import { MarketDataTab } from './MarketDataTab';
import { StockDetailView } from './StockDetailView';
import { UploadTab } from './UploadTab';
import { PlanTab } from './PlanTab';
import { AiInsightsTab } from './AiInsightsTab';

const theme = createTheme({ primaryColor: 'blue', defaultRadius: 'md' });

export function App() {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

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

            <DashboardOverview data={data} />

            <IncomeCard data={data} />

            {selectedStock ? (
              <StockDetailView ticker={selectedStock} data={data} onBack={() => setSelectedStock(null)} />
            ) : (
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
                <Tabs.Tab value="trade-analysis">
                  Trade Analysis
                </Tabs.Tab>
                <Tabs.Tab value="market-data">
                  Market Data
                </Tabs.Tab>
                <Tabs.Tab value="transactions">
                  Transactions ({data.transactions.length})
                </Tabs.Tab>
                <Tabs.Tab value="upload">
                  Upload
                </Tabs.Tab>
                <Tabs.Tab value="plan">
                  Plan
                </Tabs.Tab>
                <Tabs.Tab value="ai-insights">
                  AI Insights
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="holdings">
                {data.holdings.length > 0
                  ? <Card padding="xs"><HoldingsTab holdings={data.holdings} onSelectStock={setSelectedStock} /></Card>
                  : <Text c="dimmed">No holdings found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="realized">
                {data.realizedTrades.length > 0
                  ? <Card padding="xs"><RealizedPnlTab trades={data.realizedTrades} /></Card>
                  : <Text c="dimmed">No realized trades found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="allocation">
                {data.allocation
                  ? <AllocationTab allocation={data.allocation} />
                  : <Text c="dimmed">No allocation data.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="equity">
                <EquityCompTab rsu={data.rsuCompensation} espp={data.esppSummary} rsuByYearWithCumulative={data.rsuByYearWithCumulative} />
              </Tabs.Panel>

              <Tabs.Panel value="stocks">
                <Card padding="xs"><StocksTab data={data} onSelectStock={setSelectedStock} /></Card>
              </Tabs.Panel>

              <Tabs.Panel value="trade-analysis">
                <TradeAnalysisTab data={data} onSelectStock={setSelectedStock} />
              </Tabs.Panel>

              <Tabs.Panel value="market-data">
                <Card padding="md"><MarketDataTab data={data} onSelectStock={setSelectedStock} /></Card>
              </Tabs.Panel>

              <Tabs.Panel value="transactions">
                {data.transactions.length > 0
                  ? <Card padding="xs"><TransactionsTab transactions={data.transactions} /></Card>
                  : <Text c="dimmed">No transactions found.</Text>
                }
              </Tabs.Panel>

              <Tabs.Panel value="upload">
                <UploadTab onDataChange={loadData} />
              </Tabs.Panel>

              <Tabs.Panel value="plan">
                <PlanTab />
              </Tabs.Panel>

              <Tabs.Panel value="ai-insights">
                <Card padding="md">
                  <AiInsightsTab />
                </Card>
              </Tabs.Panel>
            </Tabs>
            )}
          </>
        )}
      </Container>
    </MantineProvider>
  );
}
