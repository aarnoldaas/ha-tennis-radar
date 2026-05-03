import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
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
  PasswordInput,
  Switch,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

import type { InvestmentData } from './investments/types';
import { BASE, formatHoldingsForClipboard, timeAgo } from './investments/utils';

import { PortfolioSummaryCard } from './investments/PortfolioSummary';
import { DashboardOverview } from './investments/DashboardOverview';
import { IncomeCard } from './investments/IncomeCard';
import { HoldingsTab } from './investments/HoldingsTab';
import { RealizedPnlTab } from './investments/RealizedPnlTab';
import { AllocationTab } from './investments/AllocationTab';
import { EquityCompTab } from './investments/EquityCompTab';
import { TradeAnalysisTab } from './investments/TradeAnalysisTab';
import { StocksTab } from './investments/StocksTab';
import { TransactionsTab } from './investments/TransactionsTab';
import { MarketDataTab } from './investments/MarketDataTab';
import { StockDetailView } from './investments/StockDetailView';
import { UploadTab } from './investments/UploadTab';
import { PlanTab } from './investments/PlanTab';
import { AiInsightsTab } from './investments/AiInsightsTab';
import { PriceHistoryTab } from './investments/PriceHistoryTab';

interface Config {
  anthropic_api_key: string;
  debug: boolean;
}

function SettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/config`).then(r => r.json()).then(setConfig).catch(console.error);
  }, []);

  const update = useCallback((key: keyof Config, value: any) => {
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`${BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const result = await res.json();
      setSaveResult(result.success ? 'ok' : 'error');
    } catch {
      setSaveResult('error');
    }
    setSaving(false);
    setTimeout(() => setSaveResult(null), 3000);
  };

  if (!config) {
    return <Center py="xl"><Loader size="sm" /></Center>;
  }

  return (
    <Stack gap="md">
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">AI</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <PasswordInput
            label="Anthropic API Key"
            description="Required for AI portfolio insights and plan refinement"
            placeholder="sk-ant-..."
            value={config.anthropic_api_key}
            onChange={e => update('anthropic_api_key', e.currentTarget.value)}
            size="sm"
          />
        </Card.Section>
      </Card>

      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">Advanced</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Switch
            label="Debug Mode"
            checked={config.debug}
            onChange={e => update('debug', e.currentTarget.checked)}
            size="sm"
          />
        </Card.Section>
      </Card>

      <Group gap="md" className="save-bar">
        <Button onClick={handleSave} loading={saving} size="sm">
          Save Settings
        </Button>
        {saveResult === 'ok' && (
          <Text size="sm" c="green">Settings saved!</Text>
        )}
        {saveResult === 'error' && (
          <Text size="sm" c="red">Failed to save settings.</Text>
        )}
      </Group>
    </Stack>
  );
}

const theme = createTheme({
  primaryColor: 'yellow',
  defaultRadius: 'md',
  fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  headings: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeight: '700',
  },
  colors: {
    yellow: [
      '#fff9e6', '#fff0bf', '#ffe699', '#ffd966', '#ffcc33',
      '#f5a623', '#d48c1a', '#a87216', '#7a5310', '#4d340a',
    ],
  },
  other: {
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  },
});

function App() {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [topTab, setTopTab] = useState<'investments' | 'settings'>('investments');

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
            <Title order={3}>Investments</Title>
            {topTab === 'investments' && (
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
            )}
          </Group>
          <Tabs value={topTab} variant="pills" onChange={(v) => v && setTopTab(v as 'investments' | 'settings')}>
            <Tabs.List>
              <Tabs.Tab value="investments">Investments</Tabs.Tab>
              <Tabs.Tab value="settings">Settings</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </Stack>

        {topTab === 'settings' ? (
          <SettingsPanel />
        ) : (
          <>
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
                    <Tabs.Tab value="price-history">
                      Price History
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

                  <Tabs.Panel value="price-history">
                    <PriceHistoryTab allTickers={Object.keys(data.priceHistory)} />
                  </Tabs.Panel>
                </Tabs>
                )}
              </>
            )}
          </>
        )}
      </Container>
    </MantineProvider>
  );
}

function mount() {
  const root = document.getElementById('app');
  if (root) {
    createRoot(root).render(<App />);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createRoot(document.getElementById('app')!).render(<App />);
    });
  }
}
mount();
