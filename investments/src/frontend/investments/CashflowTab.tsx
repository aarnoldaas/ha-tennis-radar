import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { api, type BrokerKey, type Transaction } from "./api";
import { BROKER_LABEL, BROKERS } from "./utils";
import { money, signedMoney } from "./format";

type BrokerFilter = BrokerKey | "all";

type CashflowKind = "deposit" | "withdrawal" | "dividend";

// Per-broker account identity used when exporting cashflow rows in the
// Lithuanian GPM311 investicinė-sąskaita import format. The importer
// only validates the five required columns (saskaita / rusis / data /
// suma / valstybe), so we keep the value set narrow: the brokerage
// account number and the ISO country code. Institution name is
// intentionally _not_ exported — it's not in the required schema, and
// the previous mixed-case `IstaigosKodas` column was the source of
// CSV-quoting bugs that broke structural validation.
const BROKER_ACCOUNT_INFO: Record<
  BrokerKey,
  { saskaita: string; valstybe: string }
> = {
  swedbank: {
    saskaita: "LT977300010172883835",
    valstybe: "LT",
  },
  "interactive-brokers": {
    saskaita: "U17250741",
    valstybe: "IE",
  },
};

// Lithuanian GPM311 investicinė-sąskaita `rusis` codes:
// - II = įmokos (deposit / contribution)
// - PP = piniginis paėmimas (withdrawal)
// - IV = investicijų vaisiai (dividends, interest, etc.)
// The importer rejects KS / KG / KL / IB / PT / PU / PI codes; none of
// our mapped values fall into the excluded set.
const RUSIS_BY_KIND: Record<CashflowKind, "II" | "PP" | "IV"> = {
  deposit: "II",
  withdrawal: "PP",
  dividend: "IV",
};

const KIND_PALETTE: Record<CashflowKind, { label: string; color: string }> = {
  deposit: { label: "Deposit", color: "teal" },
  withdrawal: { label: "Withdrawal", color: "red" },
  dividend: { label: "Dividend", color: "cyan" },
};

/**
 * Cashflow tab — lists external cash flows on the brokerage accounts:
 * `deposit` / `withdrawal` (IB `Deposit`/`Withdrawal` rows; Swedbank
 * "Pervedimas tarp savo sąskaitų" rows) plus `dividend` payouts. The
 * system does not track running cash balances — this view is a
 * contribution + payout log so the user can see "money I put in, money
 * I took out, dividends I received". The list also feeds the Lithuanian
 * GPM311 investicinė-sąskaita CSV export — five required columns only
 * (saskaita / rusis / data / suma / valstybe), UTF-8, with II / PP / IV
 * `rusis` codes for deposits / withdrawals / dividends.
 */
export function CashflowTab() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<BrokerFilter>("all");
  const [year, setYear] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    api
      .transactions()
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load cashflow");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cashflows = useMemo(
    () =>
      (transactions ?? []).filter(
        (t) =>
          t.kind === "deposit" ||
          t.kind === "withdrawal" ||
          t.kind === "dividend",
      ),
    [transactions],
  );

  const years = useMemo(() => {
    const ys = new Set<string>();
    for (const t of cashflows) ys.add(t.timestamp.slice(0, 4));
    return [...ys].sort((a, b) => b.localeCompare(a));
  }, [cashflows]);

  const filtered = useMemo(() => {
    return cashflows.filter((t) => {
      if (broker !== "all" && t.broker !== broker) return false;
      if (year !== "all" && !t.timestamp.startsWith(year)) return false;
      return true;
    });
  }, [cashflows, broker, year]);

  const totals = useMemo(() => {
    let deposited = 0;
    let withdrawn = 0;
    let dividends = 0;
    let depositCount = 0;
    let withdrawalCount = 0;
    let dividendCount = 0;
    for (const t of filtered) {
      // Deposits and dividends arrive with positive `amount`,
      // withdrawals with negative `amount`. We surface them as absolute
      // magnitudes per side and a signed net contribution.
      if (t.kind === "deposit") {
        deposited += t.amount;
        depositCount += 1;
      } else if (t.kind === "withdrawal") {
        withdrawn += Math.abs(t.amount);
        withdrawalCount += 1;
      } else {
        dividends += t.amount;
        dividendCount += 1;
      }
    }
    return {
      deposited,
      withdrawn,
      dividends,
      // Net contribution is contribution-only; dividend income is a
      // separate KPI so it doesn't get mixed into "money I put in".
      net: deposited - withdrawn,
      depositCount,
      withdrawalCount,
      dividendCount,
    };
  }, [filtered]);

  const handleExport = () => {
    const csv = buildCashflowCsv(filtered);
    const filename = `cashflow-${broker}-${year}.csv`;
    downloadCsv(csv, filename);
  };

  if (error) {
    return (
      <Alert color="red" title="Unable to load cashflow">
        {error}
      </Alert>
    );
  }
  if (!transactions) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
        <Kpi
          label="Deposited"
          value={money(totals.deposited)}
          sub={`${totals.depositCount} transfer${totals.depositCount === 1 ? "" : "s"} in`}
          color="teal"
        />
        <Kpi
          label="Withdrawn"
          value={money(totals.withdrawn)}
          sub={`${totals.withdrawalCount} transfer${totals.withdrawalCount === 1 ? "" : "s"} out`}
          color="red"
        />
        <Kpi
          label="Dividends"
          value={money(totals.dividends)}
          sub={`${totals.dividendCount} payout${totals.dividendCount === 1 ? "" : "s"}`}
          color="cyan"
        />
        <Kpi
          label="Net contribution"
          value={signedMoney(totals.net)}
          sub="Deposited − withdrawn"
          color={totals.net >= 0 ? "teal" : "red"}
        />
      </SimpleGrid>

      <Card padding="md" withBorder>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={broker}
              onChange={(v) => setBroker(v as BrokerFilter)}
              data={[
                { value: "all", label: "All brokers" },
                ...BROKERS.map((b) => ({ value: b.value, label: b.label })),
              ]}
            />
            <Select
              size="xs"
              value={year}
              onChange={(v) => v && setYear(v)}
              data={[
                { value: "all", label: "All years" },
                ...years.map((y) => ({ value: y, label: y })),
              ]}
              w={120}
              allowDeselect={false}
            />
          </Group>
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              {filtered.length} of {cashflows.length} transfers
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              Download CSV
            </Button>
          </Group>
        </Group>
      </Card>

      <Card padding={0} withBorder>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover withRowBorders={false} verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Broker</Table.Th>
                <Table.Th>Direction</Table.Th>
                <Table.Th ta="right">Amount</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No deposits, withdrawals, or dividends match these
                      filters.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {filtered.map((t) => {
                const palette = KIND_PALETTE[t.kind as CashflowKind];
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td className="lh-mono">{t.timestamp}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="dot" color="yellow">
                        {BROKER_LABEL[t.broker] ?? t.broker}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light" color={palette.color}>
                        {palette.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" className="lh-mono" c={palette.color}>
                      {signedMoney(t.amount, { precise: true })}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" lineClamp={1} maw={360}>
                        {t.notes ?? ""}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}

function buildCashflowCsv(rows: Transaction[]): string {
  // Header names match the GPM311 investicinė-sąskaita importer spec
  // exactly (lowercase). Only the five required columns are emitted —
  // adding optional columns risks tripping case-sensitive structural
  // validation, and the previous `IstaigosKodas` column carried the
  // only field whose value needed CSV quoting.
  const header = "saskaita,rusis,data,suma,valstybe";
  const lines: string[] = [header];
  // Sort by date ascending so rows read chronologically. The
  // CashflowTab renders newest-first via the API, so we copy first.
  const sorted = [...rows].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  for (const t of sorted) {
    const acct = BROKER_ACCOUNT_INFO[t.broker];
    const rusis = RUSIS_BY_KIND[t.kind as CashflowKind];
    if (!acct || !rusis) continue;
    lines.push(
      [
        acct.saskaita,
        rusis,
        t.timestamp.slice(0, 10),
        Math.abs(t.amount).toFixed(2),
        acct.valstybe,
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Kpi({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card padding="sm" withBorder radius="md">
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700} className="lh-mono" c={color} mt={2}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed" mt={2}>
          {sub}
        </Text>
      )}
    </Card>
  );
}
