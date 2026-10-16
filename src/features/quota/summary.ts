/**
 * Per-provider aggregate summaries for the quota page header cards.
 *
 * One card per provider answers "how much weekly capacity is left across all
 * my credentials, and when does the next one recover" — e.g. `409% of 500%`
 * for five Claude credentials. Remaining percentages are summed across loaded
 * credentials against a denominator of `credentialCount × 100`.
 *
 * Pure and React-free like logic.ts/resetSchedule.ts: provider states are read
 * structurally (type-only imports), so bun:test consumes this directly.
 *
 * ponytail: only providers with an unambiguous "primary weekly" window get a
 * card (claude/codex/xai/kimi). Antigravity/Devin/Meta have multi-bucket or
 * daily-first shapes — add a picker here when someone actually wants them.
 */

import type {
  ClaudeQuotaState,
  CodexQuotaState,
  KimiQuotaState,
  XaiQuotaState,
} from '@/types';
import type { QuotaProviderType } from './providers/types';
import type { QuotaFileEntry } from './logic';

export interface SummaryCredentialReading {
  /** 0–100 remaining for this credential's window; null = unloaded/missing. */
  remainingPercent: number | null;
  resetAtMs: number | null;
  resetLabel: string | null;
}

export interface SummaryWindowAggregate {
  labelKey: string;
  /** Credentials that contributed a usable percentage. */
  loadedCount: number;
  /** Sum of remaining percentages across loaded credentials. */
  sumRemainingPercent: number;
  /** `credentialCount × 100` — the "of N%" denominator. */
  totalPercent: number;
  /** Per-credential remaining, in entry order; null segments render empty. */
  segments: (number | null)[];
  soonestResetAtMs: number | null;
  /** Provider-formatted absolute label from the soonest credential. */
  soonestResetLabel: string | null;
}

export interface ProviderSummary {
  type: QuotaProviderType;
  credentialCount: number;
  primary: SummaryWindowAggregate;
  /** Claude only: the plain 7-day limit, collapsed behind "Show". */
  secondary: SummaryWindowAggregate | null;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const toRemaining = (usedPercent: number | null | undefined): number | null =>
  typeof usedPercent === 'number' && Number.isFinite(usedPercent)
    ? clampPercent(100 - clampPercent(usedPercent))
    : null;

const usableMs = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const EMPTY_READING: SummaryCredentialReading = {
  remainingPercent: null,
  resetAtMs: null,
  resetLabel: null,
};

/* ---------- per-provider window pickers ---------- */

type StateLike = { status?: string } | undefined;

const pickWindow = (
  state: StateLike,
  windows: Array<{
    id: string;
    usedPercent: number | null;
    resetAtMs?: number | null;
    resetLabel: string;
  }> | undefined,
  windowId: string
): SummaryCredentialReading => {
  if (state?.status !== 'success') return EMPTY_READING;
  const window = windows?.find((item) => item.id === windowId);
  if (!window) return EMPTY_READING;
  return {
    remainingPercent: toRemaining(window.usedPercent),
    resetAtMs: usableMs(window.resetAtMs),
    resetLabel: window.resetLabel || null,
  };
};

const readXai = (state: XaiQuotaState | undefined): SummaryCredentialReading => {
  if (state?.status !== 'success' || !state.billing) return EMPTY_READING;
  const { billing } = state;
  const used = billing.usedPercent ?? billing.usagePercent;
  return {
    remainingPercent: toRemaining(used),
    // Only a weekly period end is capacity coming back; a monthly billing
    // rollover is a spend cap reset (see XaiBillingSummary.resetAtMs).
    resetAtMs: billing.periodType === 'weekly' ? usableMs(billing.resetAtMs) : null,
    resetLabel: null,
  };
};

const KIMI_ROW_PRIORITY = ['kimi_quota.weekly_limit', 'kimi_quota.monthly_limit'];

const readKimi = (state: KimiQuotaState | undefined): SummaryCredentialReading => {
  if (state?.status !== 'success') return EMPTY_READING;
  const rows = state.rows ?? [];
  const row =
    KIMI_ROW_PRIORITY.map((labelKey) => rows.find((item) => item.labelKey === labelKey)).find(
      Boolean
    ) ?? rows.find((item) => item.limit > 0);
  if (!row || !(row.limit > 0)) return EMPTY_READING;
  return {
    remainingPercent: clampPercent(((row.limit - row.used) / row.limit) * 100),
    resetAtMs: usableMs(row.resetAtMs),
    resetLabel: row.resetHint || null,
  };
};

interface SummarySpec {
  labelKey: string;
  read: (state: unknown) => SummaryCredentialReading;
}

const PRIMARY_SPECS: Partial<Record<QuotaProviderType, SummarySpec>> = {
  claude: {
    labelKey: 'claude_quota.seven_day_fable',
    read: (state) => {
      const claude = state as ClaudeQuotaState | undefined;
      return pickWindow(claude, claude?.windows, 'seven-day-fable');
    },
  },
  codex: {
    labelKey: 'codex_quota.secondary_window',
    read: (state) => {
      const codex = state as CodexQuotaState | undefined;
      return pickWindow(codex, codex?.windows, 'weekly');
    },
  },
  xai: {
    labelKey: 'xai_quota.weekly_limit',
    read: (state) => readXai(state as XaiQuotaState | undefined),
  },
  kimi: {
    labelKey: 'kimi_quota.weekly_limit',
    read: (state) => readKimi(state as KimiQuotaState | undefined),
  },
};

const CLAUDE_SECONDARY_SPEC: SummarySpec = {
  labelKey: 'claude_quota.seven_day',
  read: (state) => {
    const claude = state as ClaudeQuotaState | undefined;
    return pickWindow(claude, claude?.windows, 'seven-day');
  },
};

/* ---------- aggregation ---------- */

function aggregate(
  spec: SummarySpec,
  states: unknown[]
): SummaryWindowAggregate {
  const readings = states.map(spec.read);
  const loaded = readings.filter(
    (reading): reading is SummaryCredentialReading & { remainingPercent: number } =>
      reading.remainingPercent !== null
  );
  const soonest = readings
    .filter((reading) => reading.resetAtMs !== null)
    .reduce<SummaryCredentialReading | null>(
      (best, reading) =>
        best === null || (reading.resetAtMs as number) < (best.resetAtMs as number)
          ? reading
          : best,
      null
    );
  return {
    labelKey: spec.labelKey,
    loadedCount: loaded.length,
    sumRemainingPercent: loaded.reduce((sum, reading) => sum + reading.remainingPercent, 0),
    totalPercent: states.length * 100,
    segments: readings.map((reading) => reading.remainingPercent),
    soonestResetAtMs: soonest?.resetAtMs ?? null,
    soonestResetLabel: soonest?.resetLabel ?? null,
  };
}

/**
 * Build one summary per supported provider that has at least one credential.
 * Entries arrive already grouped by QUOTA_TAB_ORDER (classifyQuotaFiles), so
 * card order follows tab order for free.
 */
export function buildProviderSummaries(
  entries: QuotaFileEntry[],
  getQuotaState: (entry: QuotaFileEntry) => unknown
): ProviderSummary[] {
  const byType = new Map<QuotaProviderType, QuotaFileEntry[]>();
  for (const entry of entries) {
    if (!PRIMARY_SPECS[entry.type]) continue;
    const bucket = byType.get(entry.type);
    if (bucket) bucket.push(entry);
    else byType.set(entry.type, [entry]);
  }

  return [...byType.entries()].map(([type, group]) => {
    const states = group.map(getQuotaState);
    return {
      type,
      credentialCount: group.length,
      primary: aggregate(PRIMARY_SPECS[type] as SummarySpec, states),
      secondary: type === 'claude' ? aggregate(CLAUDE_SECONDARY_SPEC, states) : null,
    };
  });
}
