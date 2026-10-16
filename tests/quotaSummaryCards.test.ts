import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { QuotaSummaryCards } from '@/features/quota/components/QuotaSummaryCards';
import type { ProviderSummary, SummaryWindowAggregate } from '@/features/quota/summary';

const aggregate = (overrides: Partial<SummaryWindowAggregate> = {}): SummaryWindowAggregate => ({
  labelKey: 'claude_quota.seven_day_fable',
  loadedCount: 2,
  sumRemainingPercent: 158,
  totalPercent: 200,
  segments: [58, 100],
  soonestResetAtMs: Date.now() + 86_400_000,
  soonestResetLabel: '09/12, 23:00',
  ...overrides,
});

describe('QuotaSummaryCards', () => {
  test('renders the aggregate value, per-credential segments, and reset label', () => {
    const summaries: ProviderSummary[] = [
      {
        type: 'claude',
        credentialCount: 2,
        primary: aggregate(),
        secondary: aggregate({ labelKey: 'claude_quota.seven_day', sumRemainingPercent: 154 }),
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(QuotaSummaryCards, { summaries, resolvedTheme: 'dark' })
    );

    expect(markup).toContain(
      i18n.t('quota_management.summary_value', { sum: 158, total: 200 })
    );
    expect(markup).toContain('width:58%');
    expect(markup).toContain('width:100%');
    expect(markup).toContain('09/12, 23:00');
    // Secondary 7-day aggregate starts collapsed behind the Show toggle.
    expect(markup).toContain(i18n.t('quota_management.summary_show'));
    expect(markup).not.toContain(
      i18n.t('quota_management.summary_value', { sum: 154, total: 200 })
    );
  });

  test('unloaded providers show a placeholder value and no reset line', () => {
    const summaries: ProviderSummary[] = [
      {
        type: 'xai',
        credentialCount: 1,
        primary: aggregate({
          labelKey: 'xai_quota.weekly_limit',
          loadedCount: 0,
          sumRemainingPercent: 0,
          totalPercent: 100,
          segments: [null],
          soonestResetAtMs: null,
          soonestResetLabel: null,
        }),
        secondary: null,
      },
    ];
    const markup = renderToStaticMarkup(
      createElement(QuotaSummaryCards, { summaries, resolvedTheme: 'light' })
    );

    expect(markup).toContain(
      i18n.t('quota_management.summary_value', { sum: '--', total: 100 })
    );
    expect(markup).toContain(i18n.t('quota_management.summary_no_reset'));
  });

  test('renders nothing without summaries', () => {
    expect(
      renderToStaticMarkup(createElement(QuotaSummaryCards, { summaries: [], resolvedTheme: 'dark' }))
    ).toBe('');
  });
});
