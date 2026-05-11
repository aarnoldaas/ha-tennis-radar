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
import {
  api,
  type BrokerKey,
  type MappingsPayload,
  type ResolvedMappingEntry,
  type UnresolvedMappingEntry,
  type YahooVerifyResponse,
} from './api';
import { BROKER_LABEL } from './utils';
import { currencyFmt, money, num } from './format';

interface RowState {
  draft: string;
  saving: boolean;
  verifying: boolean;
  verify: YahooVerifyResponse | null;
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

function rowKey(kind: 'resolved' | 'unresolved', id: string): string {
  return `${kind}::${id}`;
}

export function MappingsTab() {
  const [data, setData] = useState<MappingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.mappings();
      setData(payload);
      // Seed each row's draft with the current Yahoo ticker (if any). Reset
      // any stale verify/error state — fresh data wins.
      const seed: Record<string, RowState> = {};
      for (const r of payload.resolved) {
        seed[rowKey('resolved', r.instrumentId)] = {
          ...EMPTY_ROW,
          draft: r.yahooSymbol ?? '',
        };
      }
      for (const u of payload.unresolved) {
        seed[rowKey('unresolved', `${u.broker}:${u.rawSymbol}`)] = { ...EMPTY_ROW };
      }
      setRows(seed);
    } catch (e: any) {
      setError(e?.message || 'Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = useCallback(
    (key: string, patch: Partial<RowState>) => {
      setRows(prev => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_ROW), ...patch } }));
    },
    [setRows],
  );

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
        updateRow(key, {
          verifying: false,
          verify: null,
          error: e?.message || 'Verify failed',
        });
      }
    },
    [updateRow],
  );

  const saveResolved = useCallback(
    async (entry: ResolvedMappingEntry) => {
      const key = rowKey('resolved', entry.instrumentId);
      const draft = rows[key]?.draft ?? '';
      updateRow(key, { saving: true, error: null, flash: null });
      try {
        const res = await api.saveResolvedMapping(
          entry.instrumentId,
          draft.trim() ? draft.trim() : null,
        );
        if (!res.ok) {
          updateRow(key, { saving: false, error: res.error || 'Save failed' });
          return;
        }
        updateRow(key, { saving: false, flash: 'saved' });
        await load();
      } catch (e: any) {
        updateRow(key, { saving: false, error: e?.message || 'Save failed' });
      }
    },
    [load, rows, updateRow],
  );

  const saveUnresolved = useCallback(
    async (entry: UnresolvedMappingEntry) => {
      const key = rowKey('unresolved', `${entry.broker}:${entry.rawSymbol}`);
      const draft = rows[key]?.draft?.trim() ?? '';
      if (!draft) {
        updateRow(key, { error: 'Enter a Yahoo ticker first' });
        return;
      }
      updateRow(key, { saving: true, error: null, flash: null });
      try {
        const verifyHint = rows[key]?.verify ?? null;
        const res = await api.saveUnresolvedMapping(entry.broker, entry.rawSymbol, draft, {
          name: verifyHint?.longName || verifyHint?.shortName || undefined,
          currency: verifyHint?.currency || undefined,
        });
        if (!res.ok) {
          updateRow(key, { saving: false, error: res.error || 'Save failed' });
          return;
        }
        updateRow(key, { saving: false, flash: 'saved' });
        await load();
      } catch (e: any) {
        updateRow(key, { saving: false, error: e?.message || 'Save failed' });
      }
    },
    [load, rows, updateRow],
  );

  const counts = useMemo(() => {
    if (!data) return { total: 0, missing: 0, unresolved: 0 };
    return {
      total: data.resolved.length + data.unresolved.length,
      missing: data.resolved.filter(r => !r.yahooSymbol).length + data.unresolved.length,
      unresolved: data.unresolved.length,
    };
  }, [data]);

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }
  if (error) {
    return (
      <Alert color="red" title="Unable to load mappings">
        {error}
      </Alert>
    );
  }
  if (!data) return null;

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <div>
            <Text size="sm" fw={600} mb={2}>
              Yahoo ticker mappings
            </Text>
            <Text size="xs" c="dimmed">
              Each row maps a portfolio entry to a Yahoo Finance symbol so it can be priced.
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
            {counts.unresolved > 0 && (
              <Badge size="sm" color="red" variant="light">
                {counts.unresolved} unresolved
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
                <Table.Th>Entry</Table.Th>
                <Table.Th>Brokers</Table.Th>
                <Table.Th ta="right">Qty</Table.Th>
                <Table.Th ta="right">Market value</Table.Th>
                <Table.Th>Yahoo ticker</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.resolved.map(r => (
                <ResolvedRow
                  key={r.instrumentId}
                  entry={r}
                  state={rows[rowKey('resolved', r.instrumentId)] ?? EMPTY_ROW}
                  onChange={draft =>
                    updateRow(rowKey('resolved', r.instrumentId), {
                      draft,
                      verify: null,
                      error: null,
                      flash: null,
                    })
                  }
                  onVerify={() =>
                    verify(
                      rowKey('resolved', r.instrumentId),
                      rows[rowKey('resolved', r.instrumentId)]?.draft ?? '',
                    )
                  }
                  onSave={() => saveResolved(r)}
                />
              ))}
              {data.unresolved.map(u => (
                <UnresolvedRow
                  key={`${u.broker}:${u.rawSymbol}`}
                  entry={u}
                  state={rows[rowKey('unresolved', `${u.broker}:${u.rawSymbol}`)] ?? EMPTY_ROW}
                  onChange={draft =>
                    updateRow(rowKey('unresolved', `${u.broker}:${u.rawSymbol}`), {
                      draft,
                      verify: null,
                      error: null,
                      flash: null,
                    })
                  }
                  onVerify={() =>
                    verify(
                      rowKey('unresolved', `${u.broker}:${u.rawSymbol}`),
                      rows[rowKey('unresolved', `${u.broker}:${u.rawSymbol}`)]?.draft ?? '',
                    )
                  }
                  onSave={() => saveUnresolved(u)}
                />
              ))}
              {data.resolved.length === 0 && data.unresolved.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      Nothing to map yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function ResolvedRow({
  entry,
  state,
  onChange,
  onVerify,
  onSave,
}: {
  entry: ResolvedMappingEntry;
  state: RowState;
  onChange: (v: string) => void;
  onVerify: () => void;
  onSave: () => void;
}) {
  const dirty = (state.draft || '') !== (entry.yahooSymbol || '');
  // Surface non-Yahoo price providers as a read-only badge so the user
  // realises why their edit might not "stick" the way they expect.
  const nonYahooSource =
    entry.priceProvider && entry.priceProvider !== 'yahoo' ? entry.priceProvider : null;

  const brokerBadges = (
    <Group gap={4} wrap="wrap">
      {entry.aliases.length === 0 ? (
        <Text size="xs" c="dimmed">
          —
        </Text>
      ) : (
        entry.aliases.map((a, i) => (
          <Badge key={`${a.broker}:${a.rawSymbol}:${i}`} size="xs" variant="default">
            {BROKER_LABEL[a.broker] ?? a.broker}: {a.rawSymbol}
          </Badge>
        ))
      )}
    </Group>
  );

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} className="lh-mono">
            {entry.instrumentId}
          </Text>
          {entry.hasOpenPosition && (
            <Badge size="xs" color="yellow" variant="light">
              open
            </Badge>
          )}
          {!entry.yahooSymbol && (
            <Badge size="xs" color="orange" variant="light">
              no ticker
            </Badge>
          )}
          {nonYahooSource && (
            <Badge size="xs" variant="default" color="gray">
              src: {nonYahooSource}
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {entry.name}
          {entry.isin ? ` · ${entry.isin}` : ''} · {entry.assetClass} · {entry.currency}
        </Text>
      </Table.Td>
      <Table.Td>{brokerBadges}</Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {entry.quantity ? num(entry.quantity) : <Text size="xs" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td ta="right" className="lh-mono">
        {entry.marketValueBase != null ? (
          money(entry.marketValueBase)
        ) : entry.marketPrice != null ? (
          <Text size="xs" c="dimmed">
            {currencyFmt(entry.marketPrice, entry.currency)}
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            —
          </Text>
        )}
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
          saveLabel={entry.yahooSymbol && !state.draft.trim() ? 'Clear' : 'Save'}
        />
      </Table.Td>
    </Table.Tr>
  );
}

function UnresolvedRow({
  entry,
  state,
  onChange,
  onVerify,
  onSave,
}: {
  entry: UnresolvedMappingEntry;
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
            unresolved
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {entry.count} transaction{entry.count === 1 ? '' : 's'}
          {entry.isin ? ` · ${entry.isin}` : ''}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge size="xs" variant="default">
          {BROKER_LABEL[entry.broker as BrokerKey] ?? entry.broker}: {entry.rawSymbol}
        </Badge>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="xs" c="dimmed">
          —
        </Text>
      </Table.Td>
      <Table.Td ta="right">
        <Text size="xs" c="dimmed">
          —
        </Text>
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
          saveLabel="Save"
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
        {label}{label ? ' · ' : ''}
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
