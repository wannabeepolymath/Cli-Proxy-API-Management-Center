/**
 * Provider aggregate cards above the credential grid ("all" tab only).
 *
 * Each card: provider identity + `409% of 500%` total remaining across that
 * provider's credentials, a segmented bar (one segment per credential), and
 * the soonest upcoming reset. Claude additionally collapses its plain 7-day
 * limit behind a Show toggle — it rarely binds before the Fable window does.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import {
  QUOTA_PROGRESS_HIGH_THRESHOLD,
  QUOTA_PROGRESS_MEDIUM_THRESHOLD,
} from './QuotaMeter';
import type { ProviderSummary, SummaryWindowAggregate } from '../summary';
import styles from './QuotaSummaryCards.module.scss';

const fillClassFor = (remaining: number): string =>
  remaining >= QUOTA_PROGRESS_HIGH_THRESHOLD
    ? styles.segmentFillHigh
    : remaining >= QUOTA_PROGRESS_MEDIUM_THRESHOLD
      ? styles.segmentFillMedium
      : styles.segmentFillLow;

function SummaryValue({ aggregate }: { aggregate: SummaryWindowAggregate }) {
  const { t } = useTranslation();
  if (aggregate.loadedCount === 0) {
    return (
      <span className={styles.value}>
        {t('quota_management.summary_value', { sum: '--', total: aggregate.totalPercent })}
      </span>
    );
  }
  return (
    <span className={styles.value}>
      {t('quota_management.summary_value', {
        sum: Math.round(aggregate.sumRemainingPercent),
        total: aggregate.totalPercent,
      })}
    </span>
  );
}

function SummaryBar({ segments }: { segments: (number | null)[] }) {
  return (
    <div className={styles.bar} aria-hidden="true">
      {segments.map((remaining, index) => (
        <span key={index} className={styles.segment}>
          {remaining !== null && (
            <span
              className={`${styles.segmentFill} ${fillClassFor(remaining)}`}
              style={{ width: `${Math.round(remaining * 100) / 100}%` }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

function SummaryReset({ aggregate }: { aggregate: SummaryWindowAggregate }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const display = buildResetDisplay(
    aggregate.soonestResetLabel,
    aggregate.soonestResetAtMs,
    now,
    i18n.resolvedLanguage
  );
  if (!display) {
    return <span className={styles.resetMuted}>{t('quota_management.summary_no_reset')}</span>;
  }
  return (
    <span className={styles.reset}>
      {display.relative && <span className={styles.resetRelative}>{display.relative}</span>}
      <span className={styles.resetAbsolute}>{display.absolute}</span>
    </span>
  );
}

function SummaryCard({
  summary,
  resolvedTheme,
}: {
  summary: ProviderSummary;
  resolvedTheme: ResolvedTheme;
}) {
  const { t } = useTranslation();
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const iconSrc = getAuthFileIcon(summary.type, resolvedTheme);
  const typeLabel = getTypeLabel(t, summary.type);

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span
          className={styles.iconWrap}
          style={
            isThemeSurfaceIconProvider(summary.type)
              ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
              : undefined
          }
        >
          {iconSrc ? (
            <img src={iconSrc} alt="" className={styles.icon} />
          ) : (
            <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className={styles.typeLabel}>{typeLabel}</span>
        <span className={styles.count}>
          {t('quota_management.meta_credentials', { count: summary.credentialCount })}
        </span>
      </header>

      <div className={styles.primary}>
        <span className={styles.windowLabel}>{t(summary.primary.labelKey)}</span>
        <SummaryValue aggregate={summary.primary} />
        <SummaryBar segments={summary.primary.segments} />
        <SummaryReset aggregate={summary.primary} />
      </div>

      {summary.secondary && (
        <div className={styles.secondary}>
          <div className={styles.secondaryHead}>
            <span className={styles.windowLabel}>{t(summary.secondary.labelKey)}</span>
            {secondaryOpen && <SummaryValue aggregate={summary.secondary} />}
            <button
              type="button"
              className={styles.secondaryToggle}
              aria-expanded={secondaryOpen}
              onClick={() => setSecondaryOpen((open) => !open)}
            >
              {t(secondaryOpen ? 'quota_management.summary_hide' : 'quota_management.summary_show')}
            </button>
          </div>
          {secondaryOpen && (
            <>
              <SummaryBar segments={summary.secondary.segments} />
              <SummaryReset aggregate={summary.secondary} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function QuotaSummaryCards({
  summaries,
  resolvedTheme,
}: {
  summaries: ProviderSummary[];
  resolvedTheme: ResolvedTheme;
}) {
  if (summaries.length === 0) return null;
  return (
    <div className={styles.rail}>
      {summaries.map((summary) => (
        <SummaryCard key={summary.type} summary={summary} resolvedTheme={resolvedTheme} />
      ))}
    </div>
  );
}
