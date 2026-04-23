import { useState, useEffect, useCallback } from 'react';
import {
  Stack, Text, Group, Button, TextInput, NumberInput, Select,
  Table, ScrollArea, ActionIcon, Card, Alert, Badge, Loader, Center,
} from '@mantine/core';
import { BASE } from './utils';

interface PriceEntry {
  date: string;
  price: number;
  currency: string;
}

type PriceHistory = Record<string, PriceEntry[]>;

export function PriceHistoryTab({ allTickers }: { allTickers: string[] }) {
  const [history, setHistory] = useState<PriceHistory>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [filterTicker, setFilterTicker] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/investments/price-history`)
      .then(r => r.json())
      .then((d: PriceHistory) => { setHistory(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!ticker || !date || price === '' || price === null) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${BASE}/api/investments/price-history/${ticker.toUpperCase()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, price: Number(price) }),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess(`Saved ${ticker.toUpperCase()} on ${date}`);
        setTicker('');
        setDate('');
        setPrice('');
        load();
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sym: string, entryDate: string) => {
    const key = `${sym}:${entryDate}`;
    setDeleting(key);
    setError(null);
    setSuccess(null);
    try {
      await fetch(`${BASE}/api/investments/price-history/${sym}/${entryDate}`, { method: 'DELETE' });
      setSuccess(`Deleted ${sym} on ${entryDate}`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const tickerOptions = Object.keys(history).sort().map(t => ({ value: t, label: t }));
  const allTickerOptions = allTickers.sort().map(t => ({ value: t, label: t }));

  const displayed = filterTicker
    ? { [filterTicker]: history[filterTicker] || [] }
    : history;

  const totalEntries = Object.values(history).reduce((s, arr) => s + arr.length, 0);

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Text size="sm" fw={600} mb="md">Add / Update Price Entry</Text>
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="Ticker"
            placeholder="e.g. WIX"
            data={allTickerOptions}
            value={ticker}
            onChange={v => setTicker(v ?? '')}
            searchable
            clearable
            style={{ minWidth: 120 }}
          />
          <TextInput
            label="Date"
            placeholder="YYYY-MM-DD"
            value={date}
            onChange={e => setDate(e.currentTarget.value)}
            style={{ minWidth: 140 }}
          />
          <NumberInput
            label="Price"
            placeholder="0.00"
            value={price}
            onChange={v => setPrice(v)}
            decimalScale={4}
            style={{ minWidth: 120 }}
          />
          <Button onClick={handleSave} loading={saving} disabled={!ticker || !date || price === '' || price === null}>
            Save
          </Button>
        </Group>
        {error && <Alert color="red" mt="sm" variant="light">{error}</Alert>}
        {success && <Alert color="green" mt="sm" variant="light">{success}</Alert>}
      </Card>

      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Text size="sm" fw={600}>
            File-Based Price History
            <Badge ml="xs" variant="light" size="sm">{Object.keys(history).length} tickers / {totalEntries} entries</Badge>
          </Text>
          <Select
            placeholder="Filter by ticker"
            data={tickerOptions}
            value={filterTicker}
            onChange={setFilterTicker}
            searchable
            clearable
            size="xs"
            style={{ minWidth: 140 }}
          />
        </Group>

        {loading ? (
          <Center py="md"><Loader size="sm" /></Center>
        ) : Object.keys(displayed).length === 0 ? (
          <Text c="dimmed" size="sm">No file-based price history found. Add entries above.</Text>
        ) : (
          <ScrollArea mah={500}>
            <Table striped highlightOnHover withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticker</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Price</Table.Th>
                  <Table.Th>Currency</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(displayed)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .flatMap(([sym, entries]) =>
                    [...entries].reverse().map(entry => (
                      <Table.Tr key={`${sym}:${entry.date}`}>
                        <Table.Td><Badge variant="outline" size="sm">{sym}</Badge></Table.Td>
                        <Table.Td style={{ fontFamily: 'monospace' }}>{entry.date}</Table.Td>
                        <Table.Td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{entry.price.toFixed(2)}</Table.Td>
                        <Table.Td>{entry.currency}</Table.Td>
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="xs"
                            loading={deleting === `${sym}:${entry.date}`}
                            onClick={() => handleDelete(sym, entry.date)}
                          >
                            ×
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Card>
    </Stack>
  );
}
