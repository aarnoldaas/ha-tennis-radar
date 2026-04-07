import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { InvestmentData } from './portfolio-service.js';

export interface InvestmentPlan {
  content: string;
  updatedAt: string;
}

export interface RefinedPlan {
  content: string;
  refinedAt: string;
}

const DATA_DIR = process.env.DATA_DIR || '/data';
const PLAN_PATH = `${DATA_DIR}/investment-plan.json`;

export function loadPlan(): InvestmentPlan | null {
  if (!existsSync(PLAN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PLAN_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

export function savePlan(content: string): InvestmentPlan {
  const plan: InvestmentPlan = { content, updatedAt: new Date().toISOString() };
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  return plan;
}

function buildPlanContext(data: InvestmentData, plan: string): string {
  const ps = data.portfolioSummary;
  const lines: string[] = [];

  lines.push('## Current Portfolio (EUR)');
  lines.push(`- Value: €${ps.totalValue.toFixed(2)}, Cost: €${ps.totalCost.toFixed(2)}`);
  lines.push(`- Unrealized P&L: €${ps.unrealizedPnl.toFixed(2)} (${ps.totalReturnPct.toFixed(2)}%)`);
  lines.push(`- Realized P&L: €${ps.totalRealizedPnl.toFixed(2)}, Dividends: €${ps.totalDividends.toFixed(2)}`);
  lines.push('');

  lines.push('## Holdings');
  const sorted = [...data.holdings].sort((a, b) => b.currentValueEur - a.currentValueEur);
  for (const h of sorted) {
    lines.push(`- ${h.symbol}: ${h.totalQuantity} shares, avg cost ${h.averageCostBasis.toFixed(2)} ${h.currency}, value €${h.currentValueEur.toFixed(2)}, P&L ${h.unrealizedPnlPercent.toFixed(1)}%`);
  }
  lines.push('');

  if (data.allocation) {
    lines.push('## Allocation');
    for (const e of data.allocation.byGeography) {
      lines.push(`- ${e.name}: ${e.percent.toFixed(1)}%`);
    }
    lines.push('');
  }

  if (data.riskWarnings.length > 0) {
    lines.push('## Risk Warnings');
    for (const w of data.riskWarnings) {
      lines.push(`- ${w.message}`);
    }
    lines.push('');
  }

  lines.push('## My Investment Plan');
  lines.push(plan);

  return lines.join('\n');
}

export async function refinePlanWithAi(
  apiKey: string,
  data: InvestmentData,
  plan: string,
): Promise<RefinedPlan> {
  const client = new Anthropic({ apiKey });
  const context = buildPlanContext(data, plan);

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a personal investment advisor. I've written my investment plan below, along with my current portfolio data. Please review and refine my plan. Keep my original intent and goals, but:

1. Highlight any risks or blind spots I may have missed
2. Suggest specific improvements with reasoning
3. Add concrete next steps with approximate timelines
4. Flag anything that contradicts my current portfolio position
5. Keep the same markdown format but improve clarity

Return the refined plan as markdown. Keep it practical and actionable — not generic advice. Preserve my personal notes and reasoning where they make sense.

${context}`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  const refined: RefinedPlan = {
    content: text,
    refinedAt: new Date().toISOString(),
  };

  return refined;
}
