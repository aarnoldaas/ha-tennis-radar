import { useState, useMemo } from 'react';
import { Table, Text, Group, Badge, Stack, TextInput, Select, ScrollArea } from '@mantine/core';
import type { ITransaction, SortDir } from './types';
import { formatNum, pnlColor, TYPE_COLORS } from './utils';
import { SortHeader } from './HoldingsTab';

export function TransactionsTab({ transactions }: { transactions: ITransaction[] }) {
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const types = useMemo(() => {
    const ts = [...new Set(transactions.map(t => t.type))].sort();
    return [{ value: 'all', label: 'All Types' }, ...ts.map(t => ({ value: t, label: t }))];
  }, [transactions]);

  const onSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = transactions;
    if (typeFilter !== 'all') {
      result = result.filter(t => t.type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.broker.toLowerCase().includes(q)
      );
    }
    return result;
  }, [transactions, search, typeFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortField, sortDir]);

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <TextInput
          placeholder="Search symbol, description..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ width: 250 }}
        />
        <Select
          data={types}
          value={typeFilter}
          onChange={(v) => v && setTypeFilter(v)}
          size="xs"
          style={{ width: 160 }}
        />
        {filtered.length !== transactions.length && (
          <Text size="xs" c="dimmed">{filtered.length} of {transactions.length}</Text>
        )}
      </Group>
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
              <Table.Th>Flow</Table.Th>
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
                <Table.Td><Text fw={t.symbol ? 600 : 400}>{t.symbol || '\u2014'}</Text></Table.Td>
                <Table.Td style={{ maxWidth: 300 }}>
                  <Text size="sm" truncate="end">{t.description}</Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {t.quantity !== 0 ? formatNum(t.quantity, Math.abs(t.quantity) % 1 === 0 ? 0 : 4) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {t.pricePerUnit > 0 ? formatNum(t.pricePerUnit) : '\u2014'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {formatNum(t.amount)} {t.currency}
                </Table.Td>
                <Table.Td>
                  {(t.raw as any)?.debitCredit
                    ? <Text size="sm" c={(t.raw as any).debitCredit === 'K' ? '#51cf66' : '#ff6b6b'}>{(t.raw as any).debitCredit === 'K' ? 'In' : 'Out'}</Text>
                    : '\u2014'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
