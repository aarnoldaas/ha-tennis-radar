import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { InvestmentData } from './portfolio-service.js';

export interface AiSuggestions {
  suggestions: string;
  generatedAt: string;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const SUGGESTIONS_PATH = `${DATA_DIR}/ai-suggestions.json`;

export function loadSavedSuggestions(): AiSuggestions | null {
  if (!existsSync(SUGGESTIONS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SUGGESTIONS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveSuggestions(suggestions: AiSuggestions): void {
  writeFileSync(SUGGESTIONS_PATH, JSON.stringify(suggestions, null, 2));
}

function buildPortfolioContext(data: InvestmentData): string {
  const ps = data.portfolioSummary;
  const lines: string[] = [];

  lines.push('## Portfolio Summary (EUR)');
  lines.push(`- Total Value: €${ps.totalValue.toFixed(2)}`);
  lines.push(`- Cost Basis: €${ps.totalCost.toFixed(2)}`);
  lines.push(`- Unrealized P&L: €${ps.unrealizedPnl.toFixed(2)} (${ps.totalReturnPct.toFixed(2)}%)`);
  lines.push(`- Realized P&L: €${ps.totalRealizedPnl.toFixed(2)}`);
  lines.push(`- Dividends: €${ps.totalDividends.toFixed(2)}`);
  lines.push(`- Interest: €${ps.totalInterest.toFixed(2)}`);
  lines.push(`- Total Return: €${ps.totalReturn.toFixed(2)}`);
  lines.push('');

  // Holdings
  lines.push('## Current Holdings');
  lines.push('| Symbol | Qty | Avg Cost | Currency | Value (EUR) | P&L (EUR) | P&L % |');
  lines.push('|--------|-----|----------|----------|-------------|-----------|-------|');
  const sortedHoldings = [...data.holdings].sort((a, b) => b.currentValueEur - a.currentValueEur);
  for (const h of sortedHoldings) {
    lines.push(`| ${h.symbol} | ${h.totalQuantity.toFixed(2)} | ${h.averageCostBasis.toFixed(2)} | ${h.currency} | €${h.currentValueEur.toFixed(2)} | €${h.unrealizedPnlEur.toFixed(2)} | ${h.unrealizedPnlPercent.toFixed(2)}% |`);
  }
  lines.push('');

  // Allocation
  if (data.allocation) {
    lines.push('## Allocation');
    lines.push('### By Geography');
    for (const e of data.allocation.byGeography) {
      lines.push(`- ${e.name}: ${e.percent.toFixed(1)}% (€${e.valueEur.toFixed(2)})`);
    }
    lines.push('### By Sector');
    for (const e of data.allocation.bySector) {
      lines.push(`- ${e.name}: ${e.percent.toFixed(1)}% (€${e.valueEur.toFixed(2)})`);
    }
    lines.push('### By Currency');
    for (const e of data.allocation.byCurrency) {
      lines.push(`- ${e.name}: ${e.percent.toFixed(1)}% (€${e.valueEur.toFixed(2)})`);
    }
    lines.push('');
  }

  // Risk warnings
  if (data.riskWarnings.length > 0) {
    lines.push('## Current Risk Warnings');
    for (const w of data.riskWarnings) {
      lines.push(`- [${w.severity}] ${w.message}`);
    }
    lines.push('');
  }

  // Realized P&L summary
  const rs = data.realizedTradeSummary;
  lines.push('## Realized Trades Summary');
  lines.push(`- Total Realized P&L: €${rs.totalPnl.toFixed(2)}`);
  lines.push(`- Short-term: €${rs.shortTermPnl.toFixed(2)} (${rs.shortTermCount} trades)`);
  lines.push(`- Long-term: €${rs.longTermPnl.toFixed(2)} (${rs.longTermCount} trades)`);
  lines.push('');

  // Top stocks by P&L
  lines.push('## Per-Stock Performance (top 15 by total P&L)');
  const topStocks = [...data.stockStats].sort((a, b) => Math.abs(b.totalPnlEur) - Math.abs(a.totalPnlEur)).slice(0, 15);
  for (const s of topStocks) {
    lines.push(`- ${s.symbol}: invested €${s.totalInvestedEur.toFixed(2)}, realized €${s.realizedPnlEur.toFixed(2)}, unrealized €${s.unrealizedPnlEur.toFixed(2)}, dividends €${s.dividendsEur.toFixed(2)}, total P&L €${s.totalPnlEur.toFixed(2)} (${s.isOpen ? 'open' : 'closed'})`);
  }

  return lines.join('\n');
}

export async function generateAiSuggestions(apiKey: string, data: InvestmentData): Promise<AiSuggestions> {
  const client = new Anthropic({ apiKey });
  const portfolioContext = buildPortfolioContext(data);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a personal investment advisor analyzing my portfolio. Based on the data below, provide actionable insights and suggestions. Be concise and specific to MY portfolio. Use markdown formatting.

Structure your response as:
1. **Portfolio Health** — overall assessment (2-3 sentences)
2. **Key Strengths** — what's working well (2-3 bullet points)
3. **Concerns** — risks or issues to address (2-3 bullet points)
4. **Suggestions** — specific actionable recommendations (3-5 bullet points)
5. **Tax Considerations** — any tax-loss harvesting or holding period opportunities

${portfolioContext}`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  const suggestions: AiSuggestions = {
    suggestions: text,
    generatedAt: new Date().toISOString(),
  };

  saveSuggestions(suggestions);
  return suggestions;
}
