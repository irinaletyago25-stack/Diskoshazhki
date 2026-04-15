import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, CheckCircle2, Target, Calendar as CalendarIcon, 
  BookOpen, ListTodo, Flame, BarChart3, Settings, 
  Search, Sparkles, Menu, X, Plus, Trash2, 
  ChevronLeft, ChevronRight, Download, Upload, 
  Camera, Moon, Sun, Palette, Zap, Bell, LogIn, LogOut,
  RefreshCw, Trophy, Mic, MicOff, Share2, MessageSquare,
  Droplets, Cat, Timer, PieChart, Leaf, Brain, Music,
  Flower2, PawPrint, Circle, Heart, Star, Tag
} from 'lucide-react';
import html2canvas from 'html2canvas';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import { useAppState } from './hooks/useAppState';
import { 
  id, isoDate, todayISO, addDaysISO, getDayFromISO 
} from './lib/utils';
import { 
  BASE_CATEGORIES, BASE_CAT_EMOJI, MOOD_SCALE, 
  QUOTE_POOL, RANDOM_THOUGHTS, DEFAULT_STATE 
} from './constants';
import { AppState, Habit, Goal, Task, JournalEntry } from './types';
import { cn } from './lib/utils';
import { 
  auth, db, googleProvider 
} from './firebase';
import { 
  signInWithPopup, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import { 
  doc, setDoc, getDoc, onSnapshot 
} from 'firebase/firestore';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(...registerables);

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// --- Components ---

interface ToastProps {
  key?: string;
  message: string;
  type: string;
  onClose: () => void;
}

const Toast = ({ message, type, onClose }: ToastProps) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    className={cn(
      "toast p-4 rounded-2xl shadow-lg font-bold max-w-xs pointer-events-auto",
      type === 'success' ? "border-l-4 border-good" : 
      type === 'error' ? "border-l-4 border-bad" : "border-l-4 border-primary"
    )}
  >
    {message}
  </motion.div>
);

const OnboardingModal = ({ step, onNext, onSkip }: { step: number, onNext: () => void, onSkip: () => void }) => {
  const steps = [
    { title: "Привет!", text: "Добро пожаловать в Дискошажки — твой бережный трекер жизни с блёстками.", icon: <Sparkles size={48} className="text-primary" /> },
    { title: "Бережный ритм", text: "Мы верим в маленькие шаги. Отмечай привычки, ставь цели и не забывай хвалить себя.", icon: <Leaf size={48} className="text-good" /> },
    { title: "Дневник и ИИ", text: "Записывай мысли, а наш Диско-ИИ поможет тебе с рефлексией и даст добрый совет.", icon: <Brain size={48} className="text-primary-2" /> },
    { title: "Party Mode!", text: "Кликни 5 раз на логотип, чтобы устроить себе диско-паузу. Ты — звезда!", icon: <Music size={48} className="text-accent" /> }
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card max-w-md w-full text-center space-y-6 p-8"
      >
        <div className="flex justify-center">{steps[step].icon}</div>
        <h2 className="text-2xl font-bold">{steps[step].title}</h2>
        <p className="text-muted leading-relaxed">{steps[step].text}</p>
        <div className="flex gap-3 pt-4">
          <button className="chip-btn flex-1" onClick={onSkip}>Пропустить</button>
          <button className="btn flex-1" onClick={onNext}>
            {step === steps.length - 1 ? "Поехали!" : "Далее"}
          </button>
        </div>
        <div className="flex justify-center gap-1">
          {steps.map((_, i) => (
            <div key={i} className={cn("w-2 h-2 rounded-full", i === step ? "bg-primary" : "bg-line")} />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const DynamicLighting = ({ enabled }: { enabled: boolean }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <div 
        className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-300 ease-out"
        style={{ 
          left: mousePos.x - 300, 
          top: mousePos.y - 300,
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)'
        }}
      />
      <div className="bg-lamps">
        <div className="lamp w-64 h-64 bg-primary top-1/4 left-1/4" />
        <div className="lamp w-96 h-96 bg-primary-2 top-3/4 left-2/3" />
        <div className="lamp w-80 h-80 bg-accent top-1/2 left-1/10" />
      </div>
    </div>
  );
};

export default function App() {
  const [state, setState] = useAppState();
  const [activeSection, setActiveSection] = useState('overview');
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<{ id: string, message: string, type: string }[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPartyMode, setIsPartyMode] = useState(false);
  const [partyClicks, setPartyClicks] = useState(0);
  const [catPopup, setCatPopup] = useState<{ show: boolean, isAllDone: boolean, img: string, mood: any } | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<'grid' | 'radial'>('grid');
  const [viewDate, setViewDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [isFABOpen, setIsFABOpen] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Firebase Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Pull from Firestore
        const userDoc = doc(db, 'users', u.uid);
        getDoc(userDoc).then(snap => {
          if (snap.exists()) {
            const remote = snap.data() as AppState;
            setState(prev => ({ ...prev, ...remote }));
          }
        });
      }
    });
    return unsubscribe;
  }, []);

  // --- Recurring Tasks Reset ---
  useEffect(() => {
    const today = todayISO();
    if (state.lastRecurringReset !== today) {
      handleStateChange(prev => {
        const dayOfWeek = new Date().getDay(); // 0 is Sunday, 1 is Monday
        const updatedTasks = prev.tasks.map(t => {
          if (t.recurring === 'daily') return { ...t, done: false };
          if (t.recurring === 'weekly' && t.weekday === dayOfWeek) return { ...t, done: false };
          if (t.recurring === 'mon' && dayOfWeek === 1) return { ...t, done: false };
          return t;
        });
        return { ...prev, tasks: updatedTasks, lastRecurringReset: today };
      });
    }
  }, [state.lastRecurringReset]);

  // --- Onboarding Check ---
  useEffect(() => {
    if (!state.settings.hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, [state.settings.hasSeenOnboarding]);

  // --- Pomodoro Logic ---
  useEffect(() => {
    let interval: any;
    if (state.pomodoro.isActive && state.pomodoro.timeLeft > 0) {
      interval = setInterval(() => {
        playSound('tick');
        handleStateChange(prev => ({
          ...prev,
          pomodoro: { ...prev.pomodoro, timeLeft: prev.pomodoro.timeLeft - 1 }
        }));
      }, 1000);
    } else if (state.pomodoro.isActive && state.pomodoro.timeLeft === 0) {
      const isWork = state.pomodoro.mode === 'work';
      const nextMode = isWork ? 'break' : 'work';
      const nextTime = nextMode === 'work' ? 25 * 60 : 5 * 60;
      
      handleStateChange(prev => ({
        ...prev,
        pomodoro: { 
          ...prev.pomodoro, 
          mode: nextMode, 
          timeLeft: nextTime, 
          isActive: false,
          sessionsCompleted: isWork ? prev.pomodoro.sessionsCompleted + 1 : prev.pomodoro.sessionsCompleted
        }
      }));
      
      showToast(isWork ? 'Время отдыхать! ☕' : 'Пора за работу! 💻', 'success');
      if (state.settings.notifEnabled) {
        new Notification(isWork ? 'Фокус завершен' : 'Перерыв окончен', {
          body: isWork ? 'Отличная работа! Отдохни 5 минут.' : 'Возвращаемся к задачам!',
          icon: '🪩'
        });
      }
    }
    return () => clearInterval(interval);
  }, [state.pomodoro.isActive, state.pomodoro.timeLeft, state.pomodoro.mode]);

  const togglePomodoro = () => {
    playSound('click');
    handleStateChange(prev => ({
      ...prev,
      pomodoro: { ...prev.pomodoro, isActive: !prev.pomodoro.isActive }
    }));
  };

  const resetPomodoro = () => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      pomodoro: { 
        ...prev.pomodoro, 
        isActive: false, 
        timeLeft: prev.pomodoro.mode === 'work' ? 25 * 60 : 5 * 60 
      }
    }));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const syncToFirebase = async (newState: AppState) => {
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), newState);
      } catch (e) {
        console.error("Sync error", e);
      }
    }
  };

  const checkAchievements = (newState: AppState) => {
    let updated = false;
    const today = todayISO();
    const nextAchievements = newState.achievements.map(a => {
      if (a.unlockedAt) return a;
      
      let unlocked = false;
      if (a.id === 'first_habit' && newState.habits.some(h => h.dates.length > 0)) unlocked = true;
      if (a.id === 'pomodoro_1' && newState.pomodoro.sessionsCompleted >= 1) unlocked = true;
      if (a.id === 'cat_level_5' && newState.cat.level >= 5) unlocked = true;
      if (a.id === 'streak_7' && overallStreak >= 7) unlocked = true;

      if (unlocked) {
        updated = true;
        showToast(`Достижение разблокировано: ${a.title} ${a.icon}`, 'success');
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#FFD700', '#FFA500', '#FF4500']
        });
        return { ...a, unlockedAt: today };
      }
      return a;
    });

    if (updated) {
      newState.achievements = nextAchievements;
    }
  };

  // Sound Helper
  const playSound = (type: 'click' | 'success' | 'pop' | 'tick') => {
    if (!state.settings.soundEffects) return;
    
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'pop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'tick') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
        osc.start(now);
        osc.stop(now + 0.02);
      }
    } catch (e) {
      console.warn('Audio not supported or blocked');
    }
  };

  const handleStateChange = (updater: (prev: AppState) => AppState) => {
    setState(prev => {
      const next = updater(prev);
      checkAchievements(next);
      syncToFirebase(next);
      return next;
    });
  };

  // --- Toasts ---
  const showToast = (message: string, type = 'info') => {
    const tid = id();
    setToasts(prev => [...prev, { id: tid, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 3500);
  };

  // --- Party Mode ---
  const handleLogoClick = () => {
    setPartyClicks(prev => prev + 1);
    if (partyClicks + 1 >= 5) {
      activatePartyMode();
      setPartyClicks(0);
    }
    setTimeout(() => setPartyClicks(0), 1500);
  };

  const activatePartyMode = () => {
    setIsPartyMode(true);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.log("Audio play failed", e));
    }
    const overlay = document.getElementById('partyOverlay');
    const flash = document.getElementById('partyBeatFlash');
    if (overlay) overlay.classList.add('active');
    if (flash) flash.classList.add('active');

    const confettiInterval = setInterval(() => {
      const pool = ['*', '+', 'o', '.', 'x'];
      for (let i = 0; i < 8; i++) {
        const el = document.createElement('div');
        el.className = 'party-confetti-el';
        el.textContent = pool[Math.floor(Math.random() * pool.length)];
        el.style.left = Math.random() * 100 + 'vw';
        const dur = 1.4 + Math.random() * 2.2;
        el.style.animationDuration = dur + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), (dur + 0.6) * 1000);
      }
    }, 450);

    const flashInterval = setInterval(() => {
      if (flash) {
        flash.style.opacity = '0.15';
        setTimeout(() => { flash.style.opacity = '0'; }, 100);
      }
    }, 480);

    setTimeout(() => {
      setIsPartyMode(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (overlay) overlay.classList.remove('active');
      if (flash) flash.classList.remove('active');
      clearInterval(confettiInterval);
      clearInterval(flashInterval);
      showToast('Ты — главная звезда своей жизни! Танцуй, сияй, живи!', 'success');
    }, 12000);
  };

  // --- New Features Helpers ---
  const handleExport = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    try {
      showToast('Готовлю картинку для тебя...', 'info');
      const canvas = await html2canvas(element, {
        backgroundColor: null,
        scale: 2,
        logging: false,
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Готово! Сохранено в загрузки', 'success');
    } catch (err) {
      console.error(err);
      showToast('Ой, что-то пошло не так при экспорте', 'error');
    }
  };

  const askGemini = async (context: string) => {
    if (isAIThinking) return;
    setIsAIThinking(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: context,
        config: {
          systemInstruction: "Ты — бережный и поддерживающий ИИ-ассистент в приложении 'Дискошажки'. Твоя цель — помогать пользователю в рефлексии, давать мягкие советы и поддерживать его путь к бережной продуктивности. Тон общения: дружелюбный, вдохновляющий, немного поэтичный. Используй эмодзи. Отвечай на русском языке.",
        }
      });
      const text = response.text;
      if (text) {
        handleStateChange(prev => ({
          ...prev,
          journalEntries: {
            ...prev.journalEntries,
            [todayISO()]: {
              ...((prev.journalEntries[todayISO()] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false }),
              note: ((prev.journalEntries[todayISO()] as JournalEntry)?.note || '') + "\n\nСовет от Диско-ИИ:\n" + text
            }
          }
        }));
        showToast('ИИ нашептал тебе совет в дневник', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('ИИ сейчас отдыхает, попробуй позже', 'error');
    } finally {
      setIsAIThinking(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showToast('Твой браузер не поддерживает голосовой ввод', 'error');
        return;
      }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ru-RU';
      recognitionRef.current.continuous = false;
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleStateChange(prev => ({
          ...prev,
          journalEntries: {
            ...prev.journalEntries,
            [todayISO()]: {
              ...((prev.journalEntries[todayISO()] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false }),
              note: ((prev.journalEntries[todayISO()] as JournalEntry)?.note || '') + " " + transcript
            }
          }
        }));
        showToast('Записала твои слова!', 'success');
      };
      recognitionRef.current.start();
      setIsRecording(true);
      showToast('Слушаю тебя...', 'info');
    }
  };

  const handleHabitComplete = (habitId: string) => {
    playSound('click');
    const today = todayISO();
    handleStateChange(prev => {
      const habit = prev.habits.find(h => h.id === habitId);
      if (!habit) return prev;
      const isDone = habit.dates.includes(today);
      const newDates = isDone 
        ? habit.dates.filter(d => d !== today)
        : [...habit.dates, today];
      
      if (!isDone) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ff5dac', '#c084fc', '#ff8c00']
        });
      }

      const next = {
        ...prev,
        habits: prev.habits.map(h => h.id === habitId ? { ...h, dates: newDates } : h)
      };
      
      if (!isDone) {
        checkCatReward(next, 15);
      }
      
      return next;
    });
  };

  // --- Cat Reward ---
  const checkCatReward = (newState: AppState, expAmount: number = 10) => {
    const doneToday = newState.habits.filter(h => h.dates.includes(todayISO())).length;
    
    // Update Cat EXP
    const nextExp = newState.cat.exp + expAmount;
    const expToNextLevel = newState.cat.level * 100;
    if (nextExp >= expToNextLevel) {
      newState.cat.level += 1;
      newState.cat.exp = nextExp - expToNextLevel;
      showToast(`Уровень кота повышен! Теперь уровень ${newState.cat.level}`, 'success');
    } else {
      newState.cat.exp = nextExp;
    }

      if (doneToday > 0) {
      const isAllDone = doneToday === newState.habits.length;
      fetch('https://api.thecatapi.com/v1/images/search?limit=1')
        .then(res => res.json())
        .then(data => {
          const mood = isAllDone ? { icon: <Trophy className="text-warn" />, phrase: 'ВСЕ привычки выполнены! Это лучший день!' } : { icon: <Heart className="text-primary" />, phrase: 'Молодец! Котик доволен.' };
          setCatPopup({ show: true, isAllDone, img: data[0]?.url || 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80', mood });
        })
        .catch(() => {
          const mood = isAllDone ? { icon: <Trophy className="text-warn" />, phrase: 'ВСЕ привычки выполнены! Это лучший день!' } : { icon: <Heart className="text-primary" />, phrase: 'Молодец! Котик доволен.' };
          setCatPopup({ show: true, isAllDone, img: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=800&q=80', mood });
        });
    }
  };

  // --- Navigation ---
  const navItems = [
    { id: 'overview', icon: <Home size={20} />, label: 'Обзор' },
    { id: 'habits', icon: <CheckCircle2 size={20} />, label: 'Привычки' },
    { id: 'goals', icon: <Target size={20} />, label: 'Цели' },
    { id: 'calendar', icon: <CalendarIcon size={20} />, label: 'Календарь' },
    { id: 'journal', icon: <BookOpen size={20} />, label: 'Дневник' },
    { id: 'tasks', icon: <ListTodo size={20} />, label: 'Задачи' },
    { id: 'pomodoro', icon: <Timer size={20} />, label: 'Фокус' },
    { id: 'balance', icon: <PieChart size={20} />, label: 'Баланс' },
    { id: 'cat', icon: <Cat size={20} />, label: 'Мой Кот' },
    { id: 'analytics', icon: <BarChart3 size={20} />, label: 'Аналитика' },
    { id: 'heatmap', icon: <Flame size={20} />, label: 'Теплокарта' },
    { id: 'settings', icon: <Settings size={20} />, label: 'Настройки' },
  ];

  // --- Helpers ---
  const overallStreak = useMemo(() => {
    let streak = 0;
    const d = new Date();
    const today = todayISO();
    const hasActivity = (date: string) => 
      state.habits.some(h => h.dates.includes(date)) || state.journalEntries[date]?.mood;
    
    if (!hasActivity(today)) d.setDate(d.getDate() - 1);
    while (streak < 366 && hasActivity(isoDate(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [state]);

  const moodData = useMemo(() => {
    const labels = [];
    const data = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = isoDate(d);
      labels.push(d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
      data.push((state.journalEntries[iso] as JournalEntry)?.mood || null);
    }
    return { labels, data };
  }, [state]);

  const streakForHabit = (h: Habit) => {
    const dates = new Set(h.dates);
    let streak = 0;
    const d = new Date();
    if (!dates.has(todayISO())) d.setDate(d.getDate() - 1);
    while (streak < 366 && dates.has(isoDate(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  };

  // --- Render Sections ---

  const renderPomodoro = () => (
    <div className="flex flex-col items-center justify-center space-y-8 py-12">
      <div className="relative w-64 h-64 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90">
          <circle 
            cx="128" cy="128" r="120" 
            className="stroke-line fill-none" 
            strokeWidth="8" 
          />
          <motion.circle 
            cx="128" cy="128" r="120" 
            className="stroke-primary fill-none" 
            strokeWidth="8" 
            strokeLinecap="round"
            initial={{ strokeDasharray: 754, strokeDashoffset: 754 }}
            animate={{ 
              strokeDashoffset: 754 - (754 * (state.pomodoro.timeLeft / (state.pomodoro.mode === 'work' ? 1500 : 300))) 
            }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className="text-5xl font-black font-mono">{formatTime(state.pomodoro.timeLeft)}</div>
          <div className="text-muted font-bold uppercase tracking-widest text-xs mt-2">
            {state.pomodoro.mode === 'work' ? 'Фокус' : 'Перерыв'}
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <button className="btn px-8 py-4 text-lg" onClick={togglePomodoro}>
          {state.pomodoro.isActive ? 'Пауза' : 'Старт'}
        </button>
        <button className="chip-btn p-4" onClick={resetPomodoro}>
          <RefreshCw size={24} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        <div className="card text-center">
          <div className="text-2xl font-bold">{state.pomodoro.sessionsCompleted}</div>
          <div className="text-xs text-muted">сессий сегодня</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold">{Math.floor(state.pomodoro.sessionsCompleted * 25 / 60)}ч {state.pomodoro.sessionsCompleted * 25 % 60}м</div>
          <div className="text-xs text-muted">время в фокусе</div>
        </div>
      </div>
    </div>
  );

  const renderBalance = () => {
    const categories = Object.keys(state.balance);
    const angleStep = (Math.PI * 2) / categories.length;
    
    return (
      <div className="space-y-8">
        <div className="card pattern-dots flex flex-col items-center justify-center py-12 overflow-hidden">
          <h3 className="text-xl font-bold mb-8">Колесо баланса</h3>
          <div className="relative w-80 h-80">
            <svg className="w-full h-full overflow-visible">
              {/* Grid Lines */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                <circle 
                  key={r} 
                  cx="160" cy="160" r={r * 15} 
                  className="stroke-line fill-none" 
                  strokeWidth="1" 
                  strokeDasharray="4 4"
                />
              ))}
              
              {/* Category Lines */}
              {categories.map((cat, i) => {
                const x = 160 + Math.cos(i * angleStep) * 150;
                const y = 160 + Math.sin(i * angleStep) * 150;
                return (
                  <line 
                    key={cat} 
                    x1="160" y1="160" x2={x} y2={y} 
                    className="stroke-line" 
                    strokeWidth="1" 
                  />
                );
              })}

              {/* Data Shape */}
              <polygon 
                points={categories.map((cat, i) => {
                  const r = state.balance[cat] * 15;
                  const x = 160 + Math.cos(i * angleStep) * r;
                  const y = 160 + Math.sin(i * angleStep) * r;
                  return `${x},${y}`;
                }).join(' ')}
                className="fill-primary/30 stroke-primary"
                strokeWidth="3"
              />

              {/* Labels */}
              {categories.map((cat, i) => {
                const x = 160 + Math.cos(i * angleStep) * 175;
                const y = 160 + Math.sin(i * angleStep) * 175;
                return (
                  <text 
                    key={cat} 
                    x={x} y={y} 
                    className="fill-text text-[10px] font-bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {BASE_CAT_EMOJI[cat]}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map(cat => (
            <div key={cat} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{BASE_CAT_EMOJI[cat]}</span>
                <span className="font-bold capitalize">{cat}</span>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="1" max="10" 
                  value={state.balance[cat]} 
                  onChange={(e) => handleStateChange(prev => ({
                    ...prev,
                    balance: { ...prev.balance, [cat]: parseInt(e.target.value) }
                  }))}
                  className="w-24 accent-primary"
                />
                <span className="font-black text-primary w-6 text-center">{state.balance[cat]}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCat = () => (
    <div className="flex flex-col items-center space-y-8 py-8">
      <div className="relative">
        <motion.div 
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="filter drop-shadow-2xl text-primary"
        >
          <Cat size={120} strokeWidth={1.5} />
        </motion.div>
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-black/20 rounded-full blur-md" />
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-3xl font-black">{state.cat.name}</h3>
        <div className="text-primary font-bold flex items-center justify-center gap-2">
          <Star size={16} className="fill-primary" />
          Уровень {state.cat.level}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex justify-between text-xs font-bold text-muted uppercase tracking-widest">
          <span>Опыт</span>
          <span>{state.cat.exp} / {state.cat.level * 100}</span>
        </div>
        <div className="h-4 bg-surface-2 rounded-full border border-line overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-primary to-primary-2"
            initial={{ width: 0 }}
            animate={{ width: `${(state.cat.exp / (state.cat.level * 100)) * 100}%` }}
          />
        </div>
      </div>

      <div className="card pattern-stars w-full max-w-md">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Trophy size={18} className="text-primary" /> Достижения
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {state.achievements.map(a => (
            <div 
              key={a.id} 
              className={cn(
                "p-3 rounded-xl border flex flex-col items-center text-center gap-1 transition-all",
                a.unlockedAt ? "bg-primary/10 border-primary shadow-sm" : "bg-surface-2 border-line opacity-50 grayscale"
              )}
            >
              <div className="text-2xl">{a.icon}</div>
              <div className="text-xs font-bold">{a.title}</div>
              <div className="text-[10px] text-muted leading-tight">{a.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card pattern-waves w-full max-w-md">
        <h4 className="font-bold mb-4">Как прокачать кота?</h4>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-good/20 text-good flex items-center justify-center text-xs">+10</div>
            <span>Отмечай привычки вовремя</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">+20</div>
            <span>Закрывай цели и задачи</span>
          </li>
          <li className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs">+5</div>
            <span>Пей воду и веди дневник</span>
          </li>
        </ul>
      </div>
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-6">
      <div className="card pattern-stars">
        <h3 className="text-lg font-bold mb-4">Новая цель</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input id="goalName" className="p-3 rounded-xl bg-surface-2 border border-line" placeholder="Название цели" />
          <input id="goalTarget" type="number" className="p-3 rounded-xl bg-surface-2 border border-line" placeholder="Целевое значение" />
          <input id="goalUnit" className="p-3 rounded-xl bg-surface-2 border border-line" placeholder="ед., %, стр." />
          <input id="goalDeadline" type="date" className="p-3 rounded-xl bg-surface-2 border border-line" />
        </div>
        <button 
          className="btn w-full mt-4"
          onClick={() => {
            const name = (document.getElementById('goalName') as HTMLInputElement).value.trim();
            const target = +(document.getElementById('goalTarget') as HTMLInputElement).value || 100;
            const unit = (document.getElementById('goalUnit') as HTMLInputElement).value.trim();
            const deadline = (document.getElementById('goalDeadline') as HTMLInputElement).value || '';
            if (!name) return;
            handleStateChange(prev => ({
              ...prev,
              goals: [{ id: id(), name, progress: 0, target, unit, deadline, history: [] }, ...prev.goals]
            }));
            showToast('Цель поставлена! 🎯', 'success');
          }}
        >
          Добавить цель
        </button>
      </div>

      <div className="space-y-4">
        {state.goals.map(g => {
          const pct = Math.max(0, Math.min(100, (g.progress / g.target) * 100 || 0));
          return (
            <div key={g.id} className="card space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-lg">{g.name}</div>
                  <div className="text-xs text-muted">Дедлайн: {g.deadline || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tag">{g.progress}/{g.target} {g.unit}</span>
                  <button 
                    className="p-2 text-bad hover:bg-bad/10 rounded-lg"
                    onClick={() => handleStateChange(prev => ({ ...prev, goals: prev.goals.filter(x => x.id !== g.id) }))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="progress">
                <span style={{ width: `${pct}%` }}></span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  className="chip-btn px-4"
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    goals: prev.goals.map(x => x.id === g.id ? { ...x, progress: Math.max(0, x.progress - 1) } : x)
                  }))}
                >
                  −
                </button>
                <button 
                  className="chip-btn px-4"
                  onClick={() => handleStateChange(prev => {
                    const next = { ...prev };
                    const goal = next.goals.find(x => x.id === g.id)!;
                    goal.progress = Math.min(goal.target, goal.progress + 1);
                    if (goal.progress >= goal.target) showToast('Цель достигнута! 🎉', 'success');
                    return next;
                  })}
                >
                  +
                </button>
                <div className="text-xs text-muted flex-1 text-right">
                  {pct === 100 ? 'Цель достигнута!' : `Осталось ${g.target - g.progress} ${g.unit}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCalendar = () => {
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const startOffset = (new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i - startOffset + 1);
      days.push(d);
    }

    return (
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Календарь</h3>
          <div className="flex items-center gap-2">
            <button className="chip-btn" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
            <span className="font-bold min-w-[120px] text-center">{viewDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</span>
            <button className="chip-btn" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-muted py-2">{d}</div>
          ))}
          {days.map((d, i) => {
            const iso = isoDate(d);
            const isToday = iso === todayISO();
            const isOtherMonth = d.getMonth() !== viewDate.getMonth();
            const entry = state.journalEntries[iso];
            const habitsCount = state.habits.filter(h => h.dates.includes(iso)).length;

            return (
              <button 
                key={i}
                onClick={() => { setSelectedDate(iso); setIsDayModalOpen(true); }}
                className={cn(
                  "aspect-square rounded-xl border border-line p-1 flex flex-col justify-between items-start transition-all",
                  isOtherMonth ? "opacity-20" : "hover:bg-surface-2",
                  isToday && "border-primary ring-1 ring-primary/30"
                )}
              >
                <span className="text-xs font-bold">{d.getDate()}</span>
                <div className="flex flex-wrap gap-0.5">
                  {entry?.mood && <div className="w-1.5 h-1.5 rounded-full bg-good" />}
                  {habitsCount > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  {entry?.note && <div className="w-1.5 h-1.5 rounded-full bg-primary-2" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAnalytics = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card pattern-waves">
            <h3 className="text-lg font-bold mb-4">График настроения</h3>
            <div className="h-48">
              <Line 
                data={{
                  labels: moodData.labels,
                  datasets: [{
                    label: 'Настроение',
                    data: moodData.data,
                    borderColor: '#ff5dac',
                    backgroundColor: 'rgba(255, 93, 172, 0.2)',
                    tension: 0.4,
                    fill: true,
                    spanGaps: true
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { y: { min: 1, max: 5, ticks: { stepSize: 1 } } }
                }}
              />
            </div>
          </div>
          <div className="card pattern-dots">
            <h3 className="text-lg font-bold mb-4">Бережная поддержка</h3>
            <div className="space-y-3">
              <div className="insight">
                {overallStreak > 3 ? `Ты держишь ритм уже ${overallStreak} дня! Это потрясающе.` : "Каждый новый день — это шанс начать заново. Я верю в тебя!"}
              </div>
              <div className="insight bg-accent/10 border-accent/20">
                {state.tasks.filter(t => t.done).length > 0 ? "Ты продуктивна! Завершённые задачи — это повод для гордости." : "Не спеши, выбери одну маленькую задачу на сегодня."}
              </div>
            </div>
          </div>
        </div>
        <div className="card pattern-waves">
          {renderHeatmap()}
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card pattern-stars">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Flame size={18} className="text-primary" /> Серия
          </h3>
          <div className="text-4xl font-extrabold text-primary">{overallStreak}</div>
          <div className="text-muted text-sm">дней с ритмом</div>
        </div>
        <div className="card pattern-dots">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary-2" /> Привычки сегодня
          </h3>
          <div className="text-4xl font-extrabold text-primary-2">
            {state.habits.filter(h => h.dates.includes(todayISO())).length}/{state.habits.length}
          </div>
          <div className="text-muted text-sm">маленьких побед</div>
        </div>
        <div className="card pattern-waves">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Target size={18} className="text-accent" /> Фокус дня
          </h3>
          <div className="text-4xl font-extrabold text-accent">
            {state.tasks.filter(t => t.focus && !t.done).length}
          </div>
          <div className="text-muted text-sm">главные задачи</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card pattern-dots">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" /> Инсайт
          </h3>
          <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 text-sm leading-relaxed">
            {state.habits.length > 0 ? "Ты отлично справляешься! Маленькие шаги ведут к большим переменам." : "Начни с малого — добавь свою первую привычку сегодня!"}
          </div>
        </div>
        <div className="card pattern-stars">
          <h3 className="text-lg font-bold mb-4">Цитата дня</h3>
          <div className="italic text-lg mb-2">"{state.settings.customQuote?.text || QUOTE_POOL[0].text}"</div>
          <div className="text-muted text-sm">— {state.settings.customQuote?.author || QUOTE_POOL[0].author}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card pattern-waves">
          <h3 className="text-lg font-bold mb-4">Теплокарта за год</h3>
          <div id="overviewHeat" className="overflow-x-auto">
            {renderHeatmap()}
          </div>
        </div>
        <div className="card pattern-dots">
          <h3 className="text-lg font-bold mb-4">Ближайший прогноз</h3>
          <div className="space-y-3">
            {state.goals.map(g => (
              <div key={g.id} className="p-3 rounded-xl bg-surface-2 border border-line">
                <div className="font-bold text-sm">{g.name}</div>
                <div className="text-xs text-muted mt-1">
                  {g.progress >= g.target ? 'Цель достигнута!' : `Осталось ${g.target - g.progress} ${g.unit}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderHabits = () => (
    <div className="space-y-6">
      <div className="card pattern-waves">
        <h3 className="text-lg font-bold mb-4">Новая привычка</h3>
        <div className="flex flex-wrap gap-2">
          <input 
            id="newHabitName" 
            className="flex-1 min-w-[200px] p-3 rounded-xl bg-surface-2 border border-line"
            placeholder="Например, читать 10 минут" 
          />
          <input 
            id="newHabitIcon" 
            className="w-20 p-3 rounded-xl bg-surface-2 border border-line text-center"
            placeholder="A" 
          />
          <button 
            className="btn"
            onClick={() => {
              const name = (document.getElementById('newHabitName') as HTMLInputElement).value.trim();
              const icon = (document.getElementById('newHabitIcon') as HTMLInputElement).value.trim() || 'H';
              if (!name) return;
              handleStateChange(prev => ({
                ...prev,
                habits: [{ id: id(), name, icon, dates: [] }, ...prev.habits]
              }));
              (document.getElementById('newHabitName') as HTMLInputElement).value = '';
              showToast('Привычка добавлена!', 'success');
            }}
          >
            Добавить
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {state.habits.map(h => (
          <div key={h.id} className="card flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="text-2xl">{h.icon}</div>
              <div>
                <div className="font-bold">{h.name}</div>
                <div className="text-xs text-muted">Серия: {streakForHabit(h)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                className={cn(
                  "chip-btn",
                  h.dates.includes(todayISO()) && "bg-primary text-white border-transparent"
                )}
                onClick={() => handleHabitComplete(h.id)}
              >
                {h.dates.includes(todayISO()) ? 'Готово' : 'Отметить'}
              </button>
              <button 
                className="p-2 text-bad opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => {
                  if (confirm('Удалить привычку?')) {
                    handleStateChange(prev => ({
                      ...prev,
                      habits: prev.habits.filter(x => x.id !== h.id)
                    }));
                  }
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6">
      <div className="card pattern-dots">
        <h3 className="text-lg font-bold mb-4">Новая задача</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input 
            id="taskText" 
            className="p-3 rounded-xl bg-surface-2 border border-line md:col-span-2"
            placeholder="Что нужно сделать?" 
          />
          <select id="taskPriority" className="p-3 rounded-xl bg-surface-2 border border-line">
            <option value="urgent">Срочно</option>
            <option value="important">Важно</option>
            <option value="someday">Когда-нибудь</option>
          </select>
          <select id="taskRecurring" className="p-3 rounded-xl bg-surface-2 border border-line">
            <option value="none">Без повтора</option>
            <option value="daily">Каждый день</option>
            <option value="weekly">Раз в неделю</option>
            <option value="mon">Каждый понедельник</option>
          </select>
          <select id="taskWeekday" className="p-3 rounded-xl bg-surface-2 border border-line">
            <option value="">День недели (для еженедельных)</option>
            <option value="1">Понедельник</option>
            <option value="2">Вторник</option>
            <option value="3">Среда</option>
            <option value="4">Четверг</option>
            <option value="5">Пятница</option>
            <option value="6">Суббота</option>
            <option value="0">Воскресенье</option>
          </select>
        </div>
        <button 
          className="btn w-full mt-4"
          onClick={() => {
            const text = (document.getElementById('taskText') as HTMLInputElement).value.trim();
            if (!text) return;
            const priority = (document.getElementById('taskPriority') as HTMLSelectElement).value as any;
            const recurring = (document.getElementById('taskRecurring') as HTMLSelectElement).value as any;
            const weekdayVal = (document.getElementById('taskWeekday') as HTMLSelectElement).value;
            const weekday = weekdayVal === "" ? null : parseInt(weekdayVal);
            handleStateChange(prev => ({
              ...prev,
              tasks: [{ id: id(), text, done: false, priority, recurring, weekday, tags: [], focus: false }, ...prev.tasks]
            }));
            (document.getElementById('taskText') as HTMLInputElement).value = '';
            showToast('Задача добавлена!', 'success');
          }}
        >
          Добавить задачу
        </button>
      </div>

      <div className="space-y-4">
        {['urgent', 'important', 'someday'].map(prio => (
          <div key={prio} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted px-2 flex items-center gap-2">
              <Circle size={8} className={cn("fill-current", prio === 'urgent' ? "text-bad" : prio === 'important' ? "text-warn" : "text-line")} />
              {prio === 'urgent' ? 'Срочно' : prio === 'important' ? 'Важно' : 'Когда-нибудь'}
            </div>
            {state.tasks.filter(t => t.priority === prio).map(t => (
              <div key={t.id} className="card flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      playSound('click');
                      handleStateChange(prev => {
                        const next = {
                          ...prev,
                          tasks: prev.tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x)
                        };
                        if (!t.done) {
                          checkCatReward(next, 20);
                        }
                        return next;
                      });
                    }}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                      t.done ? "bg-good border-good text-white" : "border-line"
                    )}
                  >
                    {t.done && <CheckCircle2 size={14} />}
                  </button>
                  <span className={cn("font-medium", t.done && "line-through text-muted")}>{t.text}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    className={cn("p-2 rounded-lg transition-colors", t.focus ? "text-accent bg-accent/10" : "text-muted hover:bg-surface-2")}
                    onClick={() => handleStateChange(prev => ({
                      ...prev,
                      tasks: prev.tasks.map(x => x.id === t.id ? { ...x, focus: !x.focus } : x)
                    }))}
                  >
                    <Sparkles size={18} />
                  </button>
                  <button 
                    className="p-2 text-bad opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleStateChange(prev => ({
                      ...prev,
                      tasks: prev.tasks.filter(x => x.id !== t.id)
                    }))}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  const renderJournal = () => {
    const todayEntry = (state.journalEntries[todayISO()] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };
    return (
      <div className="space-y-6">
        <div className="card pattern-stars space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Дневник сегодня</h3>
            <div className="text-sm text-muted">{todayISO()}</div>
          </div>
          <div className="flex justify-between gap-2">
            {MOOD_SCALE.map(m => (
              <button 
                key={m.v}
                onClick={() => {
                  playSound('pop');
                  handleStateChange(prev => {
                    const date = todayISO();
                    const entry = (prev.journalEntries[date] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };
                    const next = {
                      ...prev,
                      journalEntries: { ...prev.journalEntries, [date]: { ...entry, mood: m.v } }
                    };
                    if (entry.mood === null) {
                      checkCatReward(next, 5);
                    }
                    return next;
                  });
                }}
                className={cn(
                  "mood-btn flex-1 flex flex-col items-center justify-center gap-1",
                  todayEntry.mood === m.v && "active"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mb-1",
                  todayEntry.mood === m.v ? "bg-primary/20" : "bg-surface"
                )}>
                  {m.v >= 4 ? <Sparkles size={20} className="text-primary" /> : m.v === 3 ? <Circle size={20} className="text-muted" /> : <Moon size={20} className="text-primary-2" />}
                </div>
                <span className="text-[10px] uppercase font-bold text-muted">{m.l}</span>
              </button>
            ))}
          </div>
          <textarea 
            className="w-full p-4 rounded-2xl bg-surface-2 border border-line min-h-[150px] focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Что важного произошло сегодня?"
            value={todayEntry.note}
            onChange={(e) => {
              const val = e.target.value;
              handleStateChange(prev => {
                const date = todayISO();
                const entry = (prev.journalEntries[date] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };
                return {
                  ...prev,
                  journalEntries: { ...prev.journalEntries, [date]: { ...entry, note: val } }
                };
              });
            }}
          />
          <div className="flex gap-2">
            <button 
              className={cn("btn flex-1 gap-2", isAIThinking && "opacity-50 cursor-wait")}
              onClick={() => askGemini(`Пользователь написал в дневнике: "${todayEntry.note}". Настроение: ${MOOD_SCALE.find(m => m.v === todayEntry.mood)?.l || 'не указано'}. Задай 2-3 наводящих вопроса для глубокой рефлексии или дай бережный совет.`)}
              disabled={isAIThinking}
            >
              {isAIThinking ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Поговорить о дне
            </button>
            <button 
              className={cn("chip-btn p-3", isRecording && "bg-bad text-white border-transparent animate-pulse")}
              onClick={toggleRecording}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold px-2">Прошлые записи</h3>
          {Object.entries(state.journalEntries)
            .filter(([date, e]) => date !== todayISO() && ((e as JournalEntry).note || (e as JournalEntry).mood))
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, e]) => {
              const entry = e as JournalEntry;
              return (
                <div key={date} className="card space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="font-bold">{date}</div>
                    {entry.mood && <div className="text-xl">{MOOD_SCALE.find(m => m.v === entry.mood)?.e}</div>}
                  </div>
                  {entry.note && <div className="text-sm text-muted whitespace-pre-wrap">{entry.note}</div>}
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  const renderHeatmap = () => {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const days = [];
    for (let i = 0; i < 366; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d.getFullYear() === year) days.push(isoDate(d));
    }

    return (
      <div id="heatmap-section">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Активность {year}</h3>
          <div className="flex gap-2">
            <button 
              className="chip-btn p-2"
              onClick={() => handleExport('heatmap-section', `heatmap-${year}`)}
              title="Экспорт в PNG"
            >
              <Share2 size={18} />
            </button>
            <button 
              className={cn("chip-btn text-xs px-3 py-1 min-h-0", heatmapMode === 'grid' && "bg-primary text-white border-transparent")}
              onClick={() => setHeatmapMode('grid')}
            >
              Сетка
            </button>
            <button 
              className={cn("chip-btn text-xs px-3 py-1 min-h-0", heatmapMode === 'radial' && "bg-primary text-white border-transparent")}
              onClick={() => setHeatmapMode('radial')}
            >
              Кольцо
            </button>
          </div>
        </div>

        {heatmapMode === 'grid' ? (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: 53 }).map((_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const dateIdx = weekIdx * 7 + dayIdx;
                    const date = days[dateIdx];
                    if (!date) return <div key={dayIdx} className="w-4 h-4" />;
                    
                    const habitsCount = state.habits.filter(h => h.dates.includes(date)).length;
                    const entry = state.journalEntries[date];
                    
                    const val = Math.min(4,
                      (habitsCount > 0 ? 1 : 0) + (entry?.note ? 1 : 0) +
                      (entry?.mood ? 1 : 0) + (habitsCount >= 2 ? 1 : 0)
                    );

                    return (
                      <div 
                        key={dayIdx} 
                        className={cn(
                          "heatcell w-4 h-4 rounded-sm",
                          val === 1 && "lv1",
                          val === 2 && "lv2",
                          val === 3 && "lv3",
                          val === 4 && "lv4",
                          date === todayISO() && "today-cell"
                        )}
                        onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); }}
                        title={`${date}: ${val} баллов`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <div className="relative w-64 h-64 rounded-full border-8 border-line flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold">{year}</div>
                <div className="text-[10px] text-muted uppercase font-bold">Активность</div>
              </div>
              {/* Simplified radial visualization using CSS conic-gradient */}
              <div 
                className="absolute inset-0 rounded-full opacity-20"
                style={{
                  background: `conic-gradient(from 0deg, ${days.map((d, i) => {
                    const habitsCount = state.habits.filter(h => h.dates.includes(d)).length;
                    const entry = state.journalEntries[d];
                    
                    const val = Math.min(4, (habitsCount > 0 ? 1 : 0) + (entry?.note ? 1 : 0) + (entry?.mood ? 1 : 0) + (habitsCount >= 2 ? 1 : 0));
                    const color = val === 0 ? 'transparent' : val === 1 ? 'rgba(255,93,172,0.2)' : val === 2 ? 'rgba(255,93,172,0.5)' : val === 3 ? 'rgba(255,93,172,0.8)' : '#ff5dac';
                    return `${color} ${(i / days.length) * 100}% ${((i + 1) / days.length) * 100}%`;
                  }).join(', ')})`
                }}
              />
            </div>
          </div>
        )}
        
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span>Меньше</span>
          <div className="w-3 h-3 rounded-sm bg-bg-soft border border-line" />
          <div className="w-3 h-3 rounded-sm lv1" />
          <div className="w-3 h-3 rounded-sm lv2" />
          <div className="w-3 h-3 rounded-sm lv3" />
          <div className="w-3 h-3 rounded-sm lv4" />
          <span>Больше</span>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="card pattern-stars">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Moon size={18} className="text-primary" /> Профиль
        </h3>
        <div className="space-y-4">
          <div className="field">
            <label className="text-sm font-bold text-muted mb-2 block">Твоё имя</label>
            <div className="flex gap-2">
              <input 
                className="flex-1 p-3 rounded-xl bg-surface-2 border border-line"
                value={state.settings.userName}
                onChange={(e) => handleStateChange(prev => ({
                  ...prev,
                  settings: { ...prev.settings, userName: e.target.value }
                }))}
                placeholder="Например, Ириночка" 
              />
            </div>
          </div>
          
          <div className="pt-4 border-t border-line">
            <h4 className="text-sm font-bold text-muted mb-3 flex items-center gap-2">
              <RefreshCw size={14} /> Синхронизация
            </h4>
            {user ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} className="w-10 h-10 rounded-full border-2 border-primary" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                      <Moon size={20} />
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-sm">{user.displayName}</div>
                    <div className="text-xs text-muted">{user.email}</div>
                  </div>
                </div>
                <button 
                  className="p-2 text-bad hover:bg-bad/10 rounded-lg transition-colors"
                  onClick={() => signOut(auth)}
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button 
                className="btn w-full flex items-center justify-center gap-2"
                onClick={() => signInWithPopup(auth, googleProvider)}
              >
                <LogIn size={20} />
                Войти через Google
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card pattern-dots">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Tag size={18} className="text-primary" /> Категории
        </h3>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              id="newCatEmoji" 
              className="w-16 p-3 rounded-xl bg-surface-2 border border-line text-center"
              placeholder="T" 
            />
            <input 
              id="newCatName" 
              className="flex-1 p-3 rounded-xl bg-surface-2 border border-line"
              placeholder="Новая категория" 
            />
            <button 
              className="btn"
              onClick={() => {
                const name = (document.getElementById('newCatName') as HTMLInputElement).value.trim();
                const emoji = (document.getElementById('newCatEmoji') as HTMLInputElement).value.trim() || 'T';
                if (!name) return;
                handleStateChange(prev => ({
                  ...prev,
                  customCategories: [...(prev.customCategories || []), { name, emoji }]
                }));
                (document.getElementById('newCatName') as HTMLInputElement).value = '';
                showToast('Категория добавлена!', 'success');
              }}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(state.customCategories || []).map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-surface-2 border border-line px-3 py-1.5 rounded-xl group">
                <span>{cat.emoji}</span>
                <span className="text-sm font-medium">{cat.name}</span>
                <button 
                  className="text-bad opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    customCategories: prev.customCategories.filter((_, i) => i !== idx)
                  }))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card pattern-stars">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Palette size={18} className="text-primary" /> Интерфейс
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {['light', 'dark', 'pink', 'cyberpunk'].map(t => (
              <button 
                key={t}
                onClick={() => {
                  playSound('click');
                  handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, theme: t as any }
                  }));
                }}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                  state.settings.theme === t ? "border-primary bg-primary/10" : "border-line hover:border-primary/50"
                )}
              >
                {t === 'light' ? <Sun size={20} /> : t === 'dark' ? <Moon size={20} /> : t === 'pink' ? <Palette size={20} /> : <Zap size={20} />}
                <span className="text-xs font-bold capitalize">
                  {t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : t === 'pink' ? 'Розовая' : 'Киберпанк'}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
              <div>
                <div className="font-bold text-sm">Живой интерфейс</div>
                <div className="text-xs text-muted">Динамическое освещение и блики</div>
              </div>
              <button 
                onClick={() => {
                  playSound('pop');
                  handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, dynamicLighting: !prev.settings.dynamicLighting }
                  }));
                }}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  state.settings.dynamicLighting ? "bg-good" : "bg-line"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                  state.settings.dynamicLighting ? "left-7" : "left-1"
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
              <div>
                <div className="font-bold text-sm">Звуковые эффекты</div>
                <div className="text-xs text-muted">Нежные клики и уведомления</div>
              </div>
              <button 
                onClick={() => {
                  playSound('pop');
                  handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, soundEffects: !prev.settings.soundEffects }
                  }));
                }}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative",
                  state.settings.soundEffects ? "bg-good" : "bg-line"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                  state.settings.soundEffects ? "left-7" : "left-1"
                )} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Bell size={18} className="text-primary" /> Уведомления
        </h3>
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
          <div>
            <div className="font-bold text-sm">Напоминания</div>
            <div className="text-xs text-muted">Браузерные уведомления</div>
          </div>
          <button 
            onClick={() => {
              if (!state.settings.notifEnabled) {
                Notification.requestPermission().then(perm => {
                  if (perm === 'granted') {
                    handleStateChange(prev => ({
                      ...prev,
                      settings: { ...prev.settings, notifEnabled: true }
                    }));
                    showToast('Уведомления включены!', 'success');
                  } else {
                    showToast('Доступ к уведомлениям отклонен', 'error');
                  }
                });
              } else {
                handleStateChange(prev => ({
                  ...prev,
                  settings: { ...prev.settings, notifEnabled: false }
                }));
              }
            }}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              state.settings.notifEnabled ? "bg-good" : "bg-line"
            )}
          >
            <div className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
              state.settings.notifEnabled ? "left-7" : "left-1"
            )} />
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold mb-4">💾 Данные</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button 
            className="btn-secondary flex items-center justify-center gap-2"
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'diskoshagi-backup.json';
              a.click();
            }}
          >
            <Download size={18} /> Экспорт JSON
          </button>
          <button 
            className="btn-secondary flex items-center justify-center gap-2"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (re) => {
                    try {
                      const parsed = JSON.parse(re.target?.result as string);
                      handleStateChange(() => parsed);
                      showToast('Данные импортированы! ✅', 'success');
                    } catch (err) {
                      showToast('Ошибка импорта 🚫', 'error');
                    }
                  };
                  reader.readAsText(file);
                }
              };
              input.click();
            }}
          >
            <Upload size={18} /> Импорт JSON
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen flex", isPartyMode && "party-active")} data-theme={state.settings.theme}>
      <DynamicLighting enabled={state.settings.dynamicLighting} />
      {/* Onboarding */}
      {showOnboarding && (
        <OnboardingModal 
          step={onboardingStep} 
          onNext={() => {
            if (onboardingStep < 3) {
              setOnboardingStep(onboardingStep + 1);
            } else {
              setShowOnboarding(false);
              handleStateChange(prev => ({
                ...prev,
                settings: { ...prev.settings, hasSeenOnboarding: true }
              }));
            }
          }}
          onSkip={() => {
            setShowOnboarding(false);
            handleStateChange(prev => ({
              ...prev,
              settings: { ...prev.settings, hasSeenOnboarding: true }
            }));
          }}
        />
      )}

      {/* Dynamic Background */}
      <div className="bg-lamps">
        <div className="lamp w-96 h-96 bg-primary top-[-10%] left-[-10%]" />
        <div className="lamp w-80 h-80 bg-primary-2 bottom-[10%] right-[-5%]" style={{ animationDelay: '-5s' }} />
        <div className="lamp w-64 h-64 bg-accent top-[40%] left-[20%]" style={{ animationDelay: '-10s' }} />
      </div>

      <audio ref={audioRef} loop src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" />

      <aside className="hidden lg:flex flex-col w-72 bg-surface border-r border-line p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 cursor-pointer group" onClick={handleLogoClick}>
          <div className={cn("w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-2 flex items-center justify-center text-white shadow-lg transition-transform", partyClicks > 0 && "scale-110")}>
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none">Дискошажки</h1>
            <p className="text-xs text-muted mt-1">трекер с блёстками</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all",
                activeSection === item.id 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-text hover:bg-surface-2"
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-line space-y-2">
          <button 
            className="w-full text-left p-3 rounded-xl bg-surface-2 border border-line text-sm font-bold hover:bg-line/20 transition-colors flex items-center gap-2"
            onClick={() => showToast(weeklyReport(), 'info')}
          >
            <BarChart3 size={18} /> Отчёт недели
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 max-w-5xl mx-auto w-full pb-24 lg:pb-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-display text-3xl lg:text-4xl font-bold flex items-center gap-3">
              <motion.span 
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="text-primary"
              >
                <Sparkles size={32} />
              </motion.span>
              {new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}
              {state.settings.userName ? `, ${state.settings.userName}` : ''}
            </h2>
            <p className="text-muted mt-1">
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              className="chip-btn lg:hidden"
              onClick={() => setIsDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
            <button className="chip-btn" onClick={() => setIsSearchOpen(true)}>
              <Search size={20} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeSection === 'overview' && renderOverview()}
            {activeSection === 'habits' && renderHabits()}
            {activeSection === 'goals' && renderGoals()}
            {activeSection === 'calendar' && renderCalendar()}
            {activeSection === 'journal' && renderJournal()}
            {activeSection === 'tasks' && renderTasks()}
            {activeSection === 'pomodoro' && renderPomodoro()}
            {activeSection === 'balance' && renderBalance()}
            {activeSection === 'cat' && renderCat()}
            {activeSection === 'analytics' && renderAnalytics()}
            {activeSection === 'heatmap' && renderHeatmap()}
            {activeSection === 'settings' && renderSettings()}
            {!['overview', 'habits', 'goals', 'calendar', 'journal', 'tasks', 'pomodoro', 'balance', 'cat', 'analytics', 'heatmap', 'settings'].includes(activeSection) && (
              <div className="card flex flex-col items-center justify-center py-20 text-center">
                <div className="text-6xl mb-4 text-primary"><RefreshCw size={64} className="animate-spin" /></div>
                <h3 className="text-xl font-bold">Раздел в разработке</h3>
                <p className="text-muted">Скоро здесь будет магия</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Nav - Bottom */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-line px-4 py-2 flex justify-around items-center z-40 pb-safe">
        {navItems.slice(0, 5).map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
              activeSection === item.id ? "text-primary" : "text-muted"
            )}
          >
            {item.icon}
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Party Overlay */}
      <div id="partyOverlay" className="fixed inset-0 pointer-events-none z-[9990] hidden" />
      <div id="partyBeatFlash" className="fixed inset-0 pointer-events-none z-[9991] bg-white hidden" />

      {/* Toasts */}
      <div className="fixed bottom-24 right-4 flex flex-col gap-2 z-[2000] pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => {}} />
          ))}
        </AnimatePresence>
      </div>

      {/* Cat Popup */}
      <AnimatePresence>
        {catPopup?.show && (
          <div className="fixed inset-0 flex items-center justify-center z-[10000] p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
              onClick={() => setCatPopup(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-surface border-2 border-primary rounded-[2rem] shadow-2xl overflow-hidden max-w-sm w-full"
            >
              <div className="bg-gradient-to-br from-primary/10 to-primary-2/10 p-4 border-b border-primary/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                  {catPopup.mood.icon}
                </div>
                <p className="font-bold text-primary leading-tight">{catPopup.mood.phrase}</p>
              </div>
              <div className="h-64 bg-bg-soft relative">
                <img src={catPopup.img} className="w-full h-full object-cover" alt="Cat" />
              </div>
              <div className="p-4 flex justify-between items-center bg-surface">
                <span className="text-xs text-muted italic flex items-center gap-1">
                  <PawPrint size={14} /> Котик дня
                </span>
                <button 
                  className="btn px-6 py-2 min-h-0 text-sm"
                  onClick={() => setCatPopup(null)}
                >
                  Я умница
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Day Modal */}
      <AnimatePresence>
        {isDayModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[6000] p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setIsDayModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-surface border border-line rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">День {selectedDate}</h3>
                <button onClick={() => setIsDayModalOpen(false)} className="p-2 hover:bg-surface-2 rounded-xl">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-muted block">Настроение</label>
                <div className="flex justify-between gap-2">
                  {MOOD_SCALE.map(m => (
                    <button 
                      key={m.v}
                      onClick={() => handleStateChange(prev => {
                        const entry = (prev.journalEntries[selectedDate] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };
                        return {
                          ...prev,
                          journalEntries: { ...prev.journalEntries, [selectedDate]: { ...entry, mood: m.v } }
                        };
                      })}
                      className={cn(
                        "mood-btn flex-1 flex flex-col items-center justify-center gap-1",
                        (state.journalEntries[selectedDate] as JournalEntry)?.mood === m.v && "active"
                      )}
                    >
                      <span className="text-2xl">{m.e}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-muted block">Заметка</label>
                <textarea 
                  className="w-full p-4 rounded-2xl bg-surface-2 border border-line min-h-[120px] outline-none"
                  placeholder="Что произошло в этот день?"
                  value={(state.journalEntries[selectedDate] as JournalEntry)?.note || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleStateChange(prev => {
                      const entry = (prev.journalEntries[selectedDate] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };
                      return {
                        ...prev,
                        journalEntries: { ...prev.journalEntries, [selectedDate]: { ...entry, note: val } }
                      };
                    });
                  }}
                />
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-muted block">Привычки</label>
                <div className="space-y-2">
                  {state.habits.map(h => (
                    <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-line">
                      <div className="flex items-center gap-2">
                        <span>{h.icon}</span>
                        <span className="text-sm font-bold">{h.name}</span>
                      </div>
                      <button 
                        className={cn(
                          "chip-btn text-xs px-3 py-1 min-h-0",
                          h.dates.includes(selectedDate) && "bg-primary text-white border-transparent"
                        )}
                        onClick={() => handleStateChange(prev => {
                          const next = { ...prev };
                          const habit = next.habits.find(x => x.id === h.id)!;
                          if (habit.dates.includes(selectedDate)) {
                            habit.dates = habit.dates.filter(d => d !== selectedDate);
                          } else {
                            habit.dates = [...habit.dates, selectedDate];
                          }
                          return next;
                        })}
                      >
                        {h.dates.includes(selectedDate) ? 'Готово' : 'Отметить'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn w-full" onClick={() => setIsDayModalOpen(false)}>
                Готово
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[5000] p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setIsSearchOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-surface border border-line rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            >
              <div className="p-4 border-b border-line flex items-center gap-3">
                <Search className="text-muted" size={20} />
                <input 
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-lg font-medium"
                  placeholder="Поиск заметок, задач, привычек..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-surface-2 rounded-xl">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {searchQuery ? (
                  <div className="space-y-4">
                    {/* Notes */}
                    {Object.entries(state.journalEntries)
                      .filter(([date, e]) => (e as JournalEntry).note.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(([date, e]) => {
                        const entry = e as JournalEntry;
                        return (
                          <div key={date} className="card cursor-pointer hover:bg-surface-2" onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); setIsSearchOpen(false); }}>
                            <div className="font-bold text-sm mb-1">{date} (Заметка)</div>
                            <div className="text-xs text-muted line-clamp-2">{entry.note}</div>
                          </div>
                        );
                      })}
                    {/* Tasks */}
                    {state.tasks
                      .filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(t => (
                        <div key={t.id} className="card flex items-center gap-3">
                          <CheckCircle2 size={16} className={t.done ? "text-good" : "text-muted"} />
                          <div>
                            <div className="font-bold text-sm">{t.text}</div>
                            <div className="text-[10px] text-muted">Задача</div>
                          </div>
                        </div>
                      ))}
                    {/* Habits */}
                    {state.habits
                      .filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(h => (
                        <div key={h.id} className="card flex items-center gap-3">
                          <span className="text-lg">{h.icon}</span>
                          <div>
                            <div className="font-bold text-sm">{h.name}</div>
                            <div className="text-[10px] text-muted">Привычка</div>
                          </div>
                        </div>
                      ))}
                    {/* Empty State */}
                    {searchQuery && 
                      !state.tasks.some(t => t.text.toLowerCase().includes(searchQuery.toLowerCase())) &&
                      !state.habits.some(h => h.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
                      !Object.values(state.journalEntries).some(e => (e as JournalEntry).note.toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <div className="text-center py-10 text-muted">Ничего не найдено 🔍</div>
                      )
                    }
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted">Начни вводить для поиска</div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-[5000]">
        <AnimatePresence>
          {isFABOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              className="absolute bottom-20 right-0 flex flex-col gap-3 items-end"
            >
              <button 
                onClick={() => { setActiveSection('habits'); setIsFABOpen(false); }}
                className="flex items-center gap-2 bg-surface border border-line p-3 rounded-2xl shadow-xl hover:bg-surface-2 transition-all"
              >
                <span className="text-sm font-bold">Привычка</span>
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><CheckCircle2 size={20} /></div>
              </button>
              <button 
                onClick={() => { setActiveSection('tasks'); setIsFABOpen(false); }}
                className="flex items-center gap-2 bg-surface border border-line p-3 rounded-2xl shadow-xl hover:bg-surface-2 transition-all"
              >
                <span className="text-sm font-bold">Задача</span>
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center"><ListTodo size={20} /></div>
              </button>
              <button 
                onClick={() => { setActiveSection('journal'); setIsFABOpen(false); }}
                className="flex items-center gap-2 bg-surface border border-line p-3 rounded-2xl shadow-xl hover:bg-surface-2 transition-all"
              >
                <span className="text-sm font-bold">Заметка</span>
                <div className="w-10 h-10 rounded-xl bg-primary-2/10 text-primary-2 flex items-center justify-center"><BookOpen size={20} /></div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button 
          className={cn("fab", isFABOpen && "rotate-45")}
          onClick={() => setIsFABOpen(!isFABOpen)}
        >
          <Plus size={32} />
        </button>
      </div>
    </div>
  );

  function weeklyReport() {
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 6);
    let habitsCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      habitsCount += state.habits.filter(h => h.dates.includes(isoDate(d))).length;
    }
    return `За 7 дней: привычек выполнено ${habitsCount}, серия ${overallStreak} дн.`;
  }
}
