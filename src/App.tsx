import React, { useState, useEffect, useMemo, useRef, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, CheckCircle2, Target, Calendar as CalendarIcon, 
  BookOpen, ListTodo, Flame, BarChart3, Settings, 
  Search, Sparkles, Menu, X, Plus, Trash2, Check,
  ChevronLeft, ChevronRight, Download, Upload, Save,
  Camera, Moon, Sun, Palette, Zap, Bell, LogIn, LogOut,
  RefreshCw, Trophy, Mic, MicOff, Share2, MessageSquare,
  Droplets, Timer, PieChart, Leaf, Brain, Music,
  Flower2, PawPrint, Circle, Heart, Star, Tag, Info, FileText, User as UserIcon,
  ChevronDown, Play, Square, SkipForward
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
  QUOTE_POOL, RANDOM_THOUGHTS, DEFAULT_STATE,
  JOURNAL_TEMPLATES
} from './constants';
import { AppState, Habit, Goal, Task, JournalEntry } from './types';
import { cn, countHabitsOnDate } from './lib/utils';
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
import { getDocFromServer } from 'firebase/firestore';
import { fetchForismaticQuote, Quote } from './services/quoteService';
import { exportToCSV } from './lib/exportUtils';
import { fetchRandomCat, CatImage } from './services/catService';

ChartJS.register(...registerables);

// --- Types for Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Что-то пошло не так. Попробуйте перезагрузить страницу.";
      try {
        if (this.state.error) {
          const info = JSON.parse(this.state.error.message);
          if (info.operationType) {
            message = `Ошибка базы данных (${info.operationType}). Пожалуйста, проверьте подключение.`;
          }
        }
      } catch (e) {
        // Not a JSON error
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-bg text-center">
          <div className="card max-w-md space-y-4">
            <div className="text-4xl">😿</div>
            <h2 className="text-xl font-bold">Ой! Ошибка</h2>
            <p className="text-muted">{message}</p>
            <button className="btn w-full" onClick={() => window.location.reload()}>Обновить страницу</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

const ConfirmModal = ({ 
  show, 
  title, 
  text, 
  onConfirm, 
  onCancel 
}: { 
  show: boolean, 
  title: string, 
  text: string, 
  onConfirm: () => void, 
  onCancel: () => void 
}) => (
  <AnimatePresence>
    {show && (
      <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/60">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="card max-w-sm w-full text-center space-y-6 p-8"
        >
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-muted leading-relaxed">{text}</p>
          <div className="flex gap-3 pt-4">
            <button className="chip-btn flex-1" onClick={onCancel}>Отмена</button>
            <button className="btn flex-1 bg-bad hover:bg-bad/80" onClick={onConfirm}>Да, уверен</button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const CatPopup = ({ 
  data, 
  onClose,
  onSave,
  catLevel,
  catExp
}: { 
  data: { show: boolean, isAllDone: boolean, img: string, mood: any, breed?: string } | null, 
  onClose: () => void,
  onSave: (url: string) => void,
  catLevel: number,
  catExp: number
}) => (
  <AnimatePresence>
    {data?.show && (
      <div className={cn(
        "fixed inset-0 z-[12000] flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-500",
        data.isAllDone ? "bg-primary/20" : "bg-black/60"
      )}>
        <motion.div 
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: 10 }}
          className={cn(
            "bg-surface rounded-[40px] overflow-hidden w-full max-w-sm relative transition-all duration-500",
            data.isAllDone ? "shadow-[0_0_50px_rgba(255,93,172,0.5)] border-4 border-primary" : "shadow-2xl"
          )}
        >
          <div className="relative aspect-square bg-bg-soft">
            {data.img ? (
              <img 
                src={data.img} 
                className="w-full h-full object-cover" 
                alt="Random Cat"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <RefreshCw className="animate-spin text-primary" size={40} />
              </div>
            )}
            <div className="absolute top-4 left-4 right-4 flex justify-between">
               <div className={cn(
                 "backdrop-blur-sm px-4 py-2 rounded-full text-xs font-bold shadow-sm flex items-center gap-2",
                 data.isAllDone ? "bg-primary text-white" : "bg-white/90 text-primary"
               )}>
                 <span className="text-lg">{data.mood.emoji}</span>
                 <span>{data.mood.phrase}</span>
               </div>
            </div>
          </div>
          
          <div className="p-6 space-y-4 bg-surface text-center">
            {data.breed && (
              <p className="text-[10px] text-muted italic font-medium -mt-2">
                {data.breed} · Котик без паспорта 🐾
              </p>
            )}

            {/* Level Progress */}
            <div className="space-y-1.5 text-left">
               <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted px-1">
                  <span className="text-primary">Уровень {catLevel}</span>
                  <span>{catExp} / {catLevel * 100} XP</span>
               </div>
               <div className="h-2 bg-bg-soft rounded-full overflow-hidden border border-line/20 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(catExp / (catLevel * 100)) * 100}%` }}
                    className="h-full bg-gradient-to-r from-primary to-primary-2 shadow-glow"
                  />
               </div>
            </div>

            <div className="flex gap-2">
               <button 
                 disabled={!data.img}
                 className="btn flex-1 bg-primary hover:bg-primary-2 text-white flex items-center justify-center gap-2 py-3 rounded-2xl disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-primary/20"
                 onClick={() => {
                   onSave(data.img);
                   onClose();
                 }}
               >
                 <Heart size={18} /> Забрать себе
               </button>
               <button 
                 disabled={!data.img}
                 className="chip-btn p-3 rounded-2xl bg-surface-2 hover:bg-surface-3 transition-colors disabled:opacity-50"
                 onClick={() => {
                   if (data.img) {
                     if (navigator.share) {
                       navigator.share({ title: 'Смотри какой котик!', url: data.img });
                     } else {
                       window.open(data.img, '_blank');
                     }
                   }
                 }}
               >
                 <Share2 size={18} />
               </button>
            </div>
            <button className="w-full text-muted text-[10px] font-black uppercase tracking-[0.2em] hover:text-primary transition-colors py-2" onClick={onClose}>
              {data.isAllDone ? 'Я умница! ✨' : 'Просто закрыть'}
            </button>
          </div>
          <button 
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors z-10"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const RadialHeatmap = ({ 
  data, 
  year, 
  onDateClick 
}: { 
  data: Record<string, { val: number; entry: JournalEntry | null; habitsCount: number }>; 
  year: number;
  onDateClick: (date: string) => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ show: boolean; date: string; mood: number | null; habits: number; x: number; y: number }>({
    show: false, date: '', mood: null, habits: 0, x: 0, y: 0
  });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = isDark 
    ? ['#1a1020', '#3a1f45', '#7d2b6e', '#c43f9a', '#ff5dac']
    : ['#fff1f8', '#ffd3e8', '#f4a7c0', '#e8729a', '#ff5dac'];
  
  const todayColor = '#c084fc';
  const textColor = isDark ? '#c8abc0' : '#7f6475';
  const surfaceColor = isDark ? '#1b131d' : '#ffffff';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 20;
    const innerR = outerR * 0.35;

    const startOfYear = new Date(year, 0, 1);
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;

    const dayData: any[] = [];
    for (let i = 0; i < daysInYear; i++) {
      const d = new Date(year, 0, 1 + i);
      const iso = isoDate(d);
      const dayInfo = data[iso] || { val: 0, entry: null, habitsCount: 0 };
      dayData.push({ iso, ...dayInfo, d });
    }

    const angleStep = (Math.PI * 2) / daysInYear;
    const startAngle = -Math.PI / 2;
    const today = todayISO();

    ctx.clearRect(0, 0, size, size);

    dayData.forEach((day, i) => {
      const a1 = startAngle + i * angleStep;
      const a2 = a1 + angleStep;
      const isToday = day.iso === today;

      const r = innerR + (outerR - innerR) * (0.25 + (day.val / 4) * 0.75);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, isToday ? outerR + 5 : r, a1, a2);
      ctx.closePath();
      ctx.fillStyle = isToday ? todayColor : colors[day.val];
      ctx.fill();
      
      if (isToday) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 2, 0, Math.PI * 2);
    ctx.fillStyle = surfaceColor;
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `bold ${Math.round(size * 0.05)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(year), cx, cy);

    // Month labels
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const labelR = outerR + 15;
    ctx.font = `bold ${Math.round(size * 0.03)}px Nunito, sans-serif`;
    
    for (let m = 0; m < 12; m++) {
      const firstDayOfMonth = new Date(year, m, 1);
      const dayOfYear = Math.floor((firstDayOfMonth.getTime() - startOfYear.getTime()) / 86400000);
      const angle = startAngle + dayOfYear * angleStep + angleStep * 15;
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);
      ctx.fillText(monthNames[m], lx, ly);
    }
  }, [data, year, isDark]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 20;
    const innerR = outerR * 0.35;

    const mx = (e.clientX - rect.left) * (size / rect.width) - cx;
    const my = (e.clientY - rect.top) * (size / rect.height) - cy;
    const dist = Math.sqrt(mx * mx + my * my);

    if (dist < innerR || dist > outerR + 20) {
      setTooltip(prev => ({ ...prev, show: false }));
      return;
    }

    const startAngle = -Math.PI / 2;
    let angle = Math.atan2(my, mx) - startAngle;
    if (angle < 0) angle += Math.PI * 2;

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    const dayIdx = Math.floor((angle / (Math.PI * 2)) * daysInYear);

    if (dayIdx >= 0 && dayIdx < daysInYear) {
      const d = new Date(year, 0, 1 + dayIdx);
      const iso = isoDate(d);
      const dayInfo = data[iso] || { val: 0, entry: null, habitsCount: 0 };
      
      setTooltip({
        show: true,
        date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
        mood: dayInfo.entry?.mood || null,
        habits: dayInfo.habitsCount,
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = (size / 2 - 20) * 0.35;

    const mx = (e.clientX - rect.left) * (size / rect.width) - cx;
    const my = (e.clientY - rect.top) * (size / rect.height) - cy;
    const dist = Math.sqrt(mx * mx + my * my);

    if (dist < innerR) return;

    const startAngle = -Math.PI / 2;
    let angle = Math.atan2(my, mx) - startAngle;
    if (angle < 0) angle += Math.PI * 2;

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    const dayIdx = Math.floor((angle / (Math.PI * 2)) * daysInYear);

    if (dayIdx >= 0 && dayIdx < daysInYear) {
      const d = new Date(year, 0, 1 + dayIdx);
      onDateClick(isoDate(d));
    }
  };

  return (
    <div className="relative flex justify-center py-4">
      <canvas 
        ref={canvasRef} 
        width={400} 
        height={400} 
        className="max-w-full cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(prev => ({ ...prev, show: false }))}
        onClick={handleClick}
      />
      {tooltip.show && (
        <div 
          className="fixed z-[9999] bg-surface border border-line rounded-xl p-3 shadow-xl pointer-events-none animate-in fade-in duration-150"
          style={{ left: tooltip.x + 15, top: tooltip.y - 60 }}
        >
          <div className="text-[10px] font-bold text-muted mb-1">{tooltip.date}</div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{tooltip.mood ? MOOD_SCALE.find(m => m.v === tooltip.mood)?.e : '—'}</span>
            <span className="text-xs font-bold text-muted">{tooltip.habits} привыч.</span>
          </div>
        </div>
      )}
    </div>
  );
};

const OnboardingModal = ({ step, onNext, onSkip }: { step: number, onNext: () => void, onSkip: () => void }) => {
  const steps = [
    { title: "Привет!", text: "Добро пожаловать в Дискошажки — твой бережный трекер жизни с блёстками.", icon: <span className="text-5xl">✨</span> },
    { title: "Бережный ритм", text: "Мы верим в маленькие шаги. Отмечай привычки, ставь цели и не забывай хвалить себя.", icon: <span className="text-5xl">🌱</span> },
    { title: "Дневник и ИИ", text: "Записывай мысли, а наш Диско-ИИ поможет тебе с рефлексией и даст добрый совет.", icon: <span className="text-5xl">🧠</span> },
    { title: "Party Mode!", text: "Кликни 5 раз на логотип, чтобы устроить себе диско-паузу. Ты — звезда!", icon: <span className="text-5xl">🪩</span> }
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60">
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
  const [isZenMode, setIsZenMode] = useState(false);
  const [isPartyMode, setIsPartyMode] = useState(false);
  const isPartyModeRef = useRef(false);
  const [partyClicks, setPartyClicks] = useState(0);
  const [dailyQuote, setDailyQuote] = useState<Quote | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<'grid' | 'radial'>('grid');
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const [viewDate, setViewDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [isFABOpen, setIsFABOpen] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [taskFilter, setTaskFilter] = useState({ priority: 'all', status: 'all', search: '' });
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('important');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [catPopup, setCatPopup] = useState<{ show: boolean, isAllDone: boolean, img: string, mood: any } | null>(null);
  
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('🌱');

  const [confirmModal, setConfirmModal] = useState<{ show: boolean, title: string, text: string, onConfirm: () => void } | null>(null);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Helpers ---
  const overallStreak = useMemo(() => {
    let streak = 0;
    const d = new Date();
    const today = todayISO();
    const hasActivity = (date: string) => 
      state.habits.some(h => h.dates.includes(date)) || (state.journalEntries[date] as JournalEntry)?.mood;
    
    if (!hasActivity(today)) d.setDate(d.getDate() - 1);
    while (streak < 366 && hasActivity(isoDate(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [state.habits, state.journalEntries]);

  // --- Connection Test ---
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
          showToast("Ошибка подключения к Firebase. Проверьте настройки.", "error");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    // Fetch daily quote
    async function getDailyQuote() {
      const today = todayISO();
      const cacheKey = `forismatic_${today}`;
      const cached = sessionStorage.getItem(cacheKey);
      
      if (cached) {
        setDailyQuote(JSON.parse(cached));
        return;
      }

      const quote = await fetchForismaticQuote();
      if (quote) {
        setDailyQuote(quote);
        sessionStorage.setItem(cacheKey, JSON.stringify(quote));
      } else {
        // Fallback to local pool if API fails
        const local = QUOTE_POOL[Math.floor(Math.random() * QUOTE_POOL.length)];
        setDailyQuote(local);
      }
    }
    getDailyQuote();

    // Check for day change every minute
    const interval = setInterval(() => {
      getDailyQuote();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

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
        }).catch(e => {
          handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
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

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsDrawerOpen(false);
        setIsDayModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
          sessionsCompleted: isWork ? prev.pomodoro.sessionsCompleted + 1 : prev.pomodoro.sessionsCompleted,
          totalFocusMinutes: isWork ? prev.pomodoro.totalFocusMinutes + prev.pomodoro.duration : prev.pomodoro.totalFocusMinutes
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

  const setFocusMode = (mode: 'work' | 'break', duration: number) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      pomodoro: { 
        ...prev.pomodoro, 
        mode, 
        duration,
        timeLeft: duration * 60,
        isActive: false 
      }
    }));
  };

  const resetPomodoro = () => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      pomodoro: { 
        ...prev.pomodoro, 
        isActive: false, 
        timeLeft: prev.pomodoro.duration * 60 
      }
    }));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Side Effects ---
  const lastSavedStateRef = useRef<string>('');

  useEffect(() => {
    if (!user) return;
    
    const currentStateStr = JSON.stringify(state);
    if (currentStateStr === lastSavedStateRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'users', user.uid), state);
        lastSavedStateRef.current = currentStateStr;
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
      }
    }, 3000); // Debounce sync by 3 seconds

    return () => clearTimeout(timeoutId);
  }, [state, user]);

  useEffect(() => {
    const today = todayISO();
    let updated = false;
    const nextAchievements = state.achievements.map(a => {
      if (a.unlockedAt) return a;
      
      let unlocked = false;
      if (a.id === 'first_habit' && state.habits.some(h => h.dates.length > 0)) unlocked = true;
      if (a.id === 'pomodoro_1' && state.pomodoro.sessionsCompleted >= 1) unlocked = true;
      if (a.id === 'streak_7' && overallStreak >= 7) unlocked = true;
      if (a.id === 'cat_collector' && state.catGallery.length >= 5) unlocked = true;

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
      setState(prev => ({ ...prev, achievements: nextAchievements }));
    }
  }, [state.habits, state.pomodoro.sessionsCompleted, overallStreak, state.catGallery.length]);

  const handleStateChange = (updater: (prev: AppState) => AppState) => {
    setState(prev => updater(prev));
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

  // --- Toasts ---
  const showToast = (message: string, type = 'info') => {
    const tid = id();
    setToasts(prev => [...prev, { id: tid, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 3500);
  };

  // --- Party Mode ---
  const handleLogoClick = (e: React.MouseEvent) => {
    playSound('pop');
    
    // Ring Effect
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    [28, 46, 64].forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'party-ring-el';
      el.style.width = s + 'px';
      el.style.height = s + 'px';
      el.style.left = (cx - s / 2) + 'px';
      el.style.top = (cy - s / 2) + 'px';
      el.style.animationDelay = (i * 0.09) + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 750);
    });

    setPartyClicks(prev => {
      const next = prev + 1;
      if (next >= 5) {
        activatePartyMode();
        return 0;
      }
      return next;
    });
  };

  const activatePartyMode = () => {
    setIsPartyMode(true);
    isPartyModeRef.current = true;
    
    // Advanced Audio Synthesis from the original document
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        comp.attack.value = 0.003;
        comp.release.value = 0.15;
        comp.connect(ctx.destination);
        
        const bSec = 60 / 128; // 128 BPM
        const duration = 12000;
        const totalBeats = Math.ceil(duration / 1000 / bSec) + 2;

        const kick = (t: number) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.07);
          g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          o.connect(g); g.connect(comp); o.start(t); o.stop(t + 0.23);
        };
        const hat = (t: number, open: boolean) => {
          const len = ctx.sampleRate * (open ? .13 : .05);
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          const s = ctx.createBufferSource(), g = ctx.createGain();
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
          s.buffer = buf; s.connect(hp); hp.connect(g); g.connect(comp);
          g.gain.setValueAtTime(open ? .07 : .04, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? .13 : .05));
          s.start(t); s.stop(t + (open ? .14 : .06));
        };
        const snare = (t: number) => {
          const len = ctx.sampleRate * 0.14;
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const s = ctx.createBufferSource(), g = ctx.createGain();
          s.buffer = buf; s.connect(g); g.connect(comp);
          g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          s.start(t); s.stop(t + 0.15);
        };
        const bass = (t: number, f: number) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = f;
          g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
          o.connect(g); g.connect(comp); o.start(t); o.stop(t + 0.22);
        };

        const bl = [110, 110, 130, 110, 87, 87, 98, 87];
        for (let b = 0; b < totalBeats; b++) {
          const t = ctx.currentTime + b * bSec, st = b % 4;
          if (!isPartyModeRef.current) break;
          kick(t);
          if (st === 2) snare(t);
          hat(t, false); hat(t + bSec / 2, st === 1 || st === 3);
          bass(t, bl[b % bl.length]);
        }
        setTimeout(() => { try { ctx.close(); } catch (e) {} }, duration + 600);
      }
    } catch (e) {
      console.error("Audio Synthesis failed", e);
    }

    const overlay = document.getElementById('partyOverlay');
    const flash = document.getElementById('partyBeatFlash');
    if (overlay) overlay.classList.add('active');
    if (flash) flash.classList.add('active');

    const confettiInterval = setInterval(() => {
      const pool = ['🪩', '✨', '💜', '🌸', '⭐', '🎉', '💖', '🌈', '🎊', '💫', '🔮', '🌟'];
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

    setTimeout(() => {
      setIsPartyMode(false);
      isPartyModeRef.current = false;
      if (overlay) overlay.classList.remove('active');
      if (flash) flash.classList.remove('active');
      clearInterval(confettiInterval);
      showToast('Ты — главная звезда своей жизни! Танцуй, сияй, живи! 🪩💖', 'success');
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

  const handleAddHabit = () => {
    if (!newHabitName.trim()) return;
    const newHabit: Habit = {
      id: id(),
      name: newHabitName.trim(),
      icon: newHabitIcon,
      dates: []
    };
    handleStateChange(prev => ({
      ...prev,
      habits: [...prev.habits, newHabit]
    }));
    setNewHabitName('');
    setNewHabitIcon('🌱');
    setIsHabitModalOpen(false);
    showToast('Привычка добавлена! 🌱', 'success');
    playSound('success');
  };

  const handleHabitComplete = (habitId: string) => {
    playSound('click');
    const today = todayISO();
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;
    
    const isDone = habit.dates.includes(today);
    const willBeDone = !isDone;
    
    handleStateChange(prev => {
      const h = prev.habits.find(x => x.id === habitId)!;
      const newDates = isDone 
        ? h.dates.filter(d => d !== today)
        : [...h.dates, today];
      
      return {
        ...prev,
        habits: prev.habits.map(x => x.id === habitId ? { ...x, dates: newDates } : x)
      };
    });

    if (willBeDone) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ff5dac', '#c084fc', '#ff8c00']
      });
      playSound('success');
      const isAllDone = state.habits.every(h => {
        const isInPrevState = h.dates.includes(today);
        if (h.id === habitId) return true; // We know it's being marked done
        return isInPrevState;
      }) && state.habits.length > 0;
      showCat(isAllDone);
      gainExp(20);
    }
  };

  const handleTaskToggle = (taskId: string) => {
    playSound('click');
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const willBeDone = !task.done;

    handleStateChange(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, done: willBeDone, completedAt: willBeDone ? todayISO() : undefined } : t)
    }));

    if (willBeDone) {
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#ff5dac', '#c084fc']
      });
      showCat(false);
      gainExp(10);
    }
  };

  const handleAddTask = (text: string, priority: Task['priority'] = 'important') => {
    if (!text.trim()) return;
    handleStateChange(prev => ({
      ...prev,
      tasks: [
        { 
          id: id(), 
          text, 
          done: false, 
          priority, 
          recurring: 'none', 
          weekday: null, 
          tags: [], 
          focus: false 
        },
        ...prev.tasks
      ]
    }));
    showToast('Задача добавлена ✍️', 'info');
    playSound('pop');
  };

  const handleTaskDelete = (taskId: string) => {
    handleStateChange(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
    showToast('Задача удалена', 'info');
  };

  // --- Cat Reward ---
  const gainExp = (amount: number) => {
    handleStateChange(prev => {
      let nextExp = (prev.cat?.exp || 0) + amount;
      let nextLevel = prev.cat?.level || 1;
      const requiredExp = nextLevel * 100;
      
      if (nextExp >= requiredExp) {
        nextExp -= requiredExp;
        nextLevel += 1;
        showToast(`Твой котик вырос! Теперь у него ${nextLevel} уровень! 🐾`, 'success');
        confetti({ particleCount: 200, spread: 80, colors: ['#ff5dac', '#f472b6'] });
      }
      
      return {
        ...prev,
        cat: { ...prev.cat, level: nextLevel, exp: nextExp }
      };
    });
  };

  const showCat = async (isAllDone = false) => {
    const catMoods = [
      { emoji: '😸', phrase: 'Молодец! Смотри, какой котик!' },
      { emoji: '😻', phrase: 'Обожаю котиков. И тебя.' },
      { emoji: '🙀', phrase: 'Смотри, какой пушистик!' },
      { emoji: '😼', phrase: 'Котик одобряет твой успех.' },
      { emoji: '🐾', phrase: 'Шажок за шажком к цели!' },
      { emoji: '😹', phrase: 'Улыбнись! Котики приносят удачу.' },
    ];
    const catGrand = { emoji: '🎉', phrase: 'Мастер привычек! Все выполнено!' };
    
    const mood = isAllDone ? catGrand : catMoods[Math.floor(Math.random() * catMoods.length)];
    
    setCatPopup({ show: true, isAllDone, img: '', mood });
    
    const cat = await fetchRandomCat();
    if (cat) {
      const breed = cat.breeds?.[0];
      const breedName = breed?.name ? `${breed.name} · ${(breed.temperament||'').split(',')[0]}` : undefined;
      setCatPopup(prev => prev ? { ...prev, img: cat.url, breed: breedName } : null);
    }
  };

  const saveCatToGallery = (url: string) => {
    if (!url) return;
    handleStateChange(prev => {
      if (prev.catGallery.includes(url)) return prev;
      return {
        ...prev,
        catGallery: [url, ...prev.catGallery].slice(0, 50) // Limit to 50
      };
    });
    showToast('Котик сохранен в галерею! 😻', 'success');
  };

  // --- Navigation ---
  const navItems = [
    { id: 'overview', icon: '✨', label: 'Обзор' },
    { id: 'habits', icon: '🌱', label: 'Привычки' },
    { id: 'goals', icon: '🎯', label: 'Цели' },
    { id: 'calendar', icon: '🗓️', label: 'Календарь' },
    { id: 'journal', icon: '📖', label: 'Дневник' },
    { id: 'tasks', icon: '📋', label: 'Задачи' },
    { id: 'pomodoro', icon: '⏱️', label: 'Фокус' },
    { id: 'balance', icon: '🎡', label: 'Баланс' },
    { id: 'analytics', icon: '📊', label: 'Аналитика' },
    { id: 'heatmap', icon: '🔥', label: 'Теплокарта' },
    { id: 'gallery', icon: '🐈', label: 'Галерея' },
    { id: 'settings', icon: '⚙️', label: 'Настройки' },
  ];

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

  const balanceChartData = useMemo(() => {
    const historicalMonths = Object.keys(state.balanceHistory || {}).sort();
    if (historicalMonths.length === 0) return null;

    const categories = Object.keys(state.balance);
    const colors = [
      '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', 
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ];

    const datasets = categories.slice(0, 8).map((cat, idx) => ({
      label: cat,
      data: historicalMonths.map(month => state.balanceHistory[month][cat] || 0),
      borderColor: colors[idx % colors.length],
      tension: 0.3,
      fill: false
    }));

    const labels = historicalMonths.map(m => {
      const [y, mm] = m.split('-');
      return new Date(+y, +mm - 1).toLocaleString('ru-RU', { month: 'short', year: '2-digit' });
    });

    return { labels, datasets };
  }, [state.balanceHistory, state.balance]);

  const handleSaveBalanceSnapshot = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    handleStateChange(prev => ({
      ...prev,
      balanceHistory: {
        ...(prev.balanceHistory || {}),
        [monthKey]: { ...prev.balance }
      }
    }));
    showToast('Слепок колеса сохранён! 🎡', 'success');
    playSound('success');
  };

  const renderPomodoro = () => {
    const totalSeconds = state.pomodoro.duration * 60;
    const progress = (state.pomodoro.timeLeft / totalSeconds);
    const dashArray = 754;
    const dashOffset = dashArray * (1 - progress);

    const activeTask = state.tasks.find(t => t.id === state.pomodoro.focusTaskId);

    return (
      <div className="flex flex-col items-center space-y-10 py-6 max-w-2xl mx-auto">
        {/* Immersive Focus Header */}
        <div className="text-center space-y-2">
          <h2 className="text-5xl font-black tracking-tighter font-display bg-gradient-to-r from-primary to-primary-2 bg-clip-text text-transparent">
            {state.pomodoro.mode === 'work' ? 'Время фокуса 🎯' : 'Время отдыха ✨'}
          </h2>
          <p className="text-muted text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
            {state.pomodoro.mode === 'work' ? 'Концентрируйся на важном' : 'Наслаждайся паузой'}
          </p>
        </div>

        {/* Task Selection */}
        <div className="w-full flex flex-col items-center gap-4">
          <div className="w-full max-w-md bg-surface-2 border border-line p-1 rounded-2xl flex gap-1 shadow-sm">
            {[
              { id: 'work', label: 'Фокус 🎯', d: 25 },
              { id: 'deep', label: 'Поток 🌊', d: 50 },
              { id: 'break', label: 'Кофе ☕', d: 5 },
              { id: 'long', label: 'Релакс 🧘', d: 15 }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setFocusMode(m.id === 'break' || m.id === 'long' ? 'break' : 'work', m.d)}
                className={cn(
                  "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  (m.d === state.pomodoro.duration && (m.id === 'break' || m.id === 'long' ? state.pomodoro.mode === 'break' : state.pomodoro.mode === 'work')) 
                    ? "bg-primary text-white shadow-glow" 
                    : "text-muted hover:bg-surface hover:text-text"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="w-full max-w-md relative group">
            <select 
              className="w-full p-4 rounded-2xl bg-surface border border-line appearance-none font-bold text-sm cursor-pointer hover:border-primary transition-colors pr-12 focus:ring-2 focus:ring-primary/20 outline-none"
              value={state.pomodoro.focusTaskId || ''}
              onChange={(e) => handleStateChange(prev => ({
                ...prev,
                pomodoro: { ...prev.pomodoro, focusTaskId: e.target.value || null }
              }))}
            >
              <option value="">🎯 Выбери задачу для фокуса...</option>
              {state.tasks.filter(t => !t.done).map(t => (
                <option key={t.id} value={t.id}>
                  {BASE_CAT_EMOJI[t.tags[0]] || '✨'} {t.text}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted group-hover:text-primary transition-colors">
              <ChevronLeft className="-rotate-90" size={18} />
            </div>
          </div>
        </div>

        {/* The Big Timer */}
        <div className="relative w-80 h-80 lg:w-96 lg:h-96 flex items-center justify-center">
          {/* Decorative Glow */}
          <motion.div 
            animate={{ 
              scale: state.pomodoro.isActive ? [1, 1.05, 1] : 1,
              opacity: state.pomodoro.isActive ? [0.4, 0.6, 0.4] : 0.3
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className={cn(
              "absolute inset-0 rounded-full blur-[60px]",
              state.pomodoro.mode === 'work' ? "bg-primary/20" : "bg-good/20"
            )}
          />

          <svg className="w-full h-full -rotate-90 drop-shadow-xl overflow-visible">
            <defs>
              <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--primary-2)" />
              </linearGradient>
            </defs>
            <circle 
              cx="160" cy="160" r="120" 
              className="stroke-line/20 fill-surface/40" 
              strokeWidth="12" 
            />
            {/* Ticks */}
            {[...Array(60)].map((_, i) => (
              <line
                key={i}
                x1="160" y1="52" x2="160" y2="60"
                className={cn(
                  "stroke-line/40 transition-colors",
                  i % 5 === 0 ? "stroke-text/20" : "opacity-40"
                )}
                strokeWidth={i % 5 === 0 ? "2" : "1"}
                transform={`rotate(${i * 6}, 160, 160)`}
              />
            ))}
            <motion.circle 
              cx="160" cy="160" r="120" 
              className={state.pomodoro.mode === 'work' ? "stroke-[url(#timerGrad)]" : "stroke-good"}
              strokeWidth="12" 
              strokeLinecap="round"
              fill="none"
              initial={{ strokeDasharray: dashArray, strokeDashoffset: dashArray }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 1, ease: "linear" }}
              style={{ filter: 'drop-shadow(0 0 10px rgba(236,72,153,0.3))' }}
            />
          </svg>

          <div className="absolute flex flex-col items-center">
            <motion.div 
              key={state.pomodoro.timeLeft}
              initial={{ scale: 0.9, opacity: 0.8 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-black font-mono tracking-tighter tabular-nums drop-shadow-2xl"
            >
              {formatTime(state.pomodoro.timeLeft)}
            </motion.div>
            <div className={cn(
              "mt-4 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border",
              state.pomodoro.isActive ? "bg-primary/10 border-primary text-primary" : "bg-muted/10 border-line text-muted"
            )}>
              {state.pomodoro.isActive ? 'Идёт отсчёт •••' : 'На паузе'}
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-6">
          <button 
            className="chip-btn p-5 rounded-3xl hover:bg-bg-soft"
            onClick={resetPomodoro}
          >
            <RefreshCw size={24} className={cn(state.pomodoro.isActive && "animate-spin")} />
          </button>
          
          <button 
            className={cn(
              "btn px-16 py-6 rounded-[32px] text-xl font-black shadow-lg transition-all active:scale-95 group relative overflow-hidden",
              state.pomodoro.isActive ? "bg-surface-2 text-text border-line" : "bg-primary text-white shadow-glow"
            )}
            onClick={togglePomodoro}
          >
            <span className="relative z-10 flex items-center gap-3">
              {state.pomodoro.isActive ? (
                <><Timer className="animate-pulse" /> Стоп</>
              ) : (
                <><Flame /> В поток</>
              )}
            </span>
          </button>

          <button className="chip-btn p-5 rounded-3xl" onClick={() => showToast('Режим фокуса включен! Выключи уведомления на телефоне 📱', 'info')}>
            <Bell size={24} />
          </button>
        </div>

        {/* Active Task Card */}
        <AnimatePresence>
          {activeTask && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-md glass-card p-6 rounded-3xl border-primary/20 flex items-center gap-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl">
                {BASE_CAT_EMOJI[activeTask.tags[0]] || '🎯'}
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Сейчас в фокусе</div>
                <div className="font-bold text-lg leading-snug">{activeTask.text}</div>
              </div>
              <button 
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  activeTask.done ? "bg-good text-white" : "border-2 border-line hover:border-primary text-muted hover:text-primary"
                )}
                onClick={() => {
                  playSound('success');
                  handleStateChange(prev => ({
                    ...prev,
                    tasks: prev.tasks.map(t => t.id === activeTask.id ? { ...t, done: !t.done } : t)
                  }));
                }}
              >
                <Check size={24} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Stats */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          <div className="card bg-surface/50 backdrop-blur-sm border-line/50 p-6 rounded-3xl text-center flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-good/10 text-good flex items-center justify-center mb-3">
              <Trophy size={20} />
            </div>
            <div className="text-3xl font-black">{state.pomodoro.sessionsCompleted}</div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Сессий сегодня</div>
          </div>
          <div className="card bg-surface/50 backdrop-blur-sm border-line/50 p-6 rounded-3xl text-center flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Sparkles size={20} />
            </div>
            <div className="text-3xl font-black">{Math.floor(state.pomodoro.totalFocusMinutes / 60)}ч {state.pomodoro.totalFocusMinutes % 60}м</div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Время в фокусе (всего)</div>
          </div>
        </div>
      </div>
    );
  };

  const renderBalance = () => {
    const categories = Object.keys(state.balance);
    const angleStep = (Math.PI * 2) / categories.length;
    
    return (
      <div className="space-y-10">
        <div className="section-header px-2">
          <h3 className="text-3xl font-black tracking-tight font-display text-text">Колесо баланса 🎡</h3>
          <p className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mt-1 opacity-60">Гармония во всех сферах твоей жизни</p>
        </div>

        <div className="card relative flex flex-col items-center justify-center py-20 overflow-hidden bg-gradient-to-br from-surface via-surface to-primary-soft/10 border-line/40 shadow-xl shadow-primary/5 rounded-[40px]">
          {/* Animated Background Pulse */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.1, 0.2, 0.1]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]"
            />
          </div>

          <div className="absolute top-8 right-8 z-10">
            <button 
              className="chip-btn border-primary/20 text-primary bg-surface/80 backdrop-blur-sm hover:bg-primary hover:text-white transition-all shadow-md flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest"
              onClick={handleSaveBalanceSnapshot}
            >
              <Save size={16} /> Сохранить слепок
            </button>
          </div>
          
          <div className="relative w-80 h-80 lg:w-96 lg:h-96">
            <svg className="w-full h-full overflow-visible drop-shadow-2xl" viewBox="0 0 320 320">
              <defs>
                <radialGradient id="radarGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.6" />
                  <stop offset="80%" stopColor="var(--primary-2)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--primary-2)" stopOpacity="0" />
                </radialGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              
              {/* Background Wedges for Hover Highlight */}
              {categories.map((cat, i) => {
                const angle1 = (i * angleStep - Math.PI/2) - angleStep/2;
                const angle2 = (i * angleStep - Math.PI/2) + angleStep/2;
                const r = 150;
                const x1 = 160 + Math.cos(angle1) * r;
                const y1 = 160 + Math.sin(angle1) * r;
                const x2 = 160 + Math.cos(angle2) * r;
                const y2 = 160 + Math.sin(angle2) * r;
                
                return (
                  <path 
                    key={`wedge-${cat}`}
                    d={`M 160 160 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                    className={cn(
                      "transition-all duration-300",
                      hoveredCategory === cat ? "fill-primary/5" : "fill-transparent"
                    )}
                  />
                );
              })}

              {/* Grid Lines (Dashed for technical feel) */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                <circle 
                  key={r} 
                  cx="160" cy="160" r={r * 15} 
                  className={cn(
                    "transition-colors duration-500",
                    r % 5 === 0 ? "stroke-line/40" : "stroke-line/10"
                  )}
                  fill="none"
                  strokeWidth={r % 5 === 0 ? "1" : "0.5"} 
                  strokeDasharray={r % 5 === 0 ? "" : "2 2"}
                />
              ))}
              
              {/* Axis Reference Lines */}
              {categories.map((cat, i) => {
                const x = 160 + Math.cos(i * angleStep - Math.PI/2) * 150;
                const y = 160 + Math.sin(i * angleStep - Math.PI/2) * 150;
                return (
                  <line 
                    key={`line-${cat}`}
                    x1="160" y1="160" x2={x} y2={y} 
                    className={cn(
                      "transition-colors duration-300",
                      hoveredCategory === cat ? "stroke-primary/40" : "stroke-line/20"
                    )}
                    strokeWidth="1" 
                  />
                );
              })}

              {/* Central Radar Shape */}
              <motion.polygon 
                initial={false}
                animate={{
                  points: categories.map((cat, i) => {
                    const r = (state.balance[cat] || 0) * 15;
                    const x = 160 + Math.cos(i * angleStep - Math.PI/2) * r;
                    const y = 160 + Math.sin(i * angleStep - Math.PI/2) * r;
                    return `${x},${y}`;
                  }).join(' ')
                }}
                className="fill-[url(#radarGrad)] stroke-primary"
                strokeWidth="3"
                strokeLinejoin="round"
                filter="url(#glow)"
              />

              {/* Labels & Icons */}
              {categories.map((cat, i) => {
                const angle = i * angleStep - Math.PI/2;
                const iconR = 175;
                const textR = 205;
                const iconX = 160 + Math.cos(angle) * iconR;
                const iconY = 160 + Math.sin(angle) * iconR;
                const textX = 160 + Math.cos(angle) * textR;
                const textY = 160 + Math.sin(angle) * textR;
                
                const isHovered = hoveredCategory === cat;

                return (
                  <motion.g 
                    key={`label-${cat}`}
                    animate={{ scale: isHovered ? 1.15 : 1 }}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredCategory(cat)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  >
                    <text 
                      x={iconX} y={iconY} 
                      className="text-2xl drop-shadow-sm select-none"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {BASE_CAT_EMOJI[cat]}
                    </text>
                    <text 
                      x={textX} y={textY} 
                      className={cn(
                        "font-bold uppercase tracking-tight transition-all duration-300 select-none",
                        isHovered ? "fill-primary text-[10px]" : "fill-text text-[8px] opacity-60"
                      )}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {cat}
                    </text>
                  </motion.g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Categories Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <AnimatePresence>
            {categories.map((cat, idx) => (
              <motion.div 
                key={cat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onMouseEnter={() => setHoveredCategory(cat)}
                onMouseLeave={() => setHoveredCategory(null)}
                className={cn(
                  "card p-5 space-y-4 group transition-all duration-300 hover:shadow-lg relative overflow-hidden",
                  hoveredCategory === cat ? "border-primary/50 ring-1 ring-primary/10 bg-primary-soft/5" : "border-line/40"
                )}
              >
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center text-xl transition-all duration-300",
                      hoveredCategory === cat ? "bg-primary text-white scale-110 shadow-glow" : "bg-bg-soft text-text"
                    )}>
                      {BASE_CAT_EMOJI[cat]}
                    </div>
                    <div>
                      <span className="block font-bold text-xs uppercase tracking-wider text-text opacity-80 group-hover:opacity-100">{cat}</span>
                      <span className="text-[10px] text-muted font-bold">Степень: {state.balance[cat]}/10</span>
                    </div>
                  </div>
                  <div className="text-xl font-black text-primary font-mono tabular-nums">{state.balance[cat]}</div>
                </div>

                <div className="relative pt-2">
                  <div className="h-2 w-full bg-surface-2 rounded-full overflow-hidden border border-line/30">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-primary to-primary-2 shadow-[0_0_8px_rgba(236,72,153,0.4)]"
                      animate={{ width: `${(state.balance[cat] / 10) * 100}%` }}
                    />
                  </div>
                  <input 
                    type="range" min="1" max="10" 
                    value={state.balance[cat]} 
                    onChange={(e) => handleStateChange(prev => ({
                      ...prev,
                      balance: { ...prev.balance, [cat]: parseInt(e.target.value) }
                    }))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                </div>
                
                {/* Background Decor */}
                <div className="absolute -right-2 -bottom-2 text-4xl opacity-[0.03] rotate-12 group-hover:scale-125 group-hover:rotate-0 transition-all duration-500 pointer-events-none">
                  {BASE_CAT_EMOJI[cat]}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  };


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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                  onClick={() => {
                    const goal = state.goals.find(x => x.id === g.id);
                    if (!goal) return;
                    const nextProgress = Math.min(goal.target, goal.progress + 1);
                    handleStateChange(prev => ({
                      ...prev,
                      goals: prev.goals.map(x => x.id === g.id ? { ...x, progress: nextProgress } : x)
                    }));
                    if (nextProgress >= goal.target && goal.progress < goal.target) {
                      showToast('Цель достигнута! 🎉', 'success');
                    }
                  }}
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
          <h3 className="text-lg font-bold">Календарь 🗓️</h3>
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

  const renderCatGallery = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-surface-2 p-6 rounded-[32px] border border-line/40">
        <div>
          <h3 className="text-2xl font-black text-primary flex items-center gap-3">Кошачья Галерея 🐈</h3>
          <p className="text-muted text-sm mt-1">Твои пушистые награды за продуктивность</p>
        </div>
        <div className="bg-primary/10 text-primary border border-primary/20 px-6 py-3 rounded-2xl font-black text-lg shadow-sm">
          {state.catGallery.length}
        </div>
      </div>

      {state.catGallery.length === 0 ? (
        <div className="card py-32 text-center space-y-6">
          <div className="relative inline-block">
             <div className="text-8xl select-none">🐾</div>
             <motion.div 
               animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity }}
               className="absolute -top-2 -right-2 text-2xl"
             >✨</motion.div>
          </div>
          <div className="space-y-2">
            <h4 className="text-2xl font-black">Здесь пока пусто</h4>
            <p className="text-muted max-w-sm mx-auto">Каждая выполненная привычка или задача — это шанс встретить нового котика. Продолжай в том же духе, Ириночка! ✨</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <AnimatePresence>
            {state.catGallery.map((url, idx) => (
              <motion.div 
                key={url + idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ y: -5 }}
                className="relative aspect-[3/4] rounded-[32px] overflow-hidden group border border-line/40 cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300"
                onClick={() => {
                   setCatPopup({ show: true, isAllDone: false, img: url, mood: { emoji: '✨', phrase: 'Твой сохранённый котик' } });
                }}
              >
                <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="Saved Cat" />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                   <div className="flex justify-center text-white/90">
                      <Sparkles size={20} />
                   </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

  const renderAnalytics = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card pattern-waves">
            <h3 className="text-lg font-bold mb-4">График настроения 📈</h3>
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
          <div className="card">
            <h3 className="text-lg font-bold mb-4">Динамика баланса 🎡</h3>
            {balanceChartData ? (
              <div className="h-48">
                <Line 
                  data={balanceChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                      legend: { 
                        display: true, 
                        position: 'bottom',
                        labels: { boxWidth: 8, font: { size: 9 } }
                      } 
                    },
                    scales: { 
                      y: { min: 1, max: 10, grid: { color: 'rgba(0,0,0,0.05)' } },
                      x: { grid: { display: false } }
                    }
                  }}
                />
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-center text-muted">
                <div className="text-4xl mb-2">📉</div>
                <p className="text-xs">Нажмите "Сохранить слепок" в разделе Баланс, чтобы увидеть историю здесь.</p>
              </div>
            )}
          </div>
          <div className="card pattern-dots">
            <h3 className="text-lg font-bold mb-4">Бережная поддержка ✨</h3>
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
        <div className="mt-6">
          {renderHeatmap()}
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <div className="space-y-10">
      {/* Quote Section */}
      <div className="card bg-gradient-to-br from-primary/10 to-primary-2/10 border-primary/20 relative overflow-hidden group">
        <div className="absolute -right-4 -top-4 text-8xl opacity-5 group-hover:scale-110 transition-transform duration-500">🪩</div>
        <div className="relative z-10 p-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">
            <Sparkles size={14} /> Цитата дня
          </div>
          <blockquote className="text-xl lg:text-2xl font-display font-black italic leading-tight mb-4 text-text">
            "{dailyQuote?.text || QUOTE_POOL[0].text}"
          </blockquote>
          <cite className="text-sm text-muted not-italic flex items-center gap-3">
            <span className="font-bold">— {dailyQuote?.author || QUOTE_POOL[0].author}</span>
            <span className="w-1 h-1 rounded-full bg-line" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">новый день — новый шажок</span>
          </cite>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card pattern-stars flex flex-col items-center text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Серия 🔥</div>
          <div className="text-5xl font-black text-primary tracking-tighter mb-2">{overallStreak}</div>
          <div className="text-muted text-xs font-bold uppercase tracking-wider">дней с ритмом</div>
        </div>
        <div className="card pattern-dots flex flex-col items-center text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Привычки сегодня 🌱</div>
          <div className="text-5xl font-black text-primary-2 tracking-tighter mb-2">
            {state.habits.filter(h => h.dates.includes(todayISO())).length}/{state.habits.length}
          </div>
          <div className="text-muted text-xs font-bold uppercase tracking-wider">маленьких побед</div>
        </div>
        <div className="card pattern-waves flex flex-col items-center text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Фокус дня 🎯</div>
          <div className="text-5xl font-black text-accent tracking-tighter mb-2">
            {state.tasks.filter(t => t.focus && !t.done).length}
          </div>
          <div className="text-muted text-xs font-bold uppercase tracking-wider">главные задачи</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-black uppercase tracking-wider mb-6 flex items-center gap-2">
            <Sparkles size={20} className="text-primary" /> Инсайт
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-bg-soft border border-line/50 text-sm leading-relaxed">
              {overallStreak > 3 ? `Ты чаще в хорошем настроении по вторникам ✨` : "Пока мало данных, но скоро появится твой любимый день ✨"}
            </div>
            <div className="p-4 rounded-2xl bg-bg-soft border border-line/50 text-sm leading-relaxed">
              {state.habits.length > 0 ? "Связь между привычками и настроением пока умеренная: ритм важнее количества." : "Начни с малого — добавь свою первую привычку сегодня!"}
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-black uppercase tracking-wider mb-6 flex items-center gap-2">
            <BarChart3 size={20} className="text-primary-2" /> Итог недели
          </h3>
          <div className="p-6 rounded-2xl bg-primary-soft/30 border border-primary/10">
            <div className="text-sm font-bold text-text leading-relaxed">
              За 7 последних дней вы успешно закрепили <span className="text-primary font-black uppercase tracking-widest underline decoration-2 underline-offset-4">{state.habits.reduce((acc, h) => acc + h.dates.filter(d => {
                const date = new Date(d);
                const now = new Date();
                return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
              }).length, 0)}</span> привычек. Ваше среднее настроение составляет 4.2 из 5.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="text-lg font-black uppercase tracking-wider mb-6 flex items-center gap-2">
            <CalendarIcon size={20} className="text-accent" /> Теплокарта жизни
          </h3>
          <div id="overviewHeat" className="overflow-x-auto custom-scrollbar">
            {renderHeatmap()}
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-black uppercase tracking-wider mb-6 flex items-center gap-2">
            <Sparkles size={20} className="text-good" /> Прогноз целей
          </h3>
          <div className="space-y-4">
            {state.goals.length > 0 ? state.goals.map(g => (
              <div key={g.id} className="goal-item p-4 rounded-2xl bg-bg-soft border border-line/50 hover:border-primary/20 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <strong className="text-sm tracking-tight">{g.name}</strong>
                  <span className="text-[10px] font-black text-primary">{Math.round((g.progress / g.target) * 100)}%</span>
                </div>
                <div className="progress h-2 mb-2">
                  <span style={{ width: `${(g.progress / g.target) * 100}%` }} />
                </div>
                <div className="text-muted text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {g.progress >= g.target ? 'Цель достигнута! ✨' : `Осталось ${g.target - g.progress} ${g.unit}`}
                </div>
              </div>
            )) : (
              <div className="text-center py-12 text-muted text-sm italic opacity-50">
                Добавь цели в настройках, чтобы видеть прогноз ✨
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderHabits = () => (
    <div className="space-y-10">
      <div className="section-header flex justify-between items-end px-2">
        <div className="space-y-1">
          <h3 className="text-3xl font-black tracking-tight font-display">Привычки 🌱</h3>
          <p className="text-[10px] text-muted font-black uppercase tracking-[0.2em] opacity-60">Ритм создает дисциплину</p>
        </div>
        <button className="chip-btn py-3 px-6 shadow-sm hover:shadow-md transition-all flex items-center gap-2 border-primary/20 text-primary font-bold text-xs" onClick={() => setIsHabitModalOpen(true)}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {state.habits.map(habit => (
          <div key={habit.id} className="habit-row flex items-center justify-between p-6 rounded-[32px] bg-surface border border-line hover:border-primary/40 transition-all hover:shadow-lg group relative overflow-hidden">
            {/* Visual Flair */}
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-[0.03] group-hover:scale-125 transition-transform duration-700 pointer-events-none">{habit.icon}</div>
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-bg-soft group-hover:bg-primary-soft flex items-center justify-center text-3xl transition-colors shadow-sm">
                {habit.icon}
              </div>
              <div className="space-y-1">
                <div className="font-black text-sm tracking-tight">{habit.name}</div>
                <div className="text-[10px] text-muted font-black uppercase tracking-[0.1em] opacity-60 flex items-center gap-1">
                  <Flame size={12} className="text-orange-500" /> Серия: {streakForHabit(habit)} дн.
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleHabitComplete(habit.id)}
              className={cn(
                "dot w-10 h-10 border-2 relative z-10",
                habit.dates.includes(todayISO()) && "done"
              )}
            />
          </div>
        ))}
        {state.habits.length === 0 && (
          <div className="col-span-full card border-dashed border-2 py-20 flex flex-col items-center justify-center text-center bg-transparent">
             <div className="text-6xl mb-6 grayscale opacity-20">🌱</div>
             <div className="max-w-xs space-y-2">
               <p className="font-black text-lg">Здесь пока пусто</p>
               <p className="text-sm text-muted">Добавь свою первую привычку, чтобы начать строить ритм жизни ✨</p>
             </div>
             <button className="btn mt-8 px-10" onClick={() => setIsHabitModalOpen(true)}>Начать</button>
          </div>
        )}
      </div>
    </div>
  );

  const renderTasks = () => {
    const filteredTasks = state.tasks.filter(t => {
      const matchPriority = taskFilter.priority === 'all' || t.priority === taskFilter.priority;
      const matchStatus = taskFilter.status === 'all' || (taskFilter.status === 'done' ? t.done : !t.done);
      const matchSearch = taskFilter.search === '' || t.text.toLowerCase().includes(taskFilter.search.toLowerCase());
      return matchPriority && matchStatus && matchSearch;
    });

    const priorityOptions: { value: string, label: string, color: string }[] = [
      { value: 'all', label: 'Все', color: 'bg-surface-2' },
      { value: 'urgent', label: '🔥 Срочно', color: 'bg-bad/10 text-bad' },
      { value: 'important', label: '⭐ Важно', color: 'bg-warn/10 text-warn' },
      { value: 'someday', label: '💤 Потом', color: 'bg-primary/10 text-primary' }
    ];

    const statusOptions = [
      { value: 'all', label: 'Все' },
      { value: 'todo', label: 'В процессе' },
      { value: 'done', label: 'Выполнено' }
    ];

    return (
      <div className="space-y-6">
        <div className="card">
          <h3 className="text-lg font-bold mb-4">Добавить задачу ✍️</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              className="flex-1 bg-surface-2 border border-line p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Что нужно сделать?"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (handleAddTask(newTaskText, newTaskPriority), setNewTaskText(''))}
            />
            <div className="flex gap-2">
              <select 
                className="chip-btn text-xs px-3"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as any)}
              >
                <option value="someday">💤 Потом</option>
                <option value="important">⭐ Важно</option>
                <option value="urgent">🔥 Срочно</option>
              </select>
              <button 
                className="btn py-2 px-6"
                onClick={() => { handleAddTask(newTaskText, newTaskPriority); setNewTaskText(''); }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-bold">Список задач ({filteredTasks.length}) 📋</h3>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input 
                  type="text"
                  placeholder="Поиск по задачам..."
                  className="w-full bg-surface-2 border border-line pl-9 pr-4 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20"
                  value={taskFilter.search}
                  onChange={(e) => setTaskFilter(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2 block">Приоритет</label>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map(opt => (
                    <button 
                      key={opt.value}
                      onClick={() => setTaskFilter(prev => ({ ...prev, priority: opt.value as any }))}
                      className={cn(
                        "chip-btn text-[10px] transition-all",
                        taskFilter.priority === opt.value ? "bg-primary text-white border-transparent" : "hover:bg-bg-soft"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2 block">Статус</label>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map(opt => (
                    <button 
                      key={opt.value}
                      onClick={() => setTaskFilter(prev => ({ ...prev, status: opt.value as any }))}
                      className={cn(
                        "chip-btn text-[10px] transition-all",
                        taskFilter.status === opt.value ? "bg-primary text-white border-transparent" : "hover:bg-bg-soft"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {(taskFilter.priority !== 'all' || taskFilter.status !== 'all' || taskFilter.search !== '') && (
                    <button 
                      onClick={() => setTaskFilter({ priority: 'all', status: 'all', search: '' })}
                      className="text-[10px] font-bold text-bad hover:underline ml-auto"
                    >
                      Сбросить фильтры
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-8">
            <AnimatePresence mode="popLayout">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(task => (
                  <motion.div 
                    layout
                    key={task.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="task-row flex items-center gap-3 p-4 rounded-2xl bg-surface-2 border border-line group hover:border-primary/30 transition-all shadow-sm hover:shadow-md"
                  >
                    <button 
                      onClick={() => handleTaskToggle(task.id)}
                      className={cn(
                        "w-6 h-6 rounded-lg border-2 border-line flex items-center justify-center transition-all",
                        task.done ? "bg-primary border-primary text-white" : "hover:border-primary group-hover:bg-primary/5"
                      )}
                    >
                      {task.done && <Check size={14} strokeWidth={4} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "block font-medium truncate transition-all", 
                        task.done ? "line-through text-muted opacity-60" : "text-text"
                      )}>
                        {task.text}
                      </span>
                      <div className="flex gap-2 mt-1">
                        {task.priority === 'urgent' && <span className="text-[9px] font-bold text-bad uppercase tracking-tighter">🔥 Срочно</span>}
                        {task.priority === 'important' && <span className="text-[9px] font-bold text-warn uppercase tracking-tighter">⭐ Важно</span>}
                        {task.priority === 'someday' && <span className="text-[9px] font-bold text-primary uppercase tracking-tighter">💤 Потом</span>}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleTaskDelete(task.id)}
                      className="p-2 text-muted hover:text-bad opacity-0 group-hover:opacity-100 transition-all hover:bg-bad/10 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </motion.div>
                ))
              ) : (
                <div className="py-12 text-center text-muted">
                  <div className="text-4xl mb-3">🔍</div>
                  <p>Задачи не найдены</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  };

  const renderJournal = () => {
    const todayEntry = (state.journalEntries[todayISO()] as JournalEntry) || { mood: null, note: '', tags: [], pinned: false };

    return (
      <div className="space-y-10">
        <div className="section-header px-2">
          <h3 className="text-3xl font-black tracking-tight font-display text-text">Мой дневник 📖</h3>
          <p className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mt-1 opacity-60">Твое безопасное пространство для мыслей</p>
        </div>

        <div className="card border-primary/20 shadow-lg shadow-primary/5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary">Как ты сегодня?</h3>
            <button 
              onClick={() => {
                const thought = RANDOM_THOUGHTS[Math.floor(Math.random() * RANDOM_THOUGHTS.length)];
                handleStateChange(prev => ({
                  ...prev,
                  journalEntries: {
                    ...prev.journalEntries,
                    [todayISO()]: { ...todayEntry, note: todayEntry.note ? todayEntry.note + '\n\n' + thought : thought }
                  }
                }));
              }}
              className="chip-btn text-[10px] flex items-center gap-2 hover:border-primary/40"
            >
              <Sparkles size={14} className="text-primary" /> Случайная мысль
            </button>
          </div>

          <div className="flex justify-between gap-3 mb-8 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar">
            {MOOD_SCALE.map(m => (
              <button 
                key={m.v}
                onClick={() => {
                  playSound('pop');
                  handleStateChange(prev => ({
                    ...prev,
                    journalEntries: {
                      ...prev.journalEntries,
                      [todayISO()]: { ...todayEntry, mood: m.v }
                    }
                  }));
                }}
                className={cn(
                  "mood-btn flex-1 min-w-[60px] flex flex-col items-center justify-center py-6 rounded-3xl border-2 transition-all",
                  todayEntry.mood === m.v ? "active" : "border-line/40 hover:border-primary/20"
                )}
              >
                <div className="text-3xl mb-2">{m.e}</div>
                <div className="text-[9px] font-black uppercase tracking-widest opacity-60">{m.l}</div>
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 custom-scrollbar">
            {JOURNAL_TEMPLATES.map(t => (
              <button 
                key={t.id}
                onClick={() => {
                  handleStateChange(prev => ({
                    ...prev,
                    journalEntries: {
                      ...prev.journalEntries,
                      [todayISO()]: { ...todayEntry, note: t.text }
                    }
                  }));
                }}
                className="chip-btn text-[10px] whitespace-nowrap flex items-center gap-1"
              >
                {t.icon} {t.name}
              </button>
            ))}
          </div>

          <textarea 
            className="w-full p-4 rounded-2xl bg-surface-2 border border-line min-h-[150px] focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            placeholder="Что на душе? Расскажи мне..."
            value={todayEntry.note}
            onChange={(e) => handleStateChange(prev => ({
              ...prev,
              journalEntries: {
                ...prev.journalEntries,
                [todayISO()]: { ...todayEntry, note: e.target.value }
              }
            }))}
          />
          <div className="flex justify-between mt-4">
            <button 
              className={cn("chip-btn flex items-center gap-2", isRecording && "bg-bad text-white border-transparent animate-pulse")}
              onClick={toggleRecording}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              {isRecording ? 'Слушаю...' : 'Голосовая заметка'}
            </button>
            <button 
              className={cn("btn", isAIThinking && "opacity-50 pointer-events-none")}
              onClick={() => askGemini(`Проанализируй мой день: ${JSON.stringify(state.journalEntries[todayISO()])}. Дай короткий совет.`)}
            >
              {isAIThinking ? <RefreshCw size={18} className="animate-spin" /> : '✨ Диско-ИИ'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold px-2">Прошлые записи 📜</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(state.journalEntries)
              .filter(([date, e]) => date !== todayISO() && ((e as JournalEntry).note || (e as JournalEntry).mood))
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, e]) => {
                const entry = e as JournalEntry;
                return (
                  <div key={date} className="card space-y-3 flex flex-col">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-sm">{date}</div>
                      {entry.mood && <div className="text-xl">{MOOD_SCALE.find(m => m.v === entry.mood)?.e}</div>}
                    </div>
                    {entry.note && <div className="text-sm text-muted whitespace-pre-wrap line-clamp-4 flex-1">{entry.note}</div>}
                    <button 
                      className="text-[10px] font-bold text-primary hover:underline mt-2 text-left"
                      onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); }}
                    >
                      Читать полностью →
                    </button>
                  </div>
                );
              })}
          </div>
          {Object.entries(state.journalEntries).filter(([date, e]) => date !== todayISO() && ((e as JournalEntry).note || (e as JournalEntry).mood)).length === 0 && (
            <div className="text-center py-12 text-muted italic">
              История пока пуста. Заполни первую страницу! 📖
            </div>
          )}
        </div>
      </div>
    );
  };

  const heatmapData = useMemo(() => {
    const data: Record<string, { val: number, habitsCount: number, entry: JournalEntry | null }> = {};
    const year = heatmapYear;
    for (let i = 0; i < 366; i++) {
      const d = new Date(year, 0, 1 + i);
      if (d.getFullYear() !== year) continue;
      const iso = isoDate(d);
      const habitsCount = state.habits.filter(h => h.dates.includes(iso)).length;
      const entry = state.journalEntries[iso] as JournalEntry;
      let score = 0;
      if (habitsCount > 0) score += 1;
      if (habitsCount >= 3) score += 1;
      if (entry?.mood) score += 1;
      if (entry?.note && entry.note.length > 10) score += 1;
      data[iso] = { val: Math.min(4, score), habitsCount, entry };
    }
    return data;
  }, [state.habits, state.journalEntries, heatmapYear]);

  const renderHeatmap = () => {
    const year = heatmapYear;
    const startOfYear = new Date(year, 0, 1);
    const firstDayOfWeek = (startOfYear.getDay() + 6) % 7; // 0=Mon, 6=Sun
    
    const days = [];
    for (let i = 0; i < 366; i++) {
      const d = new Date(year, 0, 1 + i);
      if (d.getFullYear() === year) days.push(isoDate(d));
    }

    const monthLabels: { label: string; col: number }[] = [];
    let currentMonth = -1;

    const grid = [];
    for (let week = 0; week < 53; week++) {
      const column = [];
      for (let day = 0; day < 7; day++) {
        const dayIdx = week * 7 + day - firstDayOfWeek;
        if (dayIdx >= 0 && dayIdx < days.length) {
          const date = days[dayIdx];
          const d = getDayFromISO(date);
          if (d.getMonth() !== currentMonth) {
            currentMonth = d.getMonth();
            monthLabels.push({ 
              label: d.toLocaleString('ru-RU', { month: 'short' }), 
              col: week 
            });
          }
          column.push(date);
        } else {
          column.push(null);
        }
      }
      grid.push(column);
    }

    return (
      <div id="heatmap-section" className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-xl font-display font-bold">Твоя активность 🔥</h3>
              <p className="text-xs text-muted">Каждый квадратик — это шаг к цели</p>
            </div>
            <div className="flex items-center gap-2 bg-surface-2 p-1 rounded-xl border border-line">
              <button 
                className="p-1 hover:text-primary transition-colors"
                onClick={() => setHeatmapYear(prev => prev - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold px-2">{year}</span>
              <button 
                className="p-1 hover:text-primary transition-colors"
                onClick={() => setHeatmapYear(prev => prev + 1)}
                disabled={year >= new Date().getFullYear()}
              >
                <ChevronRight size={16} />
              </button>
              {year !== new Date().getFullYear() && (
                <button 
                  className="text-[10px] font-bold text-primary hover:underline ml-1"
                  onClick={() => setHeatmapYear(new Date().getFullYear())}
                >
                  Сегодня
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-surface-2 p-1 rounded-xl border border-line">
            <button 
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", heatmapMode === 'grid' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted hover:text-primary")}
              onClick={() => setHeatmapMode('grid')}
            >
              Сетка
            </button>
            <button 
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", heatmapMode === 'radial' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted hover:text-primary")}
              onClick={() => setHeatmapMode('radial')}
            >
              Кольцо
            </button>
            <div className="w-px h-4 bg-line mx-1" />
            <button 
              className="p-1.5 text-muted hover:text-primary transition-colors"
              onClick={() => handleExport('heatmap-section', `heatmap-${year}`)}
              title="Экспорт в PNG"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {heatmapMode === 'grid' ? (
          <div className="card overflow-x-auto custom-scrollbar">
            <div className="relative pt-6 min-w-max">
              {/* Month Labels */}
              <div className="absolute top-0 left-0 right-0 flex text-[10px] text-muted font-bold uppercase tracking-wider">
                {monthLabels.map((m, i) => (
                  <div 
                    key={i} 
                    className="absolute" 
                    style={{ left: `${m.col * 18}px` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              <div className="flex gap-[2px]">
                {/* Day of week labels */}
                <div className="flex flex-col gap-[2px] pr-2 text-[8px] text-muted font-bold uppercase justify-around">
                  <span>Пн</span>
                  <span className="opacity-0">Вт</span>
                  <span>Ср</span>
                  <span className="opacity-0">Чт</span>
                  <span>Пт</span>
                  <span className="opacity-0">Сб</span>
                  <span>Вс</span>
                </div>

                {grid.map((column, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-[3px]">
                    {column.map((date, dayIdx) => {
                      if (!date) return <div key={dayIdx} className="w-[14px] h-[14px] rounded-[3px] bg-transparent" />;
                      
                      const val = heatmapData[date]?.val || 0;
                      const isToday = date === todayISO();
                      const dayInfo = heatmapData[date];
                      const habitsCount = dayInfo?.habitsCount || 0;
                      const hasMood = !!dayInfo?.entry?.mood;
                      const hasNote = !!dayInfo?.entry?.note;

                      return (
                        <motion.div 
                          key={dayIdx} 
                          whileHover={{ scale: 1.25, zIndex: 10 }}
                          className={cn(
                            "heatcell w-[14px] h-[14px] rounded-[3px] transition-colors cursor-pointer",
                            val === 0 && "bg-surface-2",
                            val === 1 && "lv1",
                            val === 2 && "lv2",
                            val === 3 && "lv3",
                            val >= 4 && "lv4",
                            isToday && "ring-2 ring-primary ring-offset-1 ring-offset-surface"
                          )}
                          onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); }}
                          title={`${date}: ${habitsCount} привычек, ${hasMood ? 'настроение есть' : 'нет настроения'}, ${hasNote ? 'заметка есть' : 'нет заметки'}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Heatmap Legend */}
            <div className="mt-8 flex items-center justify-end gap-2 text-[10px] font-bold text-muted uppercase tracking-widest px-2">
               <span>Меньше</span>
               <div className="flex gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-[2px] bg-surface-2 border border-line/10" />
                  <div className="w-3.5 h-3.5 rounded-[2px] lv1" title="1-2 активности" />
                  <div className="w-3.5 h-3.5 rounded-[2px] lv2" title="3-4 активности" />
                  <div className="w-3.5 h-3.5 rounded-[2px] lv3" title="5-6 активностей" />
                  <div className="w-3.5 h-3.5 rounded-[2px] lv4" title="7+ активностей" />
               </div>
               <span>Больше</span>
            </div>
          </div>
        ) : (
          <RadialHeatmap 
            year={year} 
            data={heatmapData} 
            onDateClick={(date) => {
              setSelectedDate(date);
              setIsDayModalOpen(true);
            }}
          />
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-4 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold text-primary">{Object.values(heatmapData).filter(d => d.val > 0).length}</div>
            <div className="text-[10px] text-muted font-bold uppercase">Активных дней</div>
          </div>
          <div className="card p-4 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold text-primary-2">{overallStreak}</div>
            <div className="text-[10px] text-muted font-bold uppercase">Текущая серия</div>
          </div>
          <div className="card p-4 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold text-accent">
              {Math.round((Object.values(heatmapData).filter(d => d.val > 0).length / days.length) * 100)}%
            </div>
            <div className="text-[10px] text-muted font-bold uppercase">Процент года</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-line">
          <div className="flex items-center gap-2 text-[10px] text-muted font-bold uppercase">
            <span>Меньше</span>
            <div className="flex gap-1">
              <div className="w-3 h-3 rounded-[2px] bg-surface-2" />
              <div className="w-3 h-3 rounded-[2px] lv1" />
              <div className="w-3 h-3 rounded-[2px] lv2" />
              <div className="w-3 h-3 rounded-[2px] lv3" />
              <div className="w-3 h-3 rounded-[2px] lv4" />
            </div>
            <span>Больше</span>
          </div>
          
          <div className="group relative">
            <div className="flex items-center gap-1 text-[10px] font-bold text-primary cursor-help uppercase tracking-wider">
              <Info size={12} /> Как считаются баллы?
            </div>
            <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-surface border border-line rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 translate-y-2 group-hover:translate-y-0">
              <ul className="text-[10px] space-y-1.5 text-muted font-medium">
                <li className="flex justify-between"><span>Привычка</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>3+ привычки</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>Настроение</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>Заметка {'>'}10 симв.</span> <span className="text-primary">+1</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-10">
      <div className="section-header px-2">
        <h3 className="text-3xl font-black tracking-tight font-display text-text">Настройки ⚙️</h3>
        <p className="text-[10px] text-muted font-black uppercase tracking-[0.2em] mt-1 opacity-60">Твой ритм — твои правила</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card h-full space-y-8">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <UserIcon size={18} /> Профиль
            </h3>
            <div className="space-y-6">
              <div className="field space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted px-1">Твоё имя</label>
                <input 
                  className="w-full p-4 rounded-2xl bg-bg-soft border border-line focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                  value={state.settings.userName}
                  onChange={(e) => handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, userName: e.target.value }
                  }))}
                  placeholder="Как тебя называть?" 
                />
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-line">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Синхронизация ☁️</h4>
            {user ? (
              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="flex items-center gap-4">
                  {user.photoURL ? (
                    <img src={user.photoURL} className="w-12 h-12 rounded-2xl border-2 border-primary shadow-sm" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white text-xl">
                      👤
                    </div>
                  )}
                  <div>
                    <div className="font-black text-sm">{user.displayName}</div>
                    <div className="text-[10px] text-muted font-bold opacity-60">{user.email}</div>
                  </div>
                </div>
                <button 
                  className="p-3 text-bad hover:bg-bad/5 rounded-2xl transition-colors"
                  onClick={() => signOut(auth)}
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button 
                className="btn w-full py-4 flex items-center justify-center gap-3 shadow-glow"
                onClick={() => signInWithPopup(auth, googleProvider)}
              >
                <LogIn size={20} />
                Войти через Google
              </button>
            )}
          </div>
        </div>

        <div className="card h-full space-y-8">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
              <Palette size={18} /> Интерфейс
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(['light', 'dark', 'pink', 'cyberpunk'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => {
                    playSound('click');
                    handleStateChange(prev => ({
                      ...prev,
                      settings: { ...prev.settings, theme: t }
                    }));
                  }}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3",
                    state.settings.theme === t ? "border-primary bg-primary-soft/30 shadow-md" : "border-line hover:border-primary/40"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-bg-soft flex items-center justify-center text-primary">
                    {t === 'light' ? <Sun size={20} /> : t === 'dark' ? <Moon size={20} /> : t === 'pink' ? <Palette size={20} /> : <Zap size={20} />}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : t === 'pink' ? 'Розовая' : 'Кибер'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-line">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Автоматизация 🤖</h4>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="space-y-0.5">
                  <div className="font-black text-xs">Авто-сохранение</div>
                  <div className="text-[10px] text-muted font-bold opacity-60">Локальный бэкап каждые 30с</div>
                </div>
                <button 
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, autoSave: !prev.settings.autoSave }
                  }))}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors relative",
                    state.settings.autoSave ? "bg-primary" : "bg-line"
                  )}
                >
                  <motion.div 
                    animate={{ x: state.settings.autoSave ? 24 : 0 }}
                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <ErrorBoundary>
      <div className={cn("min-h-screen app lg:flex", isPartyMode && "party-active")} data-theme={state.settings.theme}>
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
      <audio ref={audioRef} loop src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" />

      <aside className="sidebar hidden lg:flex flex-col">
        <div className="brand brand-wrap cursor-pointer group" onClick={handleLogoClick}>
          <div className="sparkle sparkle-1"></div>
          <div className="sparkle sparkle-2"></div>
          <div className="sparkle sparkle-3"></div>
          <div className="logo brand-wrap transition-transform">
            <div className="sparkle sparkle-1"></div>
            <div className="sparkle sparkle-2"></div>
            <div className="sparkle sparkle-3"></div>
            <motion.div
              animate={isPartyMode ? { rotate: 360 } : { rotate: 0 }}
              transition={isPartyMode ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.5 }}
              className={cn("text-4xl", isPartyMode && "party-logo-spin")}
            >
              🪩
            </motion.div>
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none">Дискошажки</h1>
            <p className="text-xs text-muted mt-1">трекер с блёстками</p>
          </div>
        </div>

        <nav className="nav flex-1 space-y-1">
          {navItems.map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                activeSection === item.id ? "active" : ""
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-tools mt-auto pt-6 border-t border-line/40 space-y-3 px-2 pb-2">
          <button 
            className="group w-full text-left flex items-center justify-between p-4 rounded-3xl hover:bg-bg-soft transition-all duration-300 border border-transparent hover:border-line"
            onClick={() => setIsReportModalOpen(true)}
          >
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BarChart3 size={20} />
               </div>
               <span className="font-bold text-sm">Отчёт недели</span>
            </div>
            <ChevronRight size={16} className="text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button 
            className="group w-full text-left flex items-center justify-between p-4 rounded-3xl hover:bg-bg-soft transition-all duration-300 border border-transparent hover:border-line"
            onClick={() => handleStateChange(prev => ({
              ...prev,
              settings: { ...prev.settings, theme: prev.settings.theme === 'dark' ? 'light' : 'dark' }
            }))}
          >
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                  {state.settings.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
               </div>
               <span className="font-bold text-sm">Сменить тему</span>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted">{state.settings.theme}</div>
          </button>
        </div>
      </aside>
      
      {/* Mobile Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/40 z-[100] lg:hidden"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-surface z-[101] p-6 lg:hidden flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                <motion.span 
                  animate={isPartyMode ? { rotate: 360 } : { rotate: 0 }}
                  transition={isPartyMode ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.5 }}
                  className="text-2xl"
                >
                  🪩
                </motion.span>
                  <h1 className="font-display text-xl font-bold">Меню</h1>
                </div>
                <button className="chip-btn p-2" onClick={() => setIsDrawerOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              
              <nav className="nav flex-1 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                  <button 
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setIsDrawerOpen(false);
                    }}
                    className={cn(activeSection === item.id ? "active" : "")}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
              
              <div className="sidebar-tools pt-6 border-t border-line/40 space-y-2">
                <button 
                  className="group w-full text-left flex items-center justify-between p-4 rounded-3xl hover:bg-bg-soft transition-all duration-300 border border-transparent hover:border-line"
                  onClick={() => {
                    setIsReportModalOpen(true);
                    setIsDrawerOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                      <BarChart3 size={20} />
                    </div>
                    <span className="font-bold text-sm">Отчёт недели</span>
                  </div>
                </button>
                <button 
                  className="group w-full text-left flex items-center justify-between p-4 rounded-3xl hover:bg-bg-soft transition-all duration-300 border border-transparent hover:border-line"
                  onClick={() => {
                    handleStateChange(prev => ({
                      ...prev,
                      settings: { ...prev.settings, theme: prev.settings.theme === 'dark' ? 'light' : 'dark' }
                    }));
                    setIsDrawerOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                      {state.settings.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </div>
                    <span className="font-bold text-sm">Сменить тему</span>
                  </div>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="main flex-1 pb-12 lg:pb-8 px-4 lg:px-8 max-w-7xl mx-auto w-full relative">
        <header className="topbar flex justify-between items-center mb-8 py-4 sticky top-0 bg-bg/80 backdrop-blur-md z-40 -mx-4 px-4 border-b border-line/10 lg:static lg:bg-transparent lg:border-none lg:mx-0 lg:px-0">
          <div className="greet">
            <h2 className="font-display text-3xl lg:text-4xl font-bold flex items-center gap-3">
            <motion.span 
              animate={isPartyMode ? { rotate: 360 } : { rotate: 0 }}
              transition={isPartyMode ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.5 }}
            >
              🪩
            </motion.span>
              {new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'}
              {state.settings.userName ? `, ${state.settings.userName}` : ''} ✨
            </h2>
            <p className="text-muted mt-1">
              {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="top-actions flex gap-2">
            <button 
              className="chip-btn lg:hidden flex items-center justify-center"
              onClick={() => setIsDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
            <button className="chip-btn" onClick={() => setIsSearchOpen(true)}>
              🔍 Поиск
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
            {activeSection === 'analytics' && renderAnalytics()}
            {activeSection === 'heatmap' && renderHeatmap()}
            {activeSection === 'gallery' && renderCatGallery()}
            {activeSection === 'settings' && renderSettings()}
            {!['overview', 'habits', 'goals', 'calendar', 'journal', 'tasks', 'pomodoro', 'balance', 'analytics', 'heatmap', 'gallery', 'settings'].includes(activeSection) && (
              <div className="card flex flex-col items-center justify-center py-20 text-center">
                <div className="text-6xl mb-4 text-primary"><RefreshCw size={64} className="animate-spin" /></div>
                <h3 className="text-xl font-bold">Раздел в разработке</h3>
                <p className="text-muted">Скоро здесь будет магия</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Nav - Bottom removed as requested */}

      {/* Party Overlay */}
      <div id="partyOverlay" className="fixed inset-0 pointer-events-none z-[9990]" />
      <div id="partyBeatFlash" className="fixed inset-0 pointer-events-none z-[9991]" />

      {/* Toasts */}
      <div className="fixed bottom-24 right-4 flex flex-col gap-2 z-[2000] pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <Toast key={t.id} message={t.message} type={t.type} onClose={() => {}} />
          ))}
        </AnimatePresence>
      </div>

      {/* Cat Popup Overlay */}
      <CatPopup 
        data={catPopup} 
        onClose={() => setCatPopup(null)} 
        onSave={saveCatToGallery} 
        catLevel={state.cat.level}
        catExp={state.cat.exp}
      />

      {/* Confirm Modal */}
      <ConfirmModal 
        show={!!confirmModal?.show}
        title={confirmModal?.title || ''}
        text={confirmModal?.text || ''}
        onConfirm={confirmModal?.onConfirm || (() => {})}
        onCancel={() => setConfirmModal(null)}
      />

      {/* Day Modal */}
      <AnimatePresence>
        {isDayModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[6000] p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60" 
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
              className="absolute inset-0 bg-black/60" 
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
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-1 text-muted hover:text-primary">
                    <RefreshCw size={14} />
                  </button>
                )}
                <button onClick={() => setIsSearchOpen(false)} className="p-2 hover:bg-surface-2 rounded-xl">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {searchQuery ? (
                  <div className="space-y-6">
                    {/* Notes */}
                    {Object.entries(state.journalEntries)
                      .filter(([date, e]) => (e as JournalEntry).note.toLowerCase().includes(searchQuery.toLowerCase()))
                      .length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-muted font-bold uppercase tracking-widest px-2">Заметки</div>
                        <div className="grid gap-2">
                          {Object.entries(state.journalEntries)
                            .filter(([date, e]) => (e as JournalEntry).note.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(([date, e]) => {
                              const entry = e as JournalEntry;
                              return (
                                <div key={date} className="card cursor-pointer hover:bg-surface-2 group" onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); setIsSearchOpen(false); }}>
                                  <div className="flex justify-between items-start mb-1">
                                    <div className="font-bold text-sm">{date}</div>
                                    <div className="text-[10px] bg-primary-soft text-primary px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">Открыть</div>
                                  </div>
                                  <div className="text-xs text-muted line-clamp-2">{entry.note}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Tasks */}
                    {state.tasks
                      .filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
                      .length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-muted font-bold uppercase tracking-widest px-2">Задачи</div>
                        <div className="grid gap-2">
                          {state.tasks
                            .filter(t => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(t => (
                              <div key={t.id} className="card flex items-center gap-3 hover:bg-surface-2 cursor-pointer" onClick={() => handleTaskToggle(t.id)}>
                                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", t.done ? "bg-good border-good" : "border-line")}>
                                  {t.done && <Check size={12} className="text-white" />}
                                </div>
                                <div className="flex-1">
                                  <div className={cn("font-bold text-sm", t.done && "line-through text-muted")}>{t.text}</div>
                                  <div className="text-[10px] text-muted flex gap-2">
                                    <span>{t.priority === 'urgent' ? '🔥 Срочно' : t.priority === 'important' ? '⭐ Важно' : '☁️ Когда-нибудь'}</span>
                                    {t.tags.length > 0 && <span>• {t.tags.join(', ')}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Habits */}
                    {state.habits
                      .filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-muted font-bold uppercase tracking-widest px-2">Привычки</div>
                        <div className="grid gap-2">
                          {state.habits
                            .filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(h => (
                              <div key={h.id} className="card flex items-center gap-3 hover:bg-surface-2 cursor-pointer" onClick={() => { setActiveSection('habits'); setIsSearchOpen(false); }}>
                                <div className="w-10 h-10 rounded-2xl bg-surface-2 flex items-center justify-center text-xl">
                                  {h.icon}
                                </div>
                                <div>
                                  <div className="font-bold text-sm">{h.name}</div>
                                  <div className="text-[10px] text-muted">Выполнено {h.dates.length} раз</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {searchQuery && 
                      !state.tasks.some(t => t.text.toLowerCase().includes(searchQuery.toLowerCase())) &&
                      !state.habits.some(h => h.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
                      !Object.values(state.journalEntries).some(e => (e as JournalEntry).note.toLowerCase().includes(searchQuery.toLowerCase())) && (
                        <div className="text-center py-10">
                          <div className="text-4xl mb-4">🔍</div>
                          <div className="text-muted font-bold">Ничего не найдено</div>
                          <div className="text-xs text-muted mt-1">Попробуй изменить запрос</div>
                        </div>
                      )
                    }
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="text-4xl mb-4 opacity-20">✨</div>
                    <div className="text-muted font-bold">Что ищем сегодня?</div>
                    <div className="text-xs text-muted mt-1">Ищи по задачам, привычкам или заметкам в дневнике</div>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      <button onClick={() => setSearchQuery('важно')} className="tag">#важно</button>
                      <button onClick={() => setSearchQuery('идея')} className="tag">#идея</button>
                      <button onClick={() => setSearchQuery('цель')} className="tag">#цель</button>
                    </div>
                  </div>
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
                onClick={() => { setIsHabitModalOpen(true); setIsFABOpen(false); }}
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

        {/* Habit Modal */}
        <AnimatePresence>
          {isHabitModalOpen && (
            <div className="fixed inset-0 flex items-center justify-center z-[6000] p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                onClick={() => setIsHabitModalOpen(false)}
              />
              <motion.div 
                initial={{ y: 100, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 100, opacity: 0, scale: 0.9 }}
                className="relative bg-surface border-2 border-primary/20 rounded-[40px] shadow-2xl w-full max-w-md p-8 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                
                <h3 className="text-2xl font-black font-display mb-2">Новая привычка 🌱</h3>
                <p className="text-xs text-muted mb-6">Создай ритуал, который изменит твою жизнь</p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Название</label>
                    <input 
                      autoFocus
                      className="w-full bg-surface-2 border border-line rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="Напр: Читать 20 мин..."
                      value={newHabitName}
                      onChange={(e) => setNewHabitName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddHabit()}
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted px-1">Иконка</label>
                    <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {['🌱', '💧', '🏃', '🧘', '🍎', '📚', '✍️', '🎸', '🎨', '💻', '🧠', '☀️', '🌑', '🚶', '🚴', '🏋️', '🥗', '🥛', '🍵', '💤', '🔋', '🎯', '🌈', '🧩', '🎭', '🧶', '🪴', '🐾', '✨', '⚡', '🔥', '💎', '🦄', '🍀', '🐳', '🦊', '🦉', '🍓', '🥑'].map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => setNewHabitIcon(emoji)}
                          className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all hover:scale-110",
                            newHabitIcon === emoji ? "bg-primary text-white shadow-glow" : "bg-bg-soft hover:bg-surface-2"
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button className="flex-1 btn bg-surface-2 text-text border-line" onClick={() => setIsHabitModalOpen(false)}>Отмена</button>
                    <button className="flex-1 btn" onClick={handleAddHabit}>Создать</button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Weekly Report Modal */}
        <AnimatePresence>
          {isReportModalOpen && (() => {
            const last7Days = Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() - (6 - i));
              return isoDate(d);
            });

            const completedTasksThisWeek = state.tasks.filter(t => t.done && t.completedAt && last7Days.includes(t.completedAt));
            const tasksByPriority = {
              urgent: completedTasksThisWeek.filter(t => t.priority === 'urgent').length,
              important: completedTasksThisWeek.filter(t => t.priority === 'important').length,
              someday: completedTasksThisWeek.filter(t => t.priority === 'someday').length,
            };

            const habitReport = state.habits.map(h => {
              const completedThisWeek = h.dates.filter(d => last7Days.includes(d)).length;
              return { name: h.name, icon: h.icon, count: completedThisWeek };
            });

            const moodData = last7Days.map(date => {
              const entry = state.journalEntries[date] as JournalEntry;
              return entry?.mood ? entry.mood : null;
            });
            
            const moodValid = moodData.filter(m => m !== null) as number[];
            const avgMood = moodValid.length > 0 ? moodValid.reduce((acc, m) => acc + m, 0) / moodValid.length : 0;

            return (
              <div className="fixed inset-0 flex items-center justify-center z-[6000] p-4 text-text">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                  onClick={() => setIsReportModalOpen(false)}
                />
                <motion.div 
                  initial={{ y: 50, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 50, opacity: 0, scale: 0.95 }}
                  className="relative bg-surface border border-line rounded-[40px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
                >
                  <div className="p-8 pb-4 border-b border-line flex justify-between items-center">
                    <div>
                      <h3 className="text-3xl font-black font-display">Отчёт недели 📊</h3>
                      <p className="text-xs text-muted">Твои успехи за последние 7 дней</p>
                    </div>
                    <button className="chip-btn p-3" onClick={() => setIsReportModalOpen(false)}>
                      <X size={24} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    {/* Tasks Summary */}
                    <section className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted">Выполненные задачи</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="card p-4 flex flex-col items-center justify-center text-center bg-primary/5 border-primary/10">
                          <div className="text-2xl font-black text-primary">{tasksByPriority.urgent}</div>
                          <div className="text-[8px] font-bold uppercase tracking-wider mt-1 opacity-60">Срочные</div>
                        </div>
                        <div className="card p-4 flex flex-col items-center justify-center text-center bg-accent/5 border-accent/10">
                          <div className="text-2xl font-black text-accent">{tasksByPriority.important}</div>
                          <div className="text-[8px] font-bold uppercase tracking-wider mt-1 opacity-60">Важные</div>
                        </div>
                        <div className="card p-4 flex flex-col items-center justify-center text-center bg-surface-2">
                          <div className="text-2xl font-black">{tasksByPriority.someday}</div>
                          <div className="text-[8px] font-bold uppercase tracking-wider mt-1 opacity-60">Второстеп.</div>
                        </div>
                      </div>
                    </section>

                    {/* Habits Summary */}
                    <section className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted">Привычки (дней из 7)</h4>
                      <div className="space-y-4">
                        {habitReport.length > 0 ? habitReport.map((h, i) => (
                          <div key={i} className="flex items-center gap-4">
                            <span className="text-2xl">{h.icon}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-xs font-bold mb-1.5">
                                <span>{h.name}</span>
                                <span className={cn(h.count === 7 ? "text-good" : "text-primary")}>{h.count} / 7</span>
                              </div>
                              <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(h.count / 7) * 100}%` }}
                                  className={cn("h-full transition-colors", h.count === 7 ? "bg-good" : "bg-primary")}
                                />
                              </div>
                            </div>
                          </div>
                        )) : (
                          <p className="text-xs text-muted opacity-60">Привычки не настроены</p>
                        )}
                      </div>
                    </section>

                    {/* Mood Dynamics */}
                    <section className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted text-left">Динамика настроения</h4>
                        {avgMood > 0 && (
                          <div className="text-[10px] font-bold text-primary">Ср: {MOOD_SCALE.find(m => m.v === Math.round(avgMood))?.l || ''}</div>
                        )}
                      </div>
                      <div className="flex items-end justify-between h-28 gap-1 px-4 pt-6 border-b border-line/40">
                        {moodData.map((m, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-2">
                            {m ? (
                              <motion.div 
                                initial={{ height: 0 }}
                                animate={{ height: `${(m / 5) * 100}%` }}
                                className="w-full max-w-[16px] bg-primary rounded-t-xl relative group transition-all hover:bg-primary-2"
                              >
                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                  {MOOD_SCALE.find(ms => ms.v === m)?.e}
                                </div>
                              </motion.div>
                            ) : (
                              <div className="w-full max-w-[16px] h-1.5 bg-surface-2 rounded-full mb-1" />
                            )}
                            <span className="text-[9px] text-muted font-black uppercase mt-1">
                              {new Date(last7Days[i]).toLocaleDateString('ru-RU', { weekday: 'short' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="p-8 pt-4 border-t border-line text-center bg-surface-2/30">
                    <p className="text-xs italic text-muted">"{RANDOM_THOUGHTS[Math.floor(Math.random() * RANDOM_THOUGHTS.length)]}"</p>
                    <button className="btn mt-6 w-full py-4 rounded-2xl" onClick={() => setIsReportModalOpen(false)}>Понятно!</button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
    </ErrorBoundary>
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
