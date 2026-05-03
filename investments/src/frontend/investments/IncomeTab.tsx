import { useMemo } from 'react';
import { Badge, Card, Group, Stack, Table, Text } from '@mantine/core';
import type { PortfolioSnapshot } from './api';
import { money } from './format';
import { BROKER_LABEL } from './utils';

export function IncomeTab({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const rows = useMemo(() => {
    return [...snapshot.income].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.netBase - a.netBase;
    });
  }, [snapshot.income]);

  const yearly = useMemo(() => {
    const m = new Map<number, { gross: number; tax: number; net: number }>();
    for (const r of rows) {
      const e = m.get(r.year) ?? { gross: 0, tax: 0, net: 0 };
      e.gross += r.grossBase;
      e.tax += r.taxBase;
      e.net += r.netBase;
      m.set(r.year, e);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  const totalNet = rows.reduce((s, r) => s + r.netBase, 0);

  return (
    <Stack gap="md">
      <Card padding="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Text size="sm" fw={600}>
            Income summary (lifetime)
          </Text>
          <Text size="sm" fw={700} className="lh-mono" c="teal">
            Net {money(totalNet)}
          </Text>
        </Group>
        <Group gap="sm" wrap="wrap">
          {yearly.map(([year, totals]) => (
            <Card key={year} padding="sm" withBorder radius="md">
              <Text size="xs" fw={600} c="dimmed">
                {year}
              </Text>
              <Text size="md" fw={700} className="lh-mono" c="teal">
                {money(totals.net)}
              </Text>
              <Text size="xs" c="dimmed">
                gross {money(totals.gross)} · tax {money(totals.tax)}
              </Text>
            </Card>
          ))}
        </Group>
      </Card>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Year</Table.Th>
                <Table.Th>Instrument</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th ta="right">Gross</Table.Th>
                <Table.Th ta="right">Tax</Table.Th>
                <Table.Th ta="right">Net</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No dividend or interest income on file yet.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((r, i) => (
                <Table.Tr key={i}>
                  <Table.Td className="lh-mono">{r.year}</Table.Td>
                  <Table.Td className="lh-mono">{r.symbol}</Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="dot" color="yellow">
                      {BROKER_LABEL[r.broker] ?? r.broker}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light" color={r.kind === 'interest' ? 'cyan' : 'teal'}>
                      {r.kind}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.grossBase)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    {money(r.taxBase)}
                  </Table.Td>
                  <Table.Td ta="right" className="lh-mono">
                    <Text size="sm" fw={600} c="teal">
                      {money(r.netBase)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
