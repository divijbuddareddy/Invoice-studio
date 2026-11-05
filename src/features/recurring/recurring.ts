// Pure recurrence logic. Static hosting cannot run background jobs, so due periods are
// computed when the app is opened and the user chooses to generate drafts.

import type { DocumentRecord, Frequency, RecurrenceRule } from '../../types';
import { addDays, addMonths, nowIso, parseDate, todayStr, uid } from '../../utils/misc';

const MONTHS: Record<Exclude<Frequency, 'weekly'>, number> = { monthly: 1, quarterly: 3, 'half-yearly': 6, yearly: 12 };

export function advanceDate(date: string, frequency: Frequency, anchorDay?: number): string {
  if (frequency === 'weekly') return addDays(date, 7);
  return addMonths(date, MONTHS[frequency], anchorDay);
}

/** All period dates that are due (≤ today and ≤ end date), oldest first, capped for safety. */
export function dueOccurrences(rule: RecurrenceRule, today = todayStr(), cap = 24): string[] {
  if (!rule.active || !rule.nextDate) return [];
  const anchor = parseDate(rule.startDate || rule.nextDate).getDate();
  const out: string[] = [];
  let d = rule.nextDate;
  while (d <= today && (!rule.endDate || d <= rule.endDate) && out.length < cap) {
    if (d !== rule.lastGeneratedPeriod) out.push(d);
    d = advanceDate(d, rule.frequency, anchor);
  }
  return out;
}

/** Next date after generating up to and including `period`. */
export function nextAfter(rule: RecurrenceRule, period: string): string {
  const anchor = parseDate(rule.startDate || period).getDate();
  return advanceDate(period, rule.frequency, anchor);
}

/**
 * Build a draft invoice for one period from the template (source) document.
 * Returns null when a draft for this rule+period already exists (duplicate prevention).
 */
export function buildRecurringDraft(
  source: DocumentRecord,
  rule: RecurrenceRule,
  period: string,
  number: string,
  existing: Pick<DocumentRecord, 'recurrenceId' | 'recurrencePeriod'>[],
): DocumentRecord | null {
  if (existing.some((d) => d.recurrenceId === rule.id && d.recurrencePeriod === period)) return null;
  const dueOffset =
    source.dueDate && source.issueDate
      ? Math.round((parseDate(source.dueDate).getTime() - parseDate(source.issueDate).getTime()) / 86_400_000)
      : 0;
  const t = nowIso();
  return {
    ...structuredClone(source),
    id: uid(),
    number,
    status: 'draft',
    statusOverride: null,
    issueDate: period,
    dueDate: addDays(period, Math.max(0, dueOffset)),
    advancePaid: 0,
    items: source.items.map((i) => ({ ...i, id: uid() })),
    recurrenceId: rule.id,
    recurrencePeriod: period,
    convertedToId: undefined,
    archived: false,
    audit: [{ at: t, message: `Generated from recurring schedule (period ${period}) based on ${source.number}` }],
    createdAt: t,
    updatedAt: t,
  };
}
