import { AppState } from "./types";
import { id, addDaysISO } from "./lib/utils";

export const BASE_CATEGORIES = [
  'здоровье', 'карьера', 'финансы', 'саморазвитие', 'семья', 
  'окружение', 'хобби', 'яркость жизни', 'быт', 'канал'
];

export const BASE_CAT_EMOJI: Record<string, string> = {
  'здоровье': '🥗', 'карьера': '🏔️', 'финансы': '💎', 'саморазвитие': '🧠', 
  'семья': '🤍', 'окружение': '🎡', 'хобби': '🎀', 'яркость жизни': '✨', 
  'быт': '🏡', 'канал': '📢'
};

export const MOOD_SCALE = [
  { v: 5, e: '✨', l: 'Отлично' },
  { v: 4, e: '🌸', l: 'Хорошо' },
  { v: 3, e: '☁️', l: 'Нормально' },
  { v: 2, e: '☂️', l: 'Тяжело' },
  { v: 1, e: '🌊', l: 'Плохо' }
];

export const QUOTE_POOL = [
  { text: 'Мягкость — это не слабость, а точная форма силы.', author: 'Неизвестный источник' },
  { text: 'Маленькие повторения создают большие системы.', author: 'Идея дня' },
  { text: 'Хороший ритм важнее идеального рывка.', author: 'Тихая продуктивность' },
  { text: 'Ты можешь делать глубоко и бережно одновременно.', author: 'Напоминание тебе' }
];

export const RANDOM_THOUGHTS = [
  "Какое маленькое событие сегодня заставило тебя улыбнуться?",
  "Если бы сегодняшний день был цветом, то каким?",
  "Что самое доброе ты сделала для себя за последние 24 часа?",
  "Какую одну вещь ты бы хотела запомнить об этом моменте жизни?",
  "В чем твоя главная суперсила сегодня?"
];

export const JOURNAL_TEMPLATES = [
  { id: 'morning', name: 'Утро', icon: '☀️', text: 'Что я хочу почувствовать сегодня?\nНа чём хочу сфокусироваться?\nЧто поддержит меня сегодня?' },
  { id: 'gratitude', name: 'Благодарность', icon: '🙏', text: 'За что я благодарна сегодня?\nЧто было тёплым моментом?\nКому или чему хочется сказать спасибо?' },
  { id: 'reflection', name: 'Итоги', icon: '🌙', text: 'Что получилось сегодня?\nЧто забрало силы?\nЧто я хочу перенести в завтра?' }
];

export const DEFAULT_STATE: AppState = {
  habits: [],
  goals: [],
  tasks: [],
  journalEntries: {},
  customQuotes: [],
  settings: {
    theme: 'dark',
    quoteMode: 'daily',
    customQuote: null,
    userName: '',
    notifEnabled: false,
    notifTime: '21:00',
    hasSeenOnboarding: false,
    dynamicLighting: true,
    soundEffects: true,
    ecoMode: false,
    heatmapMode: 'grid',
    autoSave: true
  },
  lastRecurringReset: '',
  customCategories: [],
  balance: {
    'здоровье': 5, 'карьера': 5, 'финансы': 5, 'саморазвитие': 5, 
    'семья': 5, 'окружение': 5, 'хобби': 5, 'яркость жизни': 5
  },
  balanceHistory: {},
  pomodoro: {
    duration: 25,
    timeLeft: 1500,
    isActive: false,
    mode: 'work',
    sessionsCompleted: 0,
    totalFocusMinutes: 0,
    focusTaskId: null,
    ambientType: 'none'
  },
  achievements: [
    { id: 'first_habit', title: 'Первый шаг', description: 'Отметь свою первую привычку', icon: '🌱', unlockedAt: null },
    { id: 'pomodoro_1', title: 'Глубокий фокус', description: 'Заверши первую сессию Помодоро', icon: '⚡', unlockedAt: null },
    { id: 'streak_7', title: 'Недельный ритм', description: 'Держи серию 7 дней подряд', icon: '🔥', unlockedAt: null },
    { id: 'cat_level_5', title: 'Мяу-мастер', description: 'Прокачай котика до 5 уровня', icon: '🐾', unlockedAt: null },
    { id: 'cat_collector', title: 'Кошатница', description: 'Собери 5 котиков в галерею', icon: '😻', unlockedAt: null }
  ],
  catGallery: [],
  cat: {
    level: 1,
    exp: 0,
    name: 'Электронный Кот'
  },
  lastWeeklyCatDate: ''
};
