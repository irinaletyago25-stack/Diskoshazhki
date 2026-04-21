import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function id() {
  return Math.random().toString(36).slice(2, 10);
}

export function isoDate(d: Date) {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function addDaysISO(base: string | number, n?: number) {
  let d: Date;
  if (typeof base === 'number') {
    d = new Date();
    d.setDate(d.getDate() + base);
  } else {
    d = getDayFromISO(base);
    d.setDate(d.getDate() + (n || 0));
  }
  return isoDate(d);
}

export function getDayFromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function countHabitsOnDate(habits: any[], date: string) {
  return habits.filter(h => h.dates.includes(date)).length;
}

/**
 * Russian pluralization helper
 * @param count Number to pluralize
 * @param words Array of 3 forms: ['яблоко', 'яблока', 'яблок']
 */
export function pluralize(count: number, words: [string, string, string]) {
  const cases = [2, 0, 1, 1, 1, 2];
  return words[(count % 100 > 4 && count % 100 < 20) ? 2 : cases[(count % 10 < 5) ? count % 10 : 5]];
}
