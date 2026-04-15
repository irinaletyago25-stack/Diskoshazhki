export interface Habit {
  id: string;
  name: string;
  icon: string;
  dates: string[];
}

export interface GoalHistory {
  date: string;
  v: number;
}

export interface Goal {
  id: string;
  name: string;
  progress: number;
  target: number;
  unit: string;
  deadline: string;
  history: GoalHistory[];
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: 'urgent' | 'important' | 'someday';
  recurring: 'none' | 'daily' | 'weekly' | 'mon';
  weekday: number | null;
  tags: string[];
  focus: boolean;
}

export interface JournalEntry {
  mood: number | null;
  note: string;
  tags: string[];
  pinned: boolean;
}

export interface CustomCategory {
  name: string;
  emoji: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'pink' | 'cyberpunk';
  quoteMode: 'daily' | 'custom';
  customQuote: { text: string; author: string } | null;
  userName: string;
  notifEnabled: boolean;
  notifTime: string;
  hasSeenOnboarding: boolean;
  dynamicLighting: boolean;
  soundEffects: boolean;
}

export interface CatState {
  level: number;
  exp: number;
  name: string;
  unlockedSkins: string[];
  activeSkin: string;
}

export interface PomodoroState {
  duration: number;
  timeLeft: number;
  isActive: boolean;
  mode: 'work' | 'break';
  sessionsCompleted: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface AppState {
  habits: Habit[];
  goals: Goal[];
  tasks: Task[];
  journalEntries: Record<string, JournalEntry>;
  customQuotes: { text: string; author: string }[];
  settings: AppSettings;
  lastRecurringReset: string;
  customCategories: CustomCategory[];
  cat: CatState;
  balance: Record<string, number>;
  pomodoro: PomodoroState;
  achievements: Achievement[];
}
