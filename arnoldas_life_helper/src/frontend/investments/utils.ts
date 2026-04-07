import type { IHolding } from './types';

export const BASE = (window as any).INGRESS_PATH || '';

export const TYPE_COLORS: Record<string, string> = {
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

export function formatNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatEur(n: number): string {
  return `\u20AC${formatNum(n)}`;
}

export function pnlColor(n: number): string {
  return n >= 0 ? '#51cf66' : '#ff6b6b';
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatHoldingsForClipboard(holdings: IHolding[]): string {
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

export function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${formatNum(n, 0)}`;
}

export function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 style="margin: 12px 0 4px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin: 16px 0 8px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin: 16px 0 8px">$1</h2>')
    .replace(/^- (.+)$/gm, '<li style="margin-left: 16px">$1</li>')
    .replace(/^\d+\. \*\*(.+?)\*\*(.*)$/gm, '<li style="margin-left: 16px; margin-top: 8px"><strong>$1</strong>$2</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-left: 16px; margin-top: 8px">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '\n');
}

export const IR_URLS: Record<string, string> = {
  APG1L: 'https://www.apgrupė.lt/en/investors/',
  IGN1L: 'https://www.ignitis.lt/en/investors',
  TEL1L: 'https://www.tfrgroup.com/en/investors',
  KNF1L: 'https://www.kn.lt/en/investors/for-investors/701',
  SAB1L: 'https://www.sab.lt/en/investors',
  LNA1L: 'https://www.linasfurniture.com/en/investors/',
  ROE1L: 'https://www.rokiskio.com/en/investors',
  ASML: 'https://www.asml.com/en/investors',
  E3G1: 'https://www.evolution.com/investors/',
  GOOG: 'https://abc.xyz/investor/',
  BABA: 'https://www.alibabagroup.com/en-US/investor-relations',
  WIX: 'https://investors.wix.com/',
  PBR: 'https://www.investidorpetrobras.com.br/en/',
  NOVA: 'https://www.novonordisk.com/investors.html',
  '002594': 'https://ir.byd.com/',
};

export const BROKERS = [
  { value: 'swedbank', label: 'Swedbank' },
  { value: 'interactive-brokers', label: 'Interactive Brokers' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'wix', label: 'Wix' },
];
