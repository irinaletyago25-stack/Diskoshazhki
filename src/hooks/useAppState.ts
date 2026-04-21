import { useState, useEffect } from 'react';
import { AppState } from '../types';
import { DEFAULT_STATE } from '../constants';

export function useAppState() {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('irinTrackerState');
      if (saved) {
        setLastSaved(new Date());
        const parsed = JSON.parse(saved);
        // Basic merge with default state to ensure new fields are present
        return { 
          ...DEFAULT_STATE, 
          ...parsed, 
          settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
          pomodoro: { ...DEFAULT_STATE.pomodoro, ...parsed.pomodoro },
          customCategories: parsed.customCategories || DEFAULT_STATE.customCategories
        };
      }
    } catch (e) {
      console.error('Failed to load state', e);
    }
    return DEFAULT_STATE;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  // Auto-save logic: On every state change
  useEffect(() => {
    if (!state.settings.autoSave) return;
    localStorage.setItem('irinTrackerState', JSON.stringify(state));
    setLastSaved(new Date());
  }, [state]);

  // Periodic fallback: Every 30s, independent of state change frequency
  useEffect(() => {
    if (!state.settings.autoSave) return;

    const interval = setInterval(() => {
      localStorage.setItem('irinTrackerState', JSON.stringify(state));
      setLastSaved(new Date());
      console.log('Periodic sync checkpoint');
    }, 30000);

    return () => clearInterval(interval);
  }, [state.settings.autoSave]);

  return [state, setState, lastSaved] as const;
}
