/**
 * Daily review streak: how many consecutive days, ending today or yesterday, include at
 * least one review. A streak is still alive if you haven't reviewed *yet* today.
 * Days are "YYYY-MM-DD" strings in the viewer's time zone.
 */
export function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function computeStreak(days, today) {
  let cursor = days.has(today) ? today : days.has(shiftDay(today, -1)) ? shiftDay(today, -1) : null;
  let n = 0;
  while (cursor && days.has(cursor)) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}
