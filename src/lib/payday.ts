import { addDays, addWeeks, addMonths, addQuarters, addYears, differenceInDays, format, startOfDay, isBefore, isEqual } from "date-fns";
import { getToday, parseLocalDate } from "./timezone";

export type PayFrequency = "weekly" | "biweekly" | "monthly";
export type ScheduleType = "monthly" | "every_payday" | "every_other_payday" | "weekly" | "custom";

/**
 * Generate upcoming paydays from a known payday date and frequency.
 * Returns the next N paydays from today (timezone-aware).
 */
export function getUpcomingPaydays(
  lastPayday: string | Date,
  frequency: PayFrequency,
  count: number = 12,
  timezone?: string
): Date[] {
  const today = getToday(timezone);
  let current = startOfDay(
    typeof lastPayday === "string"
      ? parseLocalDate(lastPayday)
      : lastPayday
  );

  // Walk forward to find the first payday on or after today
  while (isBefore(current, today)) {
    current = advancePayday(current, frequency);
  }

  const paydays: Date[] = [];
  for (let i = 0; i < count; i++) {
    paydays.push(current);
    current = advancePayday(current, frequency);
  }
  return paydays;
}

function advancePayday(date: Date, frequency: PayFrequency): Date {
  switch (frequency) {
    case "weekly": return addWeeks(date, 1);
    case "biweekly": return addWeeks(date, 2);
    case "monthly": return addMonths(date, 1);
  }
}

/**
 * Calculate the next due date for a bill based on its schedule type.
 */
export function getNextDueDate(bill: {
  schedule_type: ScheduleType;
  next_due_date: string | null;
  due_day: number | null;
  frequency: string;
}, paydays: Date[], timezone?: string): Date | null {
  const today = getToday(timezone);

  if (bill.schedule_type === "every_payday") {
    // Due on the next upcoming payday (including today)
    return paydays.find((d) => !isBefore(d, today)) || null;
  }

  if (bill.schedule_type === "every_other_payday") {
    // Due every other payday — use first, third, fifth... payday
    const upcoming = paydays.filter((d) => !isBefore(d, today));
    return upcoming.length > 0 ? upcoming[0] : null;
  }

  if (bill.schedule_type === "weekly") {
    if (bill.next_due_date) {
      let due = parseLocalDate(bill.next_due_date);
      while (isBefore(due, today)) {
        due = addWeeks(due, 1);
      }
      return due;
    }
    return today;
  }

  // monthly / custom — use next_due_date or calculate from due_day
  if (bill.next_due_date) {
    const due = parseLocalDate(bill.next_due_date);
    if (!isBefore(due, today)) return due;

    // Advance based on frequency
    let next = due;
    while (isBefore(next, today)) {
      next = advanceByFrequency(next, bill.frequency);
    }
    return next;
  }

  if (bill.due_day) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    if (!isBefore(thisMonth, today)) return thisMonth;
    return addMonths(thisMonth, 1);
  }

  return null;
}

function advanceByFrequency(date: Date, frequency: string): Date {
  switch (frequency) {
    case "weekly": return addWeeks(date, 1);
    case "biweekly": return addWeeks(date, 2);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addQuarters(date, 1);
    case "yearly": return addYears(date, 1);
    default: return addMonths(date, 1);
  }
}

/**
 * Get days until a date from today.
 */
export function daysUntil(date: Date, timezone?: string): number {
  return differenceInDays(startOfDay(date), getToday(timezone));
}

/**
 * Format a date for display.
 */
export function formatDueDate(date: Date): string {
  return format(date, "MMM d, yyyy");
}

/**
 * Get all bill events for a date range (for calendar view).
 */
export function getBillEvents(
  bills: Array<{
    id: string;
    name: string;
    amount: number;
    schedule_type: ScheduleType;
    next_due_date: string | null;
    due_day: number | null;
    frequency: string;
    is_autopay: boolean;
    paid_by: string;
  }>,
  paydays: Date[],
  daysAhead: number = 60,
  timezone?: string
): Array<{ date: Date; billId: string; name: string; amount: number; is_autopay: boolean; paid_by: string }> {
  const today = getToday(timezone);
  const end = addDays(today, daysAhead);
  const events: Array<{ date: Date; billId: string; name: string; amount: number; is_autopay: boolean; paid_by: string }> = [];

  for (const bill of bills) {
    if (bill.schedule_type === "every_payday") {
      for (const pd of paydays) {
        if (!isBefore(pd, today) && isBefore(pd, end)) {
          events.push({ date: pd, billId: bill.id, name: bill.name, amount: bill.amount, is_autopay: bill.is_autopay, paid_by: bill.paid_by });
        }
      }
    } else if (bill.schedule_type === "every_other_payday") {
      const relevant = paydays.filter((d, i) => i % 2 === 0 && !isBefore(d, today) && isBefore(d, end));
      for (const pd of relevant) {
        events.push({ date: pd, billId: bill.id, name: bill.name, amount: bill.amount, is_autopay: bill.is_autopay, paid_by: bill.paid_by });
      }
    } else {
      // Fixed schedule — walk forward from next_due_date
      let due = getNextDueDate(bill, paydays, timezone);
      if (!due) continue;
      let iterations = 0;
      while (isBefore(due, end) && iterations < 12) {
        if (!isBefore(due, today)) {
          events.push({ date: due, billId: bill.id, name: bill.name, amount: bill.amount, is_autopay: bill.is_autopay, paid_by: bill.paid_by });
        }
        due = advanceByFrequency(due, bill.frequency);
        iterations++;
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}
