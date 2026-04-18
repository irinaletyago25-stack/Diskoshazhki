import { useState, useEffect } from 'react';
import { AppState } from '../types';
import { DEFAULT_STATE } from '../constants';

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('irinTrackerState');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Basic merge with default state to ensure new fields are present
        return { 
          ...DEFAULT_STATE, 
          ...parsed, 
          settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
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

  // Auto-save logic
  useEffect(() => {
    if (!state.settings.autoSave) return;

    // Immediate save on any state change (matches "significant changes" for this scale)
    // We could debounce this if needed, but localStorage is very fast.
    localStorage.setItem('irinTrackerState', JSON.stringify(state));
  }, [state]);

  // Fallback 30s interval save as requested
  useEffect(() => {
    if (!state.settings.autoSave) return;

    const interval = setInterval(() => {
      localStorage.setItem('irinTrackerState', JSON.stringify(state));
      console.log('Periodic auto-save triggered');
    }, 30000);

    return () => clearInterval(interval);
  }, [state.settings.autoSave, state]);

  return [state, setState] as const;
}
