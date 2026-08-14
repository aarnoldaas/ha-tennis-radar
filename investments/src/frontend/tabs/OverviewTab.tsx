import { Alert, Badge, Card, Group, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import type { Portfolio } from '../../shared/types';
import { money, pnlColor, signedMoney, signedPct } from '../lib/format';
import { brokerLabel } from '../lib/utils';

export function OverviewTab({
  portfolio,
  onOpenInstrument,
}: {
  portfolio: Portfolio;
  onOpenInstrument: (id: string) => void;
}) {
  const t = portfolio.totals;
  const top = portfolio.holdings.slice(0, 5);

  return (
    <Stack gap="md">
      {portfolio.unmapped.length > 0 && <UnmappedBanner portfolio={portfolio} />}

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
        <Kpi label="Total value" value={money(t.valueEur)} />
        <Kpi label="Invested" value={money(t.costEur)} dim />
        <Kpi
          label="Unrealized gain"
          value={signedMoney(t.gainEur)}
          sub={signedPct(t.gainPct)}
          color={pnlColor(t.gainEur)}
        />
        <Kpi
          label="Realized YTD"
          value={signedMoney(t.realizedYtdEur)}
          color={pnlColor(t.realizedYtdEur)}
        />
        <Kpi label="Income YTD" value={money(t.incomeYtdEur)} color="teal" />
      </SimpleGrid>

      <Card padding={0} withBorder>
        <Group justify="space-between" p="md" pb={0}>
          <Text size="sm" fw={600}>Top holdings</Text>
          <Text size="xs" c="dimmed">{portfolio.holdings.length} open positions</Text>
        </Group>
        <Table withRowBorders={false} verticalSpacing="sm" highlightOnHover>
          <Table.Tbody>
            {top.map(h => (
              <Table.Tr
                key={h.instrumentId}
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenInstrument(h.instrumentId)}
              >
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600} size="sm" className="lh-mono">{h.symbol}</Text>
                    <Text size="xs" c="dimmed" truncate>{h.name}</Text>
                  </Group>
                </Table.Td>
                <Table.Td ta="right" className="lh-mono">{money(h.valueEur)}</Table.Td>
                <Table.Td ta="right" className="lh-mono" w={140}>
                  {h.priced ? (
                    <Text size="sm" c={pnlColor(h.gainEur)} className="lh-mono">
                      {signedPct(h.gainPct)}
                    </Text>
                  ) : (
                    <Text size="xs" c="dimmed">at cost</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

function UnmappedBanner({ portfolio }: { portfolio: Portfolio }) {
  return (
    <Alert color="yellow" variant="light" title="Unmapped broker symbols">
      <Text size="xs" mb="xs">
        {portfolio.unmapped.length} broker symbol(s) are not in the instrument master.
        Map them on the Instruments tab so their trades count toward holdings.
      </Text>
      <Group gap={4} wrap="wrap">
        {portfolio.unmapped.slice(0, 12).map(u => (
          <Badge key={`${u.broker}:${u.rawSymbol}`} size="xs" variant="light">
            {brokerLabel(u.broker)}: {u.rawSymbol} × {u.count}
          </Badge>
        ))}
        {portfolio.unmapped.length > 12 && (
          <Text size="xs" c="dimmed">+{portfolio.unmapped.length - 12} more</Text>
        )}
      </Group>
    </Alert>
  );
}

function Kpi({
  label,
  value,
  sub,
  color,
  dim,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  dim?: boolean;
}) {
  return (
    <Card padding="sm" withBorder radius="md">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} className="lh-mono" c={dim ? 'dimmed' : color} mt={2}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c={color ?? 'dimmed'} mt={2} className="lh-mono">
          {sub}
        </Text>
      )}
    </Card>
  );
}
