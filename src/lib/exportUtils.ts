import { AppState } from "../types";
import { countHabitsOnDate } from "../lib/utils";

export function exportToCSV(state: AppState) {
  const moodLabels: Record<number, string> = {
    5: 'Отлично',
    4: 'Хорошо',
    3: 'Нормально',
    2: 'Тяжело',
    1: 'Плохо'
  };

  const rows = [['Дата', 'Настроение', 'Заметка', 'Теги', ...state.habits.map(h => h.name)]];
  
  const allDates = new Set([
    ...Object.keys(state.journalEntries),
    ...state.habits.flatMap(h => h.dates)
  ]);

  Array.from(allDates).sort().forEach(date => {
    const e = state.journalEntries[date] || { mood: null, note: '', tags: [] };
    rows.push([
      date,
      e.mood ? moodLabels[e.mood] || String(e.mood) : '',
      (e.note || '').replace(/"/g, '""'),
      (e.tags || []).join(' '),
      ...state.habits.map(h => h.dates.includes(date) ? '✓' : '')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `disco-tracker-export-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
