import { describe, expect, test } from 'bun:test';
import type { QuotaFileEntry } from '@/features/quota/logic';
import { buildProviderSummaries } from '@/features/quota/summary';
import type { AuthFileItem, ClaudeQuotaState, CodexQuotaState, XaiQuotaState } from '@/types';

const entry = (name: string, type: QuotaFileEntry['type']): QuotaFileEntry => ({
  file: { name } as AuthFileItem,
  type,
});

const claudeState = (
  fableUsed: number | null,
  sevenDayUsed: number | null,
  resetAtMs: number | null
): ClaudeQuotaState => ({
  status: 'success',
  windows: [
    {
      id: 'seven-day-fable',
      label: '7-day Fable 5',
      usedPercent: fableUsed,
      resetLabel: '09/12, 23:00',
      resetAtMs,
    },
    {
      id: 'seven-day',
      label: '7-day limit',
      usedPercent: sevenDayUsed,
      resetLabel: '09/12, 23:00',
      resetAtMs,
    },
  ],
});

const codexState = (weeklyUsed: number, resetAtMs: number): CodexQuotaState => ({
  status: 'success',
  windows: [
    { id: 'five-hour', label: '5-hour limit', usedPercent: 10, resetLabel: '', resetAtMs: null },
    { id: 'weekly', label: 'Weekly limit', usedPercent: weeklyUsed, resetLabel: '09/14', resetAtMs },
  ],
});

describe('buildProviderSummaries', () => {
  test('sums remaining percentages against credentialCount × 100', () => {
    const entries = [
      entry('claude-a.json', 'claude'),
      entry('claude-b.json', 'claude'),
      entry('claude-c.json', 'claude'),
    ];
    const states: Record<string, ClaudeQuotaState> = {
      'claude-a.json': claudeState(42, 21, 2000),
      'claude-b.json': claudeState(0, 0, 1000),
      'claude-c.json': claudeState(49, 25, 3000),
    };
    const [summary] = buildProviderSummaries(entries, (e) => states[e.file.name]);

    expect(summary.type).toBe('claude');
    expect(summary.credentialCount).toBe(3);
    expect(summary.primary.labelKey).toBe('claude_quota.seven_day_fable');
    expect(summary.primary.sumRemainingPercent).toBe(58 + 100 + 51);
    expect(summary.primary.totalPercent).toBe(300);
    expect(summary.primary.segments).toEqual([58, 100, 51]);
    expect(summary.primary.soonestResetAtMs).toBe(1000);
    // Claude also aggregates the plain 7-day window as the secondary row.
    expect(summary.secondary?.labelKey).toBe('claude_quota.seven_day');
    expect(summary.secondary?.sumRemainingPercent).toBe(79 + 100 + 75);
  });

  test('unloaded credentials keep the denominator but contribute null segments', () => {
    const entries = [entry('claude-a.json', 'claude'), entry('claude-b.json', 'claude')];
    const states: Record<string, ClaudeQuotaState | undefined> = {
      'claude-a.json': claudeState(40, 40, 500),
      'claude-b.json': undefined,
    };
    const [summary] = buildProviderSummaries(entries, (e) => states[e.file.name]);

    expect(summary.primary.loadedCount).toBe(1);
    expect(summary.primary.sumRemainingPercent).toBe(60);
    expect(summary.primary.totalPercent).toBe(200);
    expect(summary.primary.segments).toEqual([60, null]);
  });

  test('codex reads the weekly window; unsupported providers get no card', () => {
    const entries = [
      entry('codex-a.json', 'codex'),
      entry('antigravity-a.json', 'antigravity'),
    ];
    const states: Record<string, unknown> = {
      'codex-a.json': codexState(83, 4000),
    };
    const summaries = buildProviderSummaries(entries, (e) => states[e.file.name]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].type).toBe('codex');
    expect(summaries[0].primary.labelKey).toBe('codex_quota.secondary_window');
    expect(summaries[0].primary.sumRemainingPercent).toBe(17);
    expect(summaries[0].secondary).toBeNull();
  });

  test('xai only treats a weekly period end as a reset instant', () => {
    const billingBase = {
      mode: 'billing' as const,
      productUsage: [],
      monthlyLimitCents: null,
      usedCents: null,
      includedUsedCents: null,
      onDemandCapCents: null,
      onDemandUsedCents: null,
      onDemandUsedPercent: null,
      usagePercent: null,
    };
    const weekly: XaiQuotaState = {
      status: 'success',
      billing: { ...billingBase, periodType: 'weekly', usedPercent: 30, resetAtMs: 9000 },
    };
    const monthly: XaiQuotaState = {
      status: 'success',
      billing: { ...billingBase, periodType: 'monthly', usedPercent: 30, resetAtMs: 9000 },
    };
    const entries = [entry('grok-a.json', 'xai'), entry('grok-b.json', 'xai')];
    const states: Record<string, XaiQuotaState> = {
      'grok-a.json': monthly,
      'grok-b.json': weekly,
    };
    const [summary] = buildProviderSummaries(entries, (e) => states[e.file.name]);

    expect(summary.primary.sumRemainingPercent).toBe(140);
    expect(summary.primary.soonestResetAtMs).toBe(9000);
  });

  test('error states read as unloaded, never as 100% remaining', () => {
    const entries = [entry('claude-a.json', 'claude')];
    const errorState: ClaudeQuotaState = { status: 'error', windows: [], error: 'nope' };
    const [summary] = buildProviderSummaries(entries, () => errorState);

    expect(summary.primary.loadedCount).toBe(0);
    expect(summary.primary.sumRemainingPercent).toBe(0);
    expect(summary.primary.segments).toEqual([null]);
  });
});
