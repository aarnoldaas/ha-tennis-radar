import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Text,
  Title,
} from '@mantine/core';
import '@mantine/core/styles.css';
import './custom.css';

import { api, type PortfolioSnapshot } from './investments/api';
import { UploadTab } from './investments/UploadTab';
import { OverviewTab } from './investments/OverviewTab';
import { HoldingsTab } from './investments/HoldingsTab';
import { TransactionsTab } from './investments/TransactionsTab';
import { CashflowTab } from './investments/CashflowTab';
import { AllocationTab } from './investments/AllocationTab';
import { MappingsTab } from './investments/MappingsTab';
import { FilesTab } from './investments/FilesTab';
import { InstrumentDetailModal } from './investments/InstrumentDetailModal';

type NavPage =
  | 'overview'
  | 'holdings'
  | 'transactions'
  | 'cashflow'
  | 'allocation'
  | 'mappings'
  | 'upload'
  | 'files';

interface NavItem {
  page: NavPage;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Portfolio',
    icon: '▦',
    items: [
      { page: 'overview', label: 'Overview', icon: '◎' },
      { page: 'holdings', label: 'Holdings', icon: '≡' },
      { page: 'transactions', label: 'Transactions', icon: '↹' },
      { page: 'cashflow', label: 'Cashflow', icon: '⇅' },
      { page: 'allocation', label: 'Allocation', icon: '◐' },
    ],
  },
  {
    label: 'Data',
    icon: '↑',
    items: [
      { page: 'mappings', label: 'Mappings', icon: '⇄' },
      { page: 'upload', label: 'Upload', icon: '↑' },
      { page: 'files', label: 'Files', icon: '⌘' },
    ],
  },
];

function getInitialPage(): NavPage {
  const screen = new URLSearchParams(window.location.search).get('screen');
  const all: NavPage[] = [
    'overview',
    'holdings',
    'transactions',
    'cashflow',
    'allocation',
    'mappings',
    'upload',
    'files',
  ];
  return (all.includes(screen as NavPage) ? (screen as NavPage) : 'overview');
}

function Sidebar({
  active,
  onNavigate,
  statusDot,
}: {
  active: NavPage;
  onNavigate: (p: NavPage) => void;
  statusDot: React.ReactNode;
}) {
  return (
    <nav className="lh-sidebar">
      <div className="lh-sidebar-brand">
        <h3>Investments</h3>
      </div>
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="lh-sidebar-section">
          <div className="lh-sidebar-section-label">
            <span className="lh-nav-icon">{group.icon}</span> {group.label}
            {group.label === 'Portfolio' && (
              <span style={{ marginLeft: 8, display: 'inline-flex' }}>{statusDot}</span>
            )}
          </div>
          {group.items.map(item => (
            <button
              key={item.page}
              className={`lh-nav-item ${active === item.page ? 'lh-nav-item-active' : ''}`}
              onClick={() => onNavigate(item.page)}
            >
              <span className="lh-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function BottomTabs({
  active,
  onNavigate,
}: {
  active: NavPage;
  onNavigate: (p: NavPage) => void;
}) {
  const tabs: { icon: string; label: string; page: NavPage }[] = [
    { icon: '◎', label: 'Overview', page: 'overview' },
    { icon: '≡', label: 'Holdings', page: 'holdings' },
    { icon: '↹', label: 'Transactions', page: 'transactions' },
    { icon: '↑', label: 'Upload', page: 'upload' },
  ];
  return (
    <div className="lh-bottom-tabs">
      <div className="lh-bottom-tabs-inner">
        {tabs.map(tab => (
          <button
            key={tab.page}
            className={`lh-bottom-tab ${active === tab.page ? 'lh-bottom-tab-active' : ''}`}
            onClick={() => onNavigate(tab.page)}
          >
            <span className="lh-bottom-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<NavPage>(getInitialPage);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openInstrument, setOpenInstrument] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(snapshot === null);
    setError(null);
    try {
      const snap = await api.portfolio();
      setSnapshot(snap);
    } catch (e: any) {
      setError(e?.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [snapshot]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.refresh();
      const snap = await api.portfolio();
      setSnapshot(snap);
    } catch (e: any) {
      setError(e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const navigate = useCallback((next: NavPage) => {
    setPage(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('screen');
    else url.searchParams.set('screen', next);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const title = useMemo(() => {
    for (const g of NAV_GROUPS) {
      for (const i of g.items) if (i.page === page) return i.label;
    }
    return '';
  }, [page]);

  const statusDot = error ? (
    <span className="lh-status-dot lh-status-dot-red" />
  ) : snapshot?.unresolved?.length ? (
    <span className="lh-status-dot lh-status-dot-yellow" />
  ) : snapshot ? (
    <span className="lh-status-dot lh-status-dot-green" />
  ) : null;

  const content = () => {
    if (loading && !snapshot) {
      return (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      );
    }
    if (error && !snapshot) {
      return (
        <Alert color="red" title="Unable to load portfolio">
          {error}
        </Alert>
      );
    }
    if (!snapshot) return null;

    switch (page) {
      case 'overview':
        return <OverviewTab snapshot={snapshot} />;
      case 'holdings':
        return (
          <HoldingsTab
            snapshot={snapshot}
            onOpenInstrument={id => setOpenInstrument(id)}
          />
        );
      case 'transactions':
        return <TransactionsTab />;
      case 'cashflow':
        return <CashflowTab />;
      case 'allocation':
        return <AllocationTab snapshot={snapshot} />;
      case 'mappings':
        return <MappingsTab />;
      case 'upload':
        return <UploadTab />;
      case 'files':
        return <FilesTab />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ width: 220, flexShrink: 0 }} className="lh-sidebar-wrapper">
        <Sidebar active={page} onNavigate={navigate} statusDot={statusDot} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lh-content" key={page}>
          <Group justify="space-between" mb="lg">
            <Title order={4}>{title}</Title>
            <Group gap="xs">
              {snapshot && (
                <Text size="xs" c="dimmed">
                  As of {new Date(snapshot.asOf).toLocaleString()}
                </Text>
              )}
              <Button
                variant="default"
                size="xs"
                onClick={refresh}
                loading={refreshing}
                disabled={loading}
              >
                Refresh
              </Button>
            </Group>
          </Group>
          {content()}
        </div>
      </div>
      <BottomTabs active={page} onNavigate={navigate} />
      <InstrumentDetailModal
        instrumentId={openInstrument}
        onClose={() => setOpenInstrument(null)}
      />
    </div>
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

function mount() {
  const app = (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  );
  const root = document.getElementById('app');
  if (root) {
    createRoot(root).render(app);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createRoot(document.getElementById('app')!).render(app);
    });
  }
}
mount();
