import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import type {
  Holding,
  Instrument,
  Portfolio,
  UnmappedSymbol,
  YahooVerifyResult,
} from '../../shared/types';
import { api } from '../lib/api';
import { brokerLabel } from '../lib/utils';
import { currencyFmt, money, num } from '../lib/format';

interface RowState {
  draft: string;
  saving: boolean;
  verifying: boolean;
  verify: YahooVerifyResult | null;
  error: string | null;
  flash: 'saved' | null;
}

const EMPTY_ROW: RowState = {
  draft: '',
  saving: false,
  verifying: false,
  verify: null,
  error: null,
  flash: null,
};

export function InstrumentsTab({ onChanged }: { onChanged: () => void }) {
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [inst, port] = await Promise.all([api.instruments(), api.portfolio()]);
      setInstruments(inst);
      setPortfolio(port);
      const seed: Record<string, RowState> = {};
      for (const i of inst) {
        seed[`inst::${i.id}`] = { ...EMPTY_ROW, draft: i.yahooSymbol ?? '' };
      }
      for (const u of port.unmapped) {
        seed[`unmapped::${u.broker}:${u.rawSymbol}`] = { ...EMPTY_ROW };
      }
      setRows(seed);
    } catch (e: any) {
      setError(e?.message || 'Failed to load instruments');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_ROW), ...patch } }));
  }, []);

  const verify = useCallback(
    async (key: string, symbol: string) => {
      const trimmed = symbol.trim();
      if (!trimmed) {
        updateRow(key, { error: 'Enter a symbol first', verify: null });
        return;
      }
      updateRow(key, { verifying: true, error: null, verify: null });
      try {
        const result = await api.verifyYahoo(trimmed);
        if (!result.ok) {
          updateRow(key, {
            verifying: false,
            verify: null,
            error: result.error || 'Symbol not found on Yahoo',
          });
        } else {
          updateRow(key, { verifying: false, verify: result, error: null });
        }
      } catch (e: any) {
        updateRow(key, { verifying: false, verify: null, error: e?.message || 'Verify failed' });
      }
    },
    [updateRow],
  );

  const saveInstrument = useCallback(
    async (instrument: Instrument) => {
      const key = `inst::${instrument.id}`;
      const draft = rows[key]?.draft?.trim() ?? '';
      updateRow(key, { saving: true, error: null, flash: null });
      try {
        const res = await api.updateInstrument(instrument.id, { yahooSymbol: draft || null });
        if (!res.ok) {
          updateRow(key, { saving: false, error: res.error || 'Save failed' });
          return;
        }
        updateRow(key, { saving: false, flash: 'saved' });
        await load();
        onChanged();
      } catch (e: any) {
        updateRow(key, { saving: false, error: e?.message || 'Save failed' });
      }
    },
    [load, onChanged, rows, updateRow],
  );

  const promoteUnmapped = useCallback(
    async (entry: UnmappedSymbol) => {
      const key = `unmapped::${entry.broker}:${entry.rawSymbol}`;
      const draft = rows[key]?.draft?.trim() ?? '';
      if (!draft) {
        updateRow(key, { error: 'Enter a Yahoo ticker first' });
        return;
      }
      updateRow(key, { saving: true, error: null, flash: null });
      try {
        const hint = rows[key]?.verify ?? null;
        const res = await api.createInstrument({
          broker: entry.broker,
          rawSymbol: entry.rawSymbol,
          yahooSymbol: draft,
          name: hint?.longName || hint?.shortName || undefined,
          currency: hint?.currency || undefined,
        });
        if (!res.ok) {
          updateRow(key, { saving: false, error: res.error || 'Save failed' });
          return;
        }
        updateRow(key, { saving: false, flash: 'saved' });
        await load();
        onChanged();
      } catch (e: any) {
        updateRow(key, { saving: false, error: e?.message || 'Save failed' });
      }
    },
    [load, onChanged, rows, updateRow],
  );

  const holdingById = useMemo(() => {
    const map = new Map<string, Holding>();
    for (const h of portfolio?.holdings ?? []) map.set(h.instrumentId, h);
    return map;
  }, [portfolio]);

  const sortedInstruments = useMemo(() => {
    if (!instruments) return [];
    return [...instruments].sort((a, b) => {
      const aOpen = holdingById.has(a.id);
      const bOpen = holdingById.has(b.id);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [instruments, holdingById]);

  const counts = useMemo(() => {
    const missing = (instruments ?? []).filter(i => !i.yahooSymbol).length;
    const unmapped = portfolio?.unmapped.length ?? 0;
    return {
      total: (instruments?.length ?? 0) + unmapped,
      missing: missing + unmapped,
      unmapped,
    };
  }, [instruments, portfolio]);

  if (error) {
    return (
      <Alert color="red" title="Unable to load instruments">
        {error}
      </Alert>
    );
  }
  if (!instruments || !portfolio) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <div>
            <Text size="sm" fw={600} mb={2}>
              Instrument master
            </Text>
            <Text size="xs" c="dimmed">
              Each row maps broker symbols to one instrument and its Yahoo ticker for pricing.
              Edits write to <code>/data/instruments.yaml</code> and rebuild the portfolio
              immediately.
            </Text>
          </div>
          <Group gap={6}>
            <Badge size="sm" variant="default">{counts.total} total</Badge>
            {counts.missing > 0 && (
              <Badge size="sm" color="orange" variant="light">
                {counts.missing} missing ticker{counts.missing === 1 ? '' : 's'}
              </Badge>
            )}
            {counts.unmapped > 0 && (
              <Badge size="sm" color="red" variant="light">
                {counts.unmapped} unmapped
              </Badge>
            )}
          </Group>
        </Group>
      </Card>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={960}>
          <Table withRowBorders={false} verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Instrument</Table.Th>
                <Table.Th>Broker symbols</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Value (€)</Table.Th>
                <Table.Th>Yahoo ticker</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {portfolio.unmapped.map(u => {
                const key = `unmapped::${u.broker}:${u.rawSymbol}`;
                return (
                  <UnmappedRow
                    key={key}
                    entry={u}
                    state={rows[key] ?? EMPTY_ROW}
                    onChange={draft => updateRow(key, { draft, verify: null, error: null, flash: null })}
                    onVerify={() => verify(key, rows[key]?.draft ?? '')}
                    onSave={() => promoteUnmapped(u)}
                  />
                );
              })}
              {sortedInstruments.map(i => {
                const key = `inst::${i.id}`;
                return (
                  <InstrumentRow
                    key={i.id}
                    instrument={i}
                    holding={holdingById.get(i.id) ?? null}
                    state={rows[key] ?? EMPTY_ROW}
                    onChange={draft => updateRow(key, { draft, verify: null, error: null, flash: null })}
                    onVerify={() => verify(key, rows[key]?.draft ?? '')}
                    onSave={() => saveInstrument(i)}
                  />
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function InstrumentRow({
  instrument,
  holding,
  state,
  onChange,
  onVerify,
  onSave,
}: {
  instrument: Instrument;
  holding: Holding | null;
  state: RowState;
  onChange: (v: string) => void;
  onVerify: () => void;
  onSave: () => void;
}) {
  const dirty = (state.draft || '') !== (instrument.yahooSymbol || '');

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} className="lh-mono">
            {instrument.symbol}
          </Text>
          {holding && (
            <Badge size="xs" color="yellow" variant="light">
              open
            </Badge>
          )}
          {!instrument.yahooSymbol && (
            <Badge size="xs" color="orange" variant="light">
              no ticker
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {instrument.name}
          {instrument.isin ? ` · ${instrument.isin}` : ''} · {instrument.assetClass} ·{' '}
          {instrument.currency}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={4} wrap="wrap">
          {Object.entries(instrument.aliases).flatMap(([broker, aliases]) =>
            (aliases ?? []).map(alias => (
              <Badge key={`${broker}:${alias}`} size="xs" variant="default">
                {brokerLabel(broker)}: {alias}
              </Badge>
            )),
          )}
        </Group>
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {holding ? num(holding.quantity) : <Text size="xs" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {holding ? money(holding.valueEur) : <Text size="xs" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td>
        <TickerEditor state={state} onChange={onChange} placeholder="e.g. IGN1L.VS" />
        <VerifyHint state={state} />
      </Table.Td>
      <Table.Td ta="right">
        <ActionButtons
          state={state}
          dirty={dirty}
          onVerify={onVerify}
          onSave={onSave}
          saveLabel={instrument.yahooSymbol && !state.draft.trim() ? 'Clear' : 'Save'}
        />
      </Table.Td>
    </Table.Tr>
  );
}

function UnmappedRow({
  entry,
  state,
  onChange,
  onVerify,
  onSave,
}: {
  entry: UnmappedSymbol;
  state: RowState;
  onChange: (v: string) => void;
  onVerify: () => void;
  onSave: () => void;
}) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} className="lh-mono">
            {entry.rawSymbol}
          </Text>
          <Badge size="xs" color="red" variant="light">
            unmapped
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {entry.count} transaction{entry.count === 1 ? '' : 's'}
          {entry.isin ? ` · ${entry.isin}` : ''}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge size="xs" variant="default">
          {brokerLabel(entry.broker)}: {entry.rawSymbol}
        </Badge>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="xs" c="dimmed">—</Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="xs" c="dimmed">—</Text>
      </Table.Td>
      <Table.Td>
        <TickerEditor state={state} onChange={onChange} placeholder="e.g. AAPL or BMW.DE" />
        <VerifyHint state={state} />
      </Table.Td>
      <Table.Td ta="right">
        <ActionButtons
          state={state}
          dirty={!!state.draft.trim()}
          onVerify={onVerify}
          onSave={onSave}
          saveLabel="Create"
        />
      </Table.Td>
    </Table.Tr>
  );
}

function TickerEditor({
  state,
  onChange,
  placeholder,
}: {
  state: RowState;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      size="xs"
      value={state.draft}
      onChange={e => onChange(e.currentTarget.value)}
      placeholder={placeholder}
      classNames={{ input: 'lh-mono' }}
      style={{ minWidth: 160 }}
      disabled={state.saving}
    />
  );
}

function VerifyHint({ state }: { state: RowState }) {
  if (state.error) {
    return (
      <Text size="xs" c="red" mt={4}>
        {state.error}
      </Text>
    );
  }
  if (state.verify?.ok) {
    const label = state.verify.longName || state.verify.shortName || state.verify.symbol;
    return (
      <Text size="xs" c="teal" mt={4}>
        {label}
        {label ? ' · ' : ''}
        {currencyFmt(state.verify.price ?? null, state.verify.currency ?? 'USD')}
        {state.verify.exchangeName ? ` · ${state.verify.exchangeName}` : ''}
      </Text>
    );
  }
  if (state.flash === 'saved') {
    return (
      <Text size="xs" c="teal" mt={4}>
        Saved.
      </Text>
    );
  }
  return null;
}

function ActionButtons({
  state,
  dirty,
  onVerify,
  onSave,
  saveLabel,
}: {
  state: RowState;
  dirty: boolean;
  onVerify: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      <Button
        size="compact-xs"
        variant="default"
        onClick={onVerify}
        loading={state.verifying}
        disabled={state.saving}
      >
        Verify
      </Button>
      <Button
        size="compact-xs"
        variant="filled"
        onClick={onSave}
        loading={state.saving}
        disabled={!dirty || state.verifying}
      >
        {saveLabel}
      </Button>
    </Group>
  );
}
