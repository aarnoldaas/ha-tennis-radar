import { describe, it, expect } from 'vitest';
import { parseIBFile, classifyIBTransactions } from '../ib-parser.js';
import type { IBParsedStatement } from '../types.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Helper: create a minimal IB Activity Statement CSV
function makeCSV(sections: string[]): string {
  return sections.join('\n');
}

function makeTmpFile(content: string): string {
  const dir = join(tmpdir(), `ib-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, 'test.csv');
  writeFileSync(filePath, content);
  return filePath;
}

const MINIMAL_HEADER = [
  'Statement,Header,Field Name,Field Value',
  'Statement,Data,BrokerName,Interactive Brokers',
  'Statement,Data,Period,"January 1, 2025 - December 31, 2025"',
  'Account Information,Header,Field Name,Field Value',
  'Account Information,Data,Account,U12345',
  'Account Information,Data,Base Currency,EUR',
].join('\n');

describe('parseIBFile', () => {
  it('parses account info', async () => {
    const path = makeTmpFile(MINIMAL_HEADER);
    const stmt = await parseIBFile(path);
    expect(stmt.accountId).toBe('U12345');
    expect(stmt.baseCurrency).toBe('EUR');
    expect(stmt.period).toContain('2025');
  });

  it('parses stock trades and skips forex', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
      'Trades,Data,Order,Stocks,EUR,ASML,"2025-04-16, 11:07:04",3,569.6,574,-1708.8,-3,1711.8,0,13.2,IA;O',
      'Trades,Data,Order,Stocks,USD,BABA,"2025-10-03, 09:32:33",10,190.12,188.03,-1901.2,-1.00022,1902.20022,0,-20.9,O',
      'Trades,SubTotal,,Stocks,EUR,ASML,,3,,,-1708.8,-3,1711.8,0,13.2,',
      'Trades,Total,,Stocks,EUR,,,,,,-1708.8,-3,1711.8,0,13.2,',
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,,Proceeds,Comm in EUR,,,MTM in EUR,Code',
      'Trades,Data,Order,Forex,USD,EUR.USD,"2025-02-18, 04:12:44",2.08,1.04622,,-2.1761376,0,,,-0.003282,AFx',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);

    // Should have 2 stock trades, no forex
    expect(stmt.trades).toHaveLength(2);
    expect(stmt.trades[0].symbol).toBe('ASML');
    expect(stmt.trades[0].quantity).toBe(3);
    expect(stmt.trades[0].tradePrice).toBe(569.6);
    expect(stmt.trades[0].commFee).toBe(-3);
    expect(stmt.trades[1].symbol).toBe('BABA');
  });

  it('handles quoted quantities with commas', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
      'Trades,Data,Order,Stocks,EUR,TEL1L,"2026-01-28, 03:10:57","-4,000",2.06,2.1,8240,-16.48,-6833.64,1389.88,-160,C;P',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);
    expect(stmt.trades[0].quantity).toBe(-4000);
    expect(stmt.trades[0].symbol).toBe('TEL1L');
  });

  it('parses dividends and skips totals', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Dividends,Header,Currency,Date,Description,Amount',
      'Dividends,Data,EUR,2026-02-18,ASML(NL0010273215) Cash Dividend EUR 1.60 per Share (Ordinary Dividend),14.4',
      'Dividends,Data,Total,,,14.4',
      'Dividends,Data,USD,2026-03-16,GOOG(US02079K1079) Cash Dividend USD 0.21 per Share (Ordinary Dividend),2.1',
      'Dividends,Data,Total,,,2.1',
      'Dividends,Data,Total in EUR,,,1.825236',
      'Dividends,Data,Total Dividends in EUR,,,16.225236',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);

    expect(stmt.dividends).toHaveLength(2);
    expect(stmt.dividends[0].currency).toBe('EUR');
    expect(stmt.dividends[0].amount).toBe(14.4);
    expect(stmt.dividends[1].currency).toBe('USD');
    expect(stmt.dividends[1].amount).toBe(2.1);
  });

  it('parses withholding tax', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Withholding Tax,Header,Currency,Date,Description,Amount,Code',
      'Withholding Tax,Data,EUR,2026-02-18,ASML(NL0010273215) Cash Dividend EUR 1.60 per Share - NL Tax,-2.16,',
      'Withholding Tax,Data,Total,,,-2.16,',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);

    expect(stmt.withholdingTax).toHaveLength(1);
    expect(stmt.withholdingTax[0].amount).toBe(-2.16);
  });

  it('parses deposits and withdrawals', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Deposits & Withdrawals,Header,Currency,Settle Date,Description,Amount',
      'Deposits & Withdrawals,Data,EUR,2025-04-02,Electronic Fund Transfer,9500',
      'Deposits & Withdrawals,Data,EUR,2025-07-16,Disbursement Initiated by Arnoldas Sescila,-10900',
      'Deposits & Withdrawals,Data,Total,,,62700',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);

    expect(stmt.deposits).toHaveLength(2);
    expect(stmt.deposits[0].amount).toBe(9500);
    expect(stmt.deposits[1].amount).toBe(-10900);
  });

  it('parses interest (present in 2025, absent in 2026)', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Interest,Header,Currency,Date,Description,Amount',
      'Interest,Data,EUR,2025-07-03,EUR Credit Interest for Jun-2025,11.42',
      'Interest,Data,Total,,,13.7',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);
    expect(stmt.interest).toHaveLength(1);
    expect(stmt.interest[0].amount).toBe(11.42);

    // Absent section → empty array
    const path2 = makeTmpFile(MINIMAL_HEADER);
    const stmt2 = await parseIBFile(path2);
    expect(stmt2.interest).toHaveLength(0);
  });

  it('parses financial instrument information', async () => {
    const csv = makeCSV([
      MINIMAL_HEADER,
      'Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,Security ID,Underlying,Listing Exch,Multiplier,Type,Code',
      'Financial Instrument Information,Data,Stocks,ASML,ASML HOLDING NV,117589399,NL0010273215,ASML,AEB,1,COMMON,',
      'Financial Instrument Information,Data,Stocks,BABA,ALIBABA GROUP HOLDING-SP ADR,166090175,US01609W1027,BABA,NYSE,1,ADR,',
      'Financial Instrument Information,Data,Stocks,"89988, 89988.OLD",ALIBABA GROUP HOLDING LTD,637662651,KYG017191225,89988.OLD,SEHK,1,COMMON,',
    ]);
    const path = makeTmpFile(csv);
    const stmt = await parseIBFile(path);

    expect(stmt.instruments.size).toBe(3);
    expect(stmt.instruments.get('ASML')?.securityId).toBe('NL0010273215');
    expect(stmt.instruments.get('BABA')?.type).toBe('ADR');
    // Multi-symbol entry uses first symbol
    expect(stmt.instruments.get('89988')?.description).toBe('ALIBABA GROUP HOLDING LTD');
  });
});

describe('classifyIBTransactions', () => {
  function makeStmt(overrides: Partial<IBParsedStatement>): IBParsedStatement {
    return {
      accountId: 'U12345',
      baseCurrency: 'EUR',
      period: '2025',
      trades: [],
      dividends: [],
      withholdingTax: [],
      deposits: [],
      interest: [],
      fees: [],
      instruments: new Map(),
      ...overrides,
    };
  }

  it('classifies BUY trade', () => {
    const stmt = makeStmt({
      trades: [{
        currency: 'EUR',
        symbol: 'ASML',
        dateTime: '2025-04-16, 11:07:04',
        quantity: 3,
        tradePrice: 569.6,
        closePrice: 574,
        proceeds: -1708.8,
        commFee: -3,
        basis: 1711.8,
        realizedPnl: 0,
        mtmPnl: 13.2,
        code: 'IA;O',
      }],
      instruments: new Map([['ASML', { symbol: 'ASML', description: 'ASML HOLDING NV', securityId: 'NL0010273215', listingExchange: 'AEB', type: 'COMMON' }]]),
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe('BUY');
    expect(txns[0].symbol).toBe('ASML');
    expect(txns[0].date).toBe('2025-04-16');
    expect(txns[0].quantity).toBe(3);
    expect(txns[0].pricePerUnit).toBe(569.6);
    expect(txns[0].amount).toBe(1708.8);
    expect(txns[0].fees).toBe(3);
    expect(txns[0].description).toContain('ASML HOLDING NV');
    expect(txns[0].id).toMatch(/^ib-trade-ASML-/);
  });

  it('classifies SELL trade', () => {
    const stmt = makeStmt({
      trades: [{
        currency: 'EUR',
        symbol: 'TEL1L',
        dateTime: '2026-01-28, 03:10:57',
        quantity: -4000,
        tradePrice: 2.06,
        closePrice: 2.1,
        proceeds: 8240,
        commFee: -16.48,
        basis: -6833.64,
        realizedPnl: 1389.88,
        mtmPnl: -160,
        code: 'C;P',
      }],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns[0].type).toBe('SELL');
    expect(txns[0].quantity).toBe(-4000);
    expect(txns[0].amount).toBe(8240);
    expect(txns[0].fees).toBe(16.48);
  });

  it('classifies DIVIDEND', () => {
    const stmt = makeStmt({
      dividends: [{
        currency: 'EUR',
        date: '2026-02-18',
        description: 'ASML(NL0010273215) Cash Dividend EUR 1.60 per Share (Ordinary Dividend)',
        amount: 14.4,
      }],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe('DIVIDEND');
    expect(txns[0].symbol).toBe('ASML');
    expect(txns[0].amount).toBe(14.4);
    expect(txns[0].pricePerUnit).toBe(1.6);
  });

  it('classifies TAX from withholding', () => {
    const stmt = makeStmt({
      withholdingTax: [{
        currency: 'EUR',
        date: '2026-02-18',
        description: 'ASML(NL0010273215) Cash Dividend EUR 1.60 per Share - NL Tax',
        amount: -2.16,
        code: '',
      }],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns[0].type).toBe('TAX');
    expect(txns[0].amount).toBe(2.16);
    expect(txns[0].symbol).toBe('ASML');
  });

  it('classifies TRANSFER from deposits', () => {
    const stmt = makeStmt({
      deposits: [{
        currency: 'EUR',
        settleDate: '2025-04-02',
        description: 'Electronic Fund Transfer',
        amount: 9500,
      }],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns[0].type).toBe('TRANSFER');
    expect(txns[0].amount).toBe(9500);
    expect(txns[0].date).toBe('2025-04-02');
  });

  it('classifies INTEREST', () => {
    const stmt = makeStmt({
      interest: [{
        currency: 'EUR',
        date: '2025-07-03',
        description: 'EUR Credit Interest for Jun-2025',
        amount: 11.42,
      }],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns[0].type).toBe('INTEREST');
    expect(txns[0].amount).toBe(11.42);
  });

  it('generates unique IDs for duplicate symbols on same date', () => {
    const stmt = makeStmt({
      trades: [
        { currency: 'EUR', symbol: 'ASML', dateTime: '2025-04-16, 11:00:00', quantity: 3, tradePrice: 569, closePrice: 574, proceeds: -1707, commFee: -3, basis: 1710, realizedPnl: 0, mtmPnl: 0, code: 'O' },
        { currency: 'EUR', symbol: 'ASML', dateTime: '2025-04-16, 14:00:00', quantity: 5, tradePrice: 570, closePrice: 574, proceeds: -2850, commFee: -3, basis: 2853, realizedPnl: 0, mtmPnl: 0, code: 'O' },
      ],
    });

    const txns = classifyIBTransactions([stmt]);
    expect(txns[0].id).toBe('ib-trade-ASML-2025-04-16-1');
    expect(txns[1].id).toBe('ib-trade-ASML-2025-04-16-2');
  });

  it('handles multiple statements', () => {
    const stmt1 = makeStmt({
      trades: [{ currency: 'EUR', symbol: 'ASML', dateTime: '2025-04-16, 11:00:00', quantity: 3, tradePrice: 569, closePrice: 574, proceeds: -1707, commFee: -3, basis: 1710, realizedPnl: 0, mtmPnl: 0, code: 'O' }],
    });
    const stmt2 = makeStmt({
      dividends: [{ currency: 'EUR', date: '2026-02-18', description: 'ASML(NL0010273215) Cash Dividend EUR 1.60 per Share (Ordinary Dividend)', amount: 14.4 }],
    });

    const txns = classifyIBTransactions([stmt1, stmt2]);
    expect(txns).toHaveLength(2);
    expect(txns[0].type).toBe('BUY');
    expect(txns[1].type).toBe('DIVIDEND');
  });
});
