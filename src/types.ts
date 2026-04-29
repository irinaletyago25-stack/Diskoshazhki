export interface Habit {
  id: string;
  name: string;
  icon: string;
  dates: string[];
  archived?: boolean;
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
  icon?: string;
  color?: string;
  archived?: boolean;
  step?: number;
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: 'urgent' | 'important' | 'someday';
  date: string; // The date this task is planned for (YYYY-MM-DD)
  recurring: 'none' | 'daily' | 'weekly' | 'weekdays';
  recurringDays?: number[]; // [0-6] for weekly
  tags: string[];
  focus: boolean;
  completedAt?: string;
  isRolledOver?: boolean;
  rolloverCount?: number;
  icon?: string;
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
  pomodoroNotifTime: number;
  hasSeenOnboarding: boolean;
  dynamicLighting: boolean;
  soundEffects: boolean;
  ecoMode: boolean;
  heatmapMode: 'grid' | 'radial';
  autoSave: boolean;
}

export interface PomodoroState {
  duration: number;
  timeLeft: number;
  isActive: boolean;
  mode: 'work' | 'break';
  sessionsCompleted: number;
  totalFocusMinutes: number;
  focusTaskId: string | null;
  ambientType: 'none' | 'cyber' | 'space' | 'rain';
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export interface CatState {
  level: number;
  exp: number;
  name: string;
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
  balance: Record<string, number>;
  balanceHistory: Record<string, Record<string, number>>;
  pomodoro: PomodoroState;
  achievements: Achievement[];
  catGallery: string[];
  cat: CatState;
  lastWeeklyCatDate?: string; // Sunday date of the last generated weekly cat
}
