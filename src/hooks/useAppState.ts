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
    localStorage.setItem('irinTrackerState', JSON.stringify(state));
    document.documentElement.setAttribute('data-theme', state.settings.theme);
  }, [state]);

  return [state, setState] as const;
}
