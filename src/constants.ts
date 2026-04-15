import { AppState } from "./types";
import { id, addDaysISO } from "./lib/utils";

export const BASE_CATEGORIES = [
  'здоровье', 'карьера', 'финансы', 'саморазвитие', 'семья', 
  'окружение', 'хобби', 'яркость жизни', 'быт', 'канал'
];

export const BASE_CAT_EMOJI: Record<string, string> = {
  'здоровье': 'H', 'карьера': 'W', 'финансы': 'F', 'саморазвитие': 'S', 
  'семья': 'F', 'окружение': 'P', 'хобби': 'C', 'яркость жизни': 'L', 
  'быт': 'H', 'канал': 'M'
};

export const MOOD_SCALE = [
  { v: 5, e: '5', l: 'Отлично' },
  { v: 4, e: '4', l: 'Хорошо' },
  { v: 3, e: '3', l: 'Нормально' },
  { v: 2, e: '2', l: 'Тяжело' },
  { v: 1, e: '1', l: 'Плохо' }
];

export const QUOTE_POOL = [
  { text: 'Мягкость — это не слабость, а точная форма силы.', author: 'Неизвестный источник' },
  { text: 'Маленькие повторения создают большие системы.', author: 'Идея дня' },
  { text: 'Хороший ритм важнее идеального рывка.', author: 'Тихая продуктивность' },
  { text: 'Ты можешь делать глубоко и бережно одновременно.', author: 'Напоминание Ириночке' }
];

export const RANDOM_THOUGHTS = [
  "Какое маленькое событие сегодня заставило тебя улыбнуться?",
  "Если бы сегодняшний день был цветом, то каким?",
  "Что самое доброе ты сделала для себя за последние 24 часа?",
  "Какую одну вещь ты бы хотела запомнить об этом моменте жизни?",
  "В чем твоя главная суперсила сегодня?"
];

export const DEFAULT_STATE: AppState = {
  habits: [
    { id: id(), name: 'Вода', icon: 'W', dates: [] },
    { id: id(), name: 'Португальский', icon: 'L', dates: [] },
    { id: id(), name: 'Прогулка', icon: 'P', dates: [] }
  ],
  goals: [
    { 
      id: id(), 
      name: 'Дописать методологию', 
      progress: 45, 
      target: 100, 
      unit: '%', 
      deadline: addDaysISO(23), 
      history: [
        { date: addDaysISO(-5), v: 30 },
        { date: addDaysISO(-2), v: 40 },
        { date: addDaysISO(0), v: 45 }
      ] 
    }
  ],
  tasks: [
    { id: id(), text: 'Собрать идеи для лекции', done: false, priority: 'important', recurring: 'weekly', weekday: 1, tags: ['работа'], focus: true },
    { id: id(), text: 'Записать 3 мысли для канала', done: false, priority: 'urgent', recurring: 'none', weekday: null, tags: ['идея'], focus: true }
  ],
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
    soundEffects: true
  },
  lastRecurringReset: '',
  customCategories: [],
  cat: {
    level: 1,
    exp: 0,
    name: 'Диско-Кот',
    unlockedSkins: ['default'],
    activeSkin: 'default'
  },
  balance: {
    'здоровье': 5, 'карьера': 5, 'финансы': 5, 'саморазвитие': 5, 
    'семья': 5, 'окружение': 5, 'хобби': 5, 'яркость жизни': 5
  },
  pomodoro: {
    duration: 25,
    timeLeft: 1500,
    isActive: false,
    mode: 'work',
    sessionsCompleted: 0
  },
  achievements: [
    { id: 'first_habit', title: 'Первый шаг', description: 'Отметь свою первую привычку', icon: 'S', unlockedAt: null },
    { id: 'pomodoro_1', title: 'Глубокий фокус', description: 'Заверши первую сессию Помодоро', icon: 'F', unlockedAt: null },
    { id: 'cat_level_5', title: 'Друг котиков', description: 'Прокачай кота до 5 уровня', icon: 'C', unlockedAt: null },
    { id: 'streak_7', title: 'Недельный ритм', description: 'Держи серию 7 дней подряд', icon: 'R', unlockedAt: null }
  ]
};
