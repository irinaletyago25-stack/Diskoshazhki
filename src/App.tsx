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
  ChevronDown, Play, Square, SkipForward, Archive, ArchiveRestore, Pencil, History,
  TrendingUp, Clock, Hash, Percent, Award
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
import { 
  cn, countHabitsOnDate, pluralize 
} from './lib/utils';
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

const EmptyState = ({ icon, title, text }: { icon: string, title: string, text: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4"
  >
    <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center text-4xl shadow-inner border border-primary/10">
      {icon}
    </div>
    <div>
      <h4 className="text-lg font-bold font-display">{title}</h4>
      <p className="text-xs text-muted max-w-[200px] mx-auto leading-relaxed">{text}</p>
    </div>
  </motion.div>
);

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
  onRefresh,
  catLevel,
  catExp
}: { 
  data: { show: boolean, isAllDone: boolean, img: string, mood: any, breed?: string } | null, 
  onClose: () => void,
  onSave: (url: string) => void,
  onRefresh: () => void,
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
            {data.img === 'error' ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                <div className="text-4xl text-muted opacity-40">😿</div>
                <p className="text-xs text-muted font-bold">Котик спит, не будем будить. Проверь интернет!</p>
                <button onClick={onRefresh} className="chip-btn py-2 px-6 flex items-center gap-2">
                  <RefreshCw size={14} /> Повторить
                </button>
              </div>
            ) : data.img ? (
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
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
               <div className={cn(
                 "backdrop-blur-sm px-4 py-2 rounded-full text-xs font-bold shadow-sm flex items-center gap-2 max-w-[80%]",
                 data.isAllDone ? "bg-primary text-white" : "bg-white/90 text-primary"
               )}>
                 <span className="text-lg flex-shrink-0">{data.mood.emoji}</span>
                 <span className="truncate">{data.mood.phrase}</span>
               </div>
               
               {data.img && data.img !== 'error' && (
                 <button 
                   onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                   className="p-2 bg-white/90 text-primary rounded-full shadow-sm hover:scale-110 transition-transform active:scale-95"
                 >
                   <RefreshCw size={18} />
                 </button>
               )}
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
  onDateClick,
  theme
}: { 
  data: Record<string, { val: number; entry: JournalEntry | null; habitsCount: number; completedHabitNames: string[] }>; 
  year: number;
  onDateClick: (date: string) => void;
  theme: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ 
    show: boolean; 
    date: string; 
    mood: number | null; 
    habits: number; 
    habitNames: string[];
    noteSnippet: string;
    x: number; 
    y: number 
  }>({
    show: false, date: '', mood: null, habits: 0, habitNames: [], noteSnippet: '', x: 0, y: 0
  });

  const isCyber = theme === 'cyberpunk';
  const isDark = theme === 'dark' || isCyber;

  const heatmapColors = isCyber
    ? [
        '#0f0025',             // Level 0
        '#300030',             // Level 1
        '#600060',             // Level 2
        '#ff00ff',             // Level 3
        '#00ffff'              // Level 4 (Cyan accent)
      ]
    : isDark 
      ? [
          '#1b131d',                     // Level 0
          'rgba(255, 93, 172, 0.2)',     // Level 1
          'rgba(255, 93, 172, 0.45)',    // Level 2
          'rgba(255, 93, 172, 0.75)',    // Level 3
          '#ff5dac'                      // Level 4
        ]
      : [
          '#f1f5f9',                     // Level 0
          'rgba(255, 93, 172, 0.15)',    // Level 1
          'rgba(255, 93, 172, 0.35)',    // Level 2
          'rgba(255, 93, 172, 0.65)',    // Level 3
          '#ec4899'                      // Level 4
        ];
  
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

      const r = innerR + (outerR - innerR) * (0.25 + (Math.min(day.val, 4) / 4) * 0.75);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, isToday ? outerR + 5 : r, a1, a2);
      ctx.closePath();
      ctx.fillStyle = isToday ? todayColor : heatmapColors[Math.min(day.val, 4)];
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
      const dayInfo = data[iso] || { val: 0, entry: null, habitsCount: 0, completedHabitNames: [] };
      
      setTooltip({
        show: true,
        date: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
        mood: dayInfo.entry?.mood || null,
        habits: dayInfo.habitsCount,
        habitNames: dayInfo.completedHabitNames || [],
        noteSnippet: dayInfo.entry?.note?.slice(0, 60) || '',
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
          className="fixed z-[9999] bg-surface border border-line rounded-2xl p-4 shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150 max-w-[240px]"
          style={{ left: tooltip.x + 15, top: tooltip.y - 120 }}
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 opacity-60 border-b border-line pb-1">{tooltip.date}</div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">{tooltip.mood ? MOOD_SCALE.find(m => m.v === tooltip.mood)?.e : '😶'}</span>
            <div>
              <div className="text-xs font-black text-text leading-tight">{tooltip.habits} {pluralize(tooltip.habits, ['привычка', 'привычки', 'привычек'])}</div>
              <div className="text-[9px] font-bold text-muted uppercase tracking-tighter">энергия дня</div>
            </div>
          </div>
          {tooltip.habitNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tooltip.habitNames.map((n, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-primary/10 text-primary text-[8px] font-bold rounded-md uppercase">{n}</span>
              ))}
            </div>
          )}
          {tooltip.noteSnippet && (
            <div className="text-[10px] text-muted italic leading-relaxed line-clamp-2 border-t border-line/50 pt-2">
              «{tooltip.noteSnippet}{tooltip.noteSnippet.length >= 60 ? '...' : ''}»
            </div>
          )}
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
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div 
        className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-all duration-300 ease-out"
        style={{ 
          left: mousePos.x - 300, 
          top: mousePos.y - 300,
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)'
        }}
      />
      <div className="bg-lamps pointer-events-none">
        <div className="absolute lamp w-64 h-64 bg-primary/10 rounded-full blur-[120px] top-1/4 left-1/4" />
        <div className="absolute lamp w-96 h-96 bg-primary-2/10 rounded-full blur-[160px] top-3/4 left-2/3" />
        <div className="absolute lamp w-80 h-80 bg-accent/10 rounded-full blur-[140px] top-1/2 left-1/10" />
      </div>
    </div>
  );
};

export default function App() {
  const [state, setState, lastSaved] = useAppState();
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const [activeSection, setActiveSection] = useState('overview');
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<{ id: string, message: string, type: string }[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Sound & Audio ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambientNodeRef = useRef<AudioNode | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  };

  const playSound = (type: 'click' | 'success' | 'pop' | 'tick' | 'purr' | 'hover') => {
    if (!state.settings.soundEffects) return;
    
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const theme = state.settings.theme;
      const now = ctx.currentTime;
      
      const playSimple = (freq: number, dur: number, glide: number, wave: OscillatorType = 'sine', gainVal = 0.1) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, now);
        if (glide !== freq) osc.frequency.exponentialRampToValueAtTime(glide, now + dur);
        gain.gain.setValueAtTime(gainVal, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
      };

      if (type === 'click') {
        if (theme === 'cyberpunk') playSimple(800, 0.05, 200, 'square', 0.05);
        else if (theme === 'pink') playSimple(600, 0.15, 300, 'sine', 0.08);
        else if (theme === 'dark') playSimple(200, 0.08, 50, 'triangle', 0.1);
        else playSimple(400, 0.1, 100, 'sine', 0.1);
      } else if (type === 'success') {
        if (theme === 'cyberpunk') {
          playSimple(440, 0.1, 880, 'sawtooth', 0.05);
          playSimple(880, 0.2, 1760, 'sawtooth', 0.03);
        } else if (theme === 'pink') {
          playSimple(523.25, 0.4, 523.25, 'sine', 0.1);
          setTimeout(() => playSimple(659.25, 0.4, 659.25, 'sine', 0.08), 100);
          setTimeout(() => playSimple(783.99, 0.4, 783.99, 'sine', 0.06), 200);
        } else {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = theme === 'dark' ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
          osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.3);
        }
      } else if (type === 'pop') {
        playSimple(200, 0.05, 600, theme === 'cyberpunk' ? 'square' : 'sine', 0.1);
      } else if (type === 'purr') {
        // Vibrating low frequency for mrrrrr
        for(let i=0; i<5; i++) {
          setTimeout(() => playSimple(150 + Math.random()*20, 0.1, 120, 'triangle', 0.15), i * 150);
        }
      } else if (type === 'hover') {
        playSimple(theme === 'cyberpunk' ? 1200 : 800, 0.02, theme === 'cyberpunk' ? 1000 : 800, 'sine', 0.02);
      } else if (type === 'tick') {
        playSimple(theme === 'cyberpunk' ? 1000 : 800, 0.02, theme === 'cyberpunk' ? 1000 : 800, 'square', 0.03);
      }
    } catch (e) {
      console.warn('Audio not supported or blocked');
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  // Global Hover Sound Listener
  useEffect(() => {
    if (!state.settings.soundEffects) return;
    
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('button, a, .chip-btn, .nav button, input, select');
      if (isInteractive) {
        playSound('hover');
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    return () => document.removeEventListener('mouseover', handleMouseOver);
  }, [state.settings.soundEffects, state.settings.theme]);
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
  const [taskFilter, setTaskFilter] = useState({ 
    priority: 'all', 
    status: 'all', 
    search: '', 
    showAllDates: false,
    sortBy: 'priority' as 'priority' | 'date' | 'status',
    selectedTags: [] as string[]
  });
  const [newTaskIcon, setNewTaskIcon] = useState('📝');
  const [newTaskTags, setNewTaskTags] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [dayModalTaskText, setDayModalTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('important');
  const [newTaskDate, setNewTaskDate] = useState(todayISO());
  const [newTaskRecurring, setNewTaskRecurring] = useState<Task['recurring']>('none');
  const [newTaskRecurringDays, setNewTaskRecurringDays] = useState<number[]>([]);
  const [taskViewDate, setTaskViewDate] = useState(todayISO());
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [catPopup, setCatPopup] = useState<{ show: boolean, isAllDone: boolean, img: string, mood: any } | null>(null);
  
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [showArchivedHabits, setShowArchivedHabits] = useState(false);
  
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalModalStep, setGoalModalStep] = useState(1);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [showArchivedGoals, setShowArchivedGoals] = useState(false);
  
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState(100);
  const [goalUnit, setGoalUnit] = useState('%');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalIcon, setGoalIcon] = useState('🎯');
  const [goalColor, setGoalColor] = useState('#ff5dac');
  const [goalStepValue, setGoalStepValue] = useState(1);
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

  // --- Task Maintenance (Rollover + Recurring + Weekly Cat) ---
  useEffect(() => {
    const checkAutomation = () => {
      const currentState = stateRef.current;
      const today = todayISO();
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();

      // Sunday 11:00 PM (23:00) check
      if (dayOfWeek === 0 && hour >= 23) {
        const sunISO = todayISO();
        if (currentState.lastWeeklyCatDate !== sunISO) {
          generateWeeklyCat();
        }
      }

      if (currentState.lastRecurringReset !== today) {
        handleStateChange(prev => {
          // 1. Rollover !done tasks from the past to today
          const tasksToMove = prev.tasks.filter(t => !t.done && t.date < today);
          const rollingTasks = tasksToMove.map(t => ({ 
            ...t, 
            date: today, 
            isRolledOver: true,
            rolloverCount: (t.rolloverCount || 0) + 1
          }));

          // Gentle reminders for stuck tasks
          rollingTasks.forEach(rt => {
            if (rt.rolloverCount && rt.rolloverCount >= 3) {
              const name = prev.settings.userName || 'друг';
              showToast(`${name}, кажется, задача "${rt.text}" забирает много энергии. Может, стоит её разбить или отложить?`, 'info');
            }
          });

          // 2. Keep others (future tasks or completed past tasks)
          let nextTasks = prev.tasks.filter(t => !(!t.done && t.date < today));
          
          // Merge rolled over tasks
          rollingTasks.forEach(rt => {
            const exists = nextTasks.some(t => t.text === rt.text && t.date === rt.date);
            if (!exists) nextTasks.push(rt);
          });

          // 3. Generate recurring instances for today
          const seeds = prev.tasks.filter(t => t.recurring && t.recurring !== 'none');
          seeds.forEach(seed => {
            const alreadyExistsToday = nextTasks.some(t => t.text === seed.text && t.date === today);
            if (!alreadyExistsToday) {
              let shouldCreate = false;
              if (seed.recurring === 'daily') shouldCreate = true;
              if (seed.recurring === 'weekdays' && [1,2,3,4,5].includes(now.getDay())) shouldCreate = true;
              if (seed.recurring === 'weekly' && seed.recurringDays?.includes(now.getDay())) shouldCreate = true;
              
              if (shouldCreate) {
                nextTasks.push({ 
                  ...seed, 
                  id: id(), 
                  date: today, 
                  done: false, 
                  isRolledOver: false,
                  completedAt: undefined 
                });
              }
            }
          });

          return { 
            ...prev, 
            tasks: nextTasks, 
            lastRecurringReset: today 
          };
        });
      }
    };

    checkAutomation();
    const intervalId = setInterval(checkAutomation, 60000); // Check every minute for Sunday 23:00 trigger
    return () => clearInterval(intervalId);
  }, [state.lastRecurringReset, state.lastWeeklyCatDate, state.settings.userName]);

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

  const lastNotifiedRef = useRef<string | null>(null);

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
      
      // Use previous duration or logical defaults
      let nextDuration = 25;
      if (nextMode === 'break') {
        nextDuration = 5;
      } else {
        // Try to keep the previous work duration if it was something special like 50
        nextDuration = state.pomodoro.duration > 20 ? state.pomodoro.duration : 25;
      }
      
      const nextTime = nextDuration * 60;
      
      const cycleKey = `${state.pomodoro.mode}-${state.pomodoro.sessionsCompleted}`;
      if (lastNotifiedRef.current !== cycleKey) {
        lastNotifiedRef.current = cycleKey;
        showToast(isWork ? 'Время отдыхать! ☕' : 'Пора за работу! 💻', 'success');
        if (state.settings.notifEnabled) {
          try {
            new Notification(isWork ? 'Фокус завершен' : 'Перерыв окончен', {
              body: isWork ? 'Отличная работа! Отдохни 5 минут.' : 'Возвращаемся к задачам!',
              icon: '🪩'
            });
          } catch (e) {
            console.warn("Notification failed", e);
          }
        }
      }
      
      handleStateChange(prev => ({
        ...prev,
        pomodoro: { 
          ...prev.pomodoro, 
          mode: nextMode, 
          timeLeft: nextTime, 
          isActive: false,
          sessionsCompleted: isWork ? prev.pomodoro.sessionsCompleted + 1 : prev.pomodoro.sessionsCompleted,
          totalFocusMinutes: isWork ? (prev.pomodoro.totalFocusMinutes || 0) + prev.pomodoro.duration : (prev.pomodoro.totalFocusMinutes || 0)
        }
      }));
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
      if (a.id === 'cat_level_5' && state.cat.level >= 5) unlocked = true;

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

    setPartyClicks(prev => prev + 1);
  };

  useEffect(() => {
    if (partyClicks >= 5) {
      if (!isPartyModeRef.current) {
        activatePartyMode();
      }
      setPartyClicks(0);
    }
  }, [partyClicks]);

  const activatePartyMode = () => {
    if (isPartyModeRef.current) return;
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

  // --- New AI Features Helpers ---
  const handleSmartSplit = async (task: Task) => {
    if (isAIThinking) return;
    setIsAIThinking(true);
    showToast('ИИ подбирает бережные шаги...', 'info');
    try {
      const prompt = `Разбей задачу "${task.text}" на 5-7 маленьких, максимально простых и нестрашных подзадач. 
      Ответь ТОЛЬКО списком JSON строк, например: ["шаг 1", "шаг 2"]. 
      Бережный тон, на русском языке. Каждая подзадача должна звучать как маленькое действие.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Ты — ассистент по декомпозиции задач. Твоя цель — сделать сложное простым и приятным. Отвечай строго валидным JSON массивом строк.",
        }
      });

      const steps = JSON.parse(response.text);
      if (Array.isArray(steps)) {
        handleStateChange(prev => {
          // Remove the original daunting task and insert new ones
          const otherTasks = prev.tasks.filter(t => t.id !== task.id);
          const newSubTasks = steps.map(stepText => ({
            id: id(),
            text: stepText,
            done: false,
            priority: task.priority,
            date: task.date,
            recurring: 'none' as const,
            tags: [...(task.tags || []), 'split'],
            focus: false,
            icon: '🐾'
          }));
          return {
            ...prev,
            tasks: [...newSubTasks, ...otherTasks]
          };
        });
        showToast('Задача бережно разделена на шажки! 🐾', 'success');
        confetti({ particleCount: 50, spread: 40, origin: { y: 0.8 } });
      }
    } catch (err) {
      console.error(err);
      showToast('ИИ запутался в детальках, попробуй позже', 'error');
    } finally {
      setIsAIThinking(false);
    }
  };

  const generateWeeklyCat = async () => {
    if (isAIThinking) return;
    setIsAIThinking(true);
    try {
      const currentState = stateRef.current;
      // Analyze week: Mood, habits, tasks
      const lastWeekDates = [];
      // Include today if it's Sunday evening
      for(let i=0; i<7; i++) lastWeekDates.push(isoDate(new Date(Date.now() - i * 86400000)));
      
      const moods = lastWeekDates.map(d => (currentState.journalEntries[d] as JournalEntry)?.mood).filter(Boolean);
      const avgMood = moods.length ? moods.reduce((a, b) => a! + b!, 0)! / moods.length : 3;
      const completedTasks = currentState.tasks.filter(t => t.done && lastWeekDates.includes(t.completedAt || '')).length;
      const habitCount = currentState.habits.reduce((acc, h) => acc + h.dates.filter(d => lastWeekDates.includes(d)).length, 0);

      const prompt = `Создай образ котика для итога недели. 
      Контекст: Среднее настроение ${avgMood.toFixed(1)}/5, выполнено задач: ${completedTasks}, привычек: ${habitCount}.
      Если много работала — Котик-Профессор, если отдыхала — Котик в гамаке. 
      Опиши котика для генерации изображения. Стиль: милый, 2D иллюстрация, пастельные тона, уютный.
      Всегда включай в запрос "Cute cat, digital art, high quality, cozy atmosphere".`;

      showToast('ИИ рисует твоего кота недели... 🎨', 'info');

      // 1. Get Prompt
      const textResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      // 2. Generate Image
      const imageResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          { text: `Generate image: ${textResponse.text}. Masterpiece, best quality, cute cat style.` }
        ]
      });

      const part = imageResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (part?.inlineData) {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        const lastSun = new Date();
        lastSun.setDate(lastSun.getDate() - lastSun.getDay()); // Closest Sunday
        handleStateChange(prev => ({
          ...prev,
          catGallery: [url, ...prev.catGallery].slice(0, 50),
          lastWeeklyCatDate: isoDate(lastSun)
        }));
        showToast('Твой Котик Недели готов! 🐈✨ Сохранен в галерею.', 'success');
      }
    } catch (err) {
      console.error(err);
      // No toast on auto-gen to avoid annoyance if it fails silently
    } finally {
      setIsAIThinking(false);
    }
  };

  const extractTasksFromJournal = async () => {
    if (isAIThinking) return;
    const entry = state.journalEntries[todayISO()] as JournalEntry;
    if (!entry?.note?.trim()) {
      showToast('Сначала напиши что-нибудь в дневник ✨', 'info');
      return;
    }

    setIsAIThinking(true);
    try {
      const prompt = `Проанализируй следующую запись в дневнике и выдели из неё список конкретных задач (дел), которые нужно сделать. 
      Запись: "${entry.note}"
      Отвечай строго валидным JSON массивом объектов: [{"text": "название задачи", "priority": "important" | "urgent" | "someday"}].
      Если задач нет, верни пустой массив []. Тон задач должен быть бережным.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Ты — ассистент по планированию. Тщательно выделяй конкретные намерения и задачи из текста дневника.",
        }
      });

      const tasks = JSON.parse(response.text);
      if (Array.isArray(tasks) && tasks.length > 0) {
        tasks.forEach((t: any) => handleAddTask(t.text, t.priority || 'important', todayISO()));
        showToast(`Бережно добавлено задач: ${tasks.length} 🐾`, 'success');
        confetti({ particleCount: 30, spread: 30, origin: { y: 0.9 } });
      } else {
        showToast('ИИ не нашел новых задач в этой записи', 'info');
      }
    } catch (err) {
      console.error(err);
      showToast('ИИ запнулся, попробуй чуть позже', 'error');
    } finally {
      setIsAIThinking(false);
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
      const isAllDone = state.habits.filter(h => !h.archived).every(h => {
        const isInPrevState = h.dates.includes(today);
        if (h.id === habitId) return true; // We know it's being marked done
        return isInPrevState;
      }) && state.habits.filter(h => !h.archived).length > 0;
      showCat(isAllDone);
      gainExp(20);
    }
  };

  const handleArchiveHabit = (habitId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === habitId ? { ...h, archived: true } : h)
    }));
    showToast('Привычка заархивирована', 'info');
  };

  const handleUnarchiveHabit = (habitId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === habitId ? { ...h, archived: false } : h)
    }));
    showToast('Привычка возвращена из архива', 'success');
  };

  const handleDeleteHabit = (habitId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      habits: prev.habits.filter(h => h.id !== habitId)
    }));
    showToast('Привычка удалена', 'info');
  };

  // --- Goals Handlers ---
  const handleSaveGoal = () => {
    if (!goalName) {
      showToast('Введи название цели', 'error');
      return;
    }
    
    handleStateChange(prev => {
      const newGoal: Goal = {
        id: editingGoalId || id(),
        name: goalName,
        target: goalTarget,
        unit: goalUnit,
        deadline: goalDeadline,
        icon: goalIcon,
        color: goalColor,
        step: goalStepValue,
        progress: editingGoalId ? (prev.goals.find(g => g.id === editingGoalId)?.progress || 0) : 0,
        history: editingGoalId ? (prev.goals.find(g => g.id === editingGoalId)?.history || []) : [],
        archived: false
      };

      if (editingGoalId) {
        return {
          ...prev,
          goals: prev.goals.map(g => g.id === editingGoalId ? newGoal : g)
        };
      } else {
        return {
          ...prev,
          goals: [newGoal, ...prev.goals]
        };
      }
    });

    setIsGoalModalOpen(false);
    setGoalName('');
    setEditingGoalId(null);
    setGoalModalStep(1);
    showToast(editingGoalId ? 'Цель обновлена ✨' : 'Цель поставлена! 🎯', 'success');
    playSound('success');
  };

  const handleArchiveGoal = (goalId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === goalId ? { ...g, archived: true } : g)
    }));
    showToast('Цель сохранена в Зал Славы 🏆', 'success');
  };

  const handleUnarchiveGoal = (goalId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === goalId ? { ...g, archived: false } : g)
    }));
    showToast('Цель возвращена в активные', 'success');
  };

  const handleDeleteGoal = (goalId: string) => {
    playSound('pop');
    handleStateChange(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== goalId)
    }));
    showToast('Цель удалена', 'info');
  };

  const openGoalModal = (goal?: Goal) => {
    if (goal) {
      setEditingGoalId(goal.id);
      setGoalName(goal.name);
      setGoalTarget(goal.target);
      setGoalUnit(goal.unit);
      setGoalDeadline(goal.deadline);
      setGoalIcon(goal.icon || '🎯');
      setGoalColor(goal.color || '#ff5dac');
      setGoalStepValue(goal.step || 1);
    } else {
      setEditingGoalId(null);
      setGoalName('');
      setGoalTarget(100);
      setGoalUnit('%');
      setGoalDeadline('');
      setGoalIcon('🎯');
      setGoalColor('#ff5dac');
      setGoalStepValue(1);
    }
    setGoalModalStep(1);
    setIsGoalModalOpen(true);
  };

  const handleTaskToggle = (taskId: string) => {
    playSound('click');
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const willBeDone = !task.done;

    handleStateChange(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, done: willBeDone, completedAt: willBeDone ? todayISO() : undefined } : t),
      pomodoro: (willBeDone && prev.pomodoro.focusTaskId === taskId) 
        ? { ...prev.pomodoro, focusTaskId: null } 
        : prev.pomodoro
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

  const handleAddTask = (
    text: string, 
    priority: Task['priority'] = 'important', 
    date?: string, 
    recurring: Task['recurring'] = 'none', 
    recurringDays?: number[],
    icon: string = '📝',
    tags: string[] = []
  ) => {
    if (!text.trim()) return;
    const taskDate = date || todayISO();
    handleStateChange(prev => ({
      ...prev,
      tasks: [
        { 
          id: id(), 
          text, 
          done: false, 
          priority, 
          date: taskDate,
          recurring, 
          recurringDays,
          tags: tags.map(t => t.trim()).filter(Boolean), 
          focus: false,
          icon
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
        playSound('purr');
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
    
    await fetchNextCat();
  };

  const fetchNextCat = async () => {
    const cat = await fetchRandomCat();
    if (cat) {
      const breed = cat.breeds?.[0];
      const breedName = breed?.name ? `${breed.name} · ${(breed.temperament||'').split(',')[0]}` : undefined;
      setCatPopup(prev => prev ? { ...prev, img: cat.url, breed: breedName } : null);
    } else {
      setCatPopup(prev => prev ? { ...prev, img: 'error' } : null);
    }
  };

  const saveCatToGallery = (url: string) => {
    if (!url) return;
    playSound('purr');
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
      <div className="flex flex-col items-center space-y-12 py-8 max-w-2xl mx-auto">
        {/* Immersive Focus Header */}
        <div className="text-center space-y-3">
          <h2 className="text-5xl lg:text-7xl font-black tracking-tighter font-display leading-none flex items-center justify-center gap-4">
            <span className="bg-gradient-to-r from-primary to-primary-2 bg-clip-text text-transparent">
              {state.pomodoro.mode === 'work' ? 'Время фокуса' : 'Время отдыха'}
            </span>
            <span className="text-text">
              {state.pomodoro.mode === 'work' ? '🎯' : '✨'}
            </span>
          </h2>
          <p className="text-muted text-xs font-black uppercase tracking-[0.4em] opacity-60">
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
        <div className="relative w-80 h-80 lg:w-96 lg:h-96 mx-auto">
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

          <svg className="w-full h-full -rotate-90 drop-shadow-xl overflow-visible" viewBox="0 0 320 320">
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

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-8xl lg:text-9xl font-black font-mono tracking-tighter tabular-nums drop-shadow-2xl">
              {formatTime(state.pomodoro.timeLeft)}
            </div>
            <div className={cn(
              "mt-4 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border",
              state.pomodoro.isActive ? "bg-primary/10 border-primary text-primary" : "bg-muted/10 border-line text-muted"
            )}>
              {state.pomodoro.isActive ? 'Идёт отсчёт •••' : 'На паузе'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted opacity-60">Амбиент</span>
            <div className="flex bg-surface-2 p-1 rounded-2xl border border-line">
              {[
                { id: 'none', icon: '🔇' },
                { id: 'cyber', icon: '🤖' },
                { id: 'space', icon: '🪐' },
                { id: 'rain', icon: '🌧️' }
              ].map(a => (
                <button
                  key={a.id}
                  onClick={() => handleStateChange(prev => ({ ...prev, pomodoro: { ...prev.pomodoro, ambientType: a.id as any } }))}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-xl transition-all",
                    state.pomodoro.ambientType === a.id ? "bg-primary text-white shadow-sm" : "hover:bg-surface"
                  )}
                >
                  {a.icon}
                </button>
              ))}
            </div>
          </div>

          <div className="h-10 w-px bg-line/40 mx-2" />

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
            <div className="text-3xl font-black">
              {Math.floor((state.pomodoro.totalFocusMinutes || 0) / 60)}ч {(state.pomodoro.totalFocusMinutes || 0) % 60}м
            </div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Время в фокусе (всего)</div>
          </div>
        </div>
      </div>
    );
  };

  const renderBalance = () => {
    const categories = Object.keys(state.balance);
    const angleStep = (Math.PI * 2) / categories.length;
    
    // Get historical data for comparison
    const historyKeys = Object.keys(state.balanceHistory || {}).sort();
    const prevMonthKey = historyKeys.length > 0 ? historyKeys[historyKeys.length - 1] : null;
    const historyData = prevMonthKey ? state.balanceHistory[prevMonthKey] : null;

    return (
      <div className="space-y-10">
        <div className="section-header px-2">
          <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display text-text leading-none">Колесо баланса 🎡</h3>
          <p className="text-xs text-muted font-black uppercase tracking-[0.2em] mt-2 opacity-60">Гармония во всех сферах твоей жизни</p>
        </div>

        <div className="card relative flex flex-col items-center justify-center py-20 overflow-hidden bg-gradient-to-br from-surface via-surface to-primary-soft/10 border-line/40 shadow-xl shadow-primary/5 rounded-[40px]">
          {/* Legend for comparison */}
          {historyData && (
            <div className="absolute top-8 left-8 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span>Сейчас</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-50">
                <div className="w-3 h-3 rounded-full bg-muted" />
                <span>Прошлый слепок ({prevMonthKey})</span>
              </div>
            </div>
          )}

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

              {/* Historical Radar Shape */}
              {historyData && (
                <polygon 
                  points={categories.map((cat, i) => {
                    const r = (historyData[cat] || 0) * 15;
                    const x = 160 + Math.cos(i * angleStep - Math.PI/2) * r;
                    const y = 160 + Math.sin(i * angleStep - Math.PI/2) * r;
                    return `${x},${y}`;
                  }).join(' ')}
                  className="fill-muted/10 stroke-muted/40"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              )}

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


  const renderGoals = () => {
    const activeGoals = state.goals.filter(g => !g.archived);
    const archivedGoals = state.goals.filter(g => g.archived);
    const visibleGoals = showArchivedGoals ? archivedGoals : activeGoals;

    return (
      <div className="space-y-10">
        <div className="section-header flex flex-col sm:flex-row justify-between items-start sm:items-end px-2 gap-4">
          <div className="space-y-2">
            <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display leading-none">
              {showArchivedGoals ? 'Зал Славы 🏆' : 'Твои цели 🎯'}
            </h3>
            <p className="text-xs text-muted font-black uppercase tracking-[0.2em] opacity-60">
              {showArchivedGoals ? 'Твои великие достижения' : 'Масштабное видение будущего'}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <button 
              className={cn(
                "chip-btn py-4 px-6 text-xs font-bold transition-all flex items-center gap-2",
                showArchivedGoals ? "bg-primary text-white" : "text-muted hover:text-primary"
              )}
              onClick={() => setShowArchivedGoals(!showArchivedGoals)}
            >
              {showArchivedGoals ? <History size={16} /> : <Award size={16} />}
              {showArchivedGoals ? 'К активным' : 'Зал славы'}
              {archivedGoals.length > 0 && !showArchivedGoals && (
                <span className="bg-primary-soft text-primary px-1.5 py-0.5 rounded-full text-[9px] -mr-2">
                  {archivedGoals.length}
                </span>
              )}
            </button>
            {!showArchivedGoals && (
              <button 
                className="chip-btn py-4 px-8 shadow-sm hover:shadow-lg transition-all flex items-center gap-3 border-primary/20 text-primary font-bold text-xs"
                onClick={() => openGoalModal()}
              >
                <Plus size={18} /> Добавить цель
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {visibleGoals.map(g => {
              const pct = Math.max(0, Math.min(100, (g.progress / g.target) * 100 || 0));
              const goalColor = g.color || '#ff5dac';
              const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null;
              const remaining = Math.max(0, g.target - g.progress);
              const perDay = (daysLeft && daysLeft > 0) ? (remaining / daysLeft).toFixed(1) : null;

              return (
                <motion.div 
                  key={g.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="card p-6 space-y-6 relative overflow-hidden group border-line hover:border-primary/40 transition-all hover:shadow-xl"
                  style={{ '--goal-color': goalColor } as any}
                >
                  <div className="flex justify-between items-start relative z-10">
                    <div className="flex gap-4">
                      <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm glass border border-line/50"
                        style={{ backgroundColor: `${goalColor}20`, color: goalColor }}
                      >
                        {g.icon || '🎯'}
                      </div>
                      <div className="space-y-1">
                        <div className="font-black text-xl tracking-tight leading-none">{g.name}</div>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-black uppercase tracking-widest text-muted opacity-60">
                             {g.deadline ? `Дедлайн: ${g.deadline}` : 'Бессрочно'}
                           </span>
                           {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                             <span className="bg-bad/10 text-bad px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase animate-pulse">
                               Срочно
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!g.archived ? (
                         <>
                          <button 
                            className="p-2 text-muted hover:text-primary hover:bg-bg-soft rounded-xl transition-all"
                            onClick={() => openGoalModal(g)}
                          >
                            <Pencil size={18} />
                          </button>
                          <button 
                            className="p-2 text-muted hover:text-primary hover:bg-bg-soft rounded-xl transition-all"
                            onClick={() => handleArchiveGoal(g.id)}
                            title="В Зал Славы"
                          >
                            <Archive size={18} />
                          </button>
                        </>
                      ) : (
                        <button 
                          className="p-2 text-muted hover:text-primary hover:bg-bg-soft rounded-xl transition-all"
                          onClick={() => handleUnarchiveGoal(g.id)}
                          title="Восстановить"
                        >
                          <ArchiveRestore size={18} />
                        </button>
                      )}
                      <button 
                        className="p-2 text-muted hover:text-bad hover:bg-bad/10 rounded-xl transition-all"
                        onClick={() => handleDeleteGoal(g.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-end text-sm font-black uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-mono" style={{ color: goalColor }}>{g.progress}</span>
                        <span className="text-muted opacity-60">/ {g.target} {g.unit}</span>
                      </div>
                      <div className="text-muted">{Math.round(pct)}%</div>
                    </div>
                    
                    <div className="h-4 w-full bg-surface-2 rounded-full overflow-hidden border border-line/30 p-0.5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        className="h-full rounded-full shadow-glow"
                        style={{ backgroundColor: goalColor }}
                        transition={{ type: 'spring', bounce: 0.2, duration: 1 }}
                      />
                    </div>
                  </div>

                  {!g.archived && (
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="flex bg-surface-2 p-1 rounded-2xl border border-line/50">
                        <button 
                          className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-bg rounded-xl transition-all text-xl font-bold"
                          onClick={() => handleStateChange(prev => ({
                            ...prev,
                            goals: prev.goals.map(x => x.id === g.id ? { ...x, progress: Math.max(0, x.progress - (g.step || 1)) } : x)
                          }))}
                        >
                          −
                        </button>
                        <div className="px-4 flex items-center justify-center font-black min-w-[60px] text-xs">
                          шаг: {g.step || 1}
                        </div>
                        <button 
                          className="w-10 h-10 flex items-center justify-center hover:bg-white dark:hover:bg-bg rounded-xl transition-all text-xl font-bold"
                          onClick={() => {
                            const goal = state.goals.find(x => x.id === g.id);
                            if (!goal) return;
                            const nextProgress = Math.min(goal.target, goal.progress + (g.step || 1));
                            handleStateChange(prev => ({
                              ...prev,
                              goals: prev.goals.map(x => x.id === g.id ? { ...x, progress: nextProgress } : x)
                            }));
                            if (nextProgress >= goal.target && goal.progress < goal.target) {
                              showToast('Цель достигнута! 🎉', 'success');
                              confetti({ particleCount: 150, spread: 80, colors: [goalColor, '#ffffff'] });
                            }
                          }}
                        >
                          +
                        </button>
                      </div>
                      
                      <div className="flex-1 flex flex-col items-end gap-1">
                        {perDay && parseFloat(perDay) > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-primary">
                            <TrendingUp size={12} /> {perDay} {g.unit} в день
                          </div>
                        )}
                        <div className="text-[9px] text-muted font-bold opacity-60 uppercase">
                          {pct === 100 ? 'Цель завершена!' : `Осталось ${remaining} ${g.unit}`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Icon Watermark */}
                  <div className="absolute -right-4 -bottom-4 text-9xl opacity-[0.04] rotate-12 group-hover:rotate-0 group-hover:scale-110 transition-all duration-700 pointer-events-none">
                    {g.icon || '🎯'}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {visibleGoals.length === 0 && (
            <div className="col-span-full py-20">
               <EmptyState 
                icon={showArchivedGoals ? "🏆" : "🎯"} 
                title={showArchivedGoals ? "Зал Славы пуст" : "Целей пока нет"} 
                text={showArchivedGoals ? "Твои великие победы будут храниться здесь!" : "Поставь свою первую большую цель и иди к ней маленькими шагами 🌱"} 
              />
              {!showArchivedGoals && (
                <div className="flex justify-center mt-8">
                  <button className="btn px-10" onClick={() => openGoalModal()}>
                    Поставить цель
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const today = new Date();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const startOffset = (new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() + 6) % 7;

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i - startOffset + 1);
      days.push(d);
    }

    // Monthly Mood Stats Logic
    const currentMonthEntries = Object.entries(state.journalEntries).filter(([date, entry]) => {
      const d = new Date(date);
      return d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear() && (entry as JournalEntry).mood;
    });
    
    const moodSum = currentMonthEntries.reduce((acc, [_, entry]) => acc + ((entry as JournalEntry).mood || 0), 0);
    const avgMood = currentMonthEntries.length > 0 ? (moodSum / currentMonthEntries.length).toFixed(1) : null;
    const avgEmoji = avgMood ? MOOD_SCALE.find(m => m.v === Math.round(Number(avgMood)))?.e : '—';

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h3 className="text-3xl font-black font-display tracking-tight">Календарь 🗓️</h3>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest opacity-60">Твоя личная карта времени</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
             {avgMood && (
               <div className="bg-surface-2 px-4 py-2 rounded-2xl border border-line/40 flex items-center gap-3 shadow-inner">
                 <div className="text-2xl">{avgEmoji}</div>
                 <div className="text-left">
                   <div className="text-[9px] font-black uppercase tracking-wider text-muted">Среднее настроение</div>
                   <div className="text-sm font-black text-primary">{avgMood} / 5.0</div>
                 </div>
               </div>
             )}
             <div className="flex items-center gap-2 bg-surface-2 p-1.5 rounded-2xl border border-line/40 shadow-sm relative z-50">
                <button 
                  type="button"
                  className="chip-btn py-2 px-3 relative z-50 cursor-pointer active:scale-95 transition-transform" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
                    playSound('click');
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="px-4 font-black text-xs uppercase tracking-widest min-w-[140px] text-center select-none">
                  {viewDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
                </div>
                <button 
                  type="button"
                  className="chip-btn py-2 px-3 relative z-50 cursor-pointer active:scale-95 transition-transform" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
                    playSound('click');
                  }}
                >
                  <ChevronRight size={18} />
                </button>
             </div>
             <button 
               type="button"
               className="chip-btn py-3.5 px-6 font-black uppercase text-[10px] tracking-widest border-primary/20 text-primary hover:bg-primary-soft/10 relative z-50 cursor-pointer active:scale-95 transition-transform"
               onClick={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 setViewDate(new Date());
                 playSound('pop');
               }}
             >
               Сегодня
             </button>
          </div>
        </div>

        <div className="card p-6 border-line/40 shadow-xl overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-3 mb-4">
              {['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'].map(d => (
                <div key={d} className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-3 touch-manipulation">
              {days.map((d, i) => {
                const iso = isoDate(d);
                const isToday = iso === todayISO();
                const isOtherMonth = d.getMonth() !== viewDate.getMonth();
                const entry = state.journalEntries[iso] as JournalEntry;
                const dailyHabits = state.habits.filter(h => h.dates.includes(iso));
                const moodEmoji = entry?.mood ? MOOD_SCALE.find(m => m.v === entry.mood)?.e : null;
                
                // Goal Deadlines on this day
                const deadlines = state.goals.filter(g => g.deadline === iso);

                return (
                  <button 
                    key={i}
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedDate(iso); 
                      setIsDayModalOpen(true); 
                      playSound('click'); 
                    }}
                    className={cn(
                      "aspect-video md:aspect-square rounded-[24px] border p-2 flex flex-col justify-between items-start transition-all relative group overflow-hidden cursor-pointer touch-none",
                      isOtherMonth ? "opacity-20 bg-surface-2/50 border-line/10" : "bg-surface border-line/50 hover:border-primary/50 hover:shadow-lg hover:bg-surface-2",
                      isToday && "border-primary ring-4 ring-primary/10 bg-primary-soft/5"
                    )}
                    style={{ zIndex: isToday ? 30 : 20 }}
                  >
                    <div className="flex justify-between items-start w-full relative z-10 pointer-events-none">
                      <span className={cn(
                        "text-xs font-black p-1 leading-none rounded-lg",
                        isToday ? "bg-primary text-white" : "text-muted opacity-60"
                      )}>
                        {d.getDate()}
                      </span>
                      
                      <div className="flex flex-col gap-1 items-end">
                        {moodEmoji && (
                          <div className="text-lg leading-none animate-in fade-in zoom-in duration-300">
                            {moodEmoji}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-full flex flex-wrap gap-1 relative z-10 pointer-events-none">
                      {deadlines.length > 0 && (
                        <div className="flex -space-x-2">
                           {deadlines.map(g => (
                             <div 
                               key={g.id} 
                               className="w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-sm border border-white dark:border-bg animate-bounce"
                               style={{ backgroundColor: g.color || '#ff5dac' }}
                               title={`Дедлайн: ${g.name}`}
                             >
                               {g.icon || '🎯'}
                             </div>
                           ))}
                        </div>
                      )}
                      
                      {dailyHabits.length > 0 && (
                        <div className="flex flex-1 justify-end items-end gap-0.5">
                           {dailyHabits.slice(0, 3).map(h => (
                             <div key={h.id} className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                           ))}
                           {dailyHabits.length > 3 && <span className="text-[8px] font-black text-primary opacity-60">+{dailyHabits.length - 3}</span>}
                        </div>
                      )}
                    </div>

                    {/* Subtle mood tint */}
                    {entry?.mood && (
                       <div 
                         className="absolute inset-0 opacity-[0.03] transition-opacity group-hover:opacity-[0.07] pointer-events-none"
                         style={{ backgroundColor: 
                           entry.mood >= 4 ? '#10b981' : 
                           entry.mood >= 3 ? '#ff5dac' : 
                           '#6366f1' 
                         }}
                       />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCatGallery = () => (
    <div className="space-y-10">
      <div className="section-header px-2">
        <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display text-text leading-none">Моя галерея 🐈</h3>
        <p className="text-xs text-muted font-black uppercase tracking-[0.2em] mt-2 opacity-60">История твоих достижений в котиках</p>
      </div>

      <div className="flex justify-between items-center bg-surface-2 p-6 rounded-[40px] border border-line/40 glass">
        <div>
          <h3 className="text-2xl font-black text-primary flex items-center gap-3 font-display">Кошачья Галерея</h3>
          <p className="text-muted text-sm mt-1">Твои пушистые награды за продуктивность</p>
        </div>
        <div className="bg-primary/10 text-primary border border-primary/20 px-8 py-4 rounded-3xl font-black text-2xl shadow-sm">
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
            <p className="text-muted max-w-sm mx-auto">Каждая выполненная привычка или задача — это шанс встретить нового котика. Продолжай в том же духе{state.settings.userName ? ', ' + state.settings.userName : ''}! ✨</p>
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
                <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="Сохранённый котик" />
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
    // Word Cloud Logic
    const tagFreq: Record<string, number> = {};
    Object.values(state.journalEntries).forEach(entry => {
      (entry as JournalEntry).tags?.forEach(tag => {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      });
    });
    const sortedTags = Object.entries(tagFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);

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
          
          <div className="card">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Tag size={18} className="text-primary" /> Облако смыслов
            </h3>
            <div className="flex flex-wrap gap-2 justify-center items-center py-4">
              {sortedTags.length > 0 ? sortedTags.map(([tag, count], i) => (
                <motion.span 
                  key={tag}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "px-3 py-1.5 rounded-full font-bold transition-all hover:scale-110 cursor-default",
                    tag.toLowerCase() === 'благодарность' || tag.toLowerCase() === 'спасибо' ? "bg-warn text-white border-none" :
                    tag.toLowerCase() === 'тревога' || tag.toLowerCase() === 'страх' ? "bg-bad text-white border-none" :
                    count > 5 ? "bg-primary text-white text-lg" : 
                    count > 2 ? "bg-primary/20 text-primary text-sm" : 
                    "bg-surface-2 text-muted text-xs shadow-inner"
                  )}
                  style={{ opacity: 0.3 + (count / sortedTags[0][1]) * 0.7 }}
                >
                  {tag}
                </motion.span>
              )) : (
                <p className="text-xs text-muted italic">Добавляй больше тегов в дневник, чтобы увидеть облако...</p>
              )}
            </div>
          </div>

          <div className="card pattern-dots">
            <h3 className="text-lg font-bold mb-4">Бережная поддержка ✨</h3>
            <div className="space-y-3">
              <div className="insight">
                {overallStreak > 3 ? `Ты держишь ритм уже ${overallStreak} ${pluralize(overallStreak, ['день', 'дня', 'дней'])}! Это потрясающе.` : "Каждый новый день — это шанс начать заново. Я верю в тебя!"}
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
          <div className="card glass pattern-stars flex flex-col items-center text-center p-10 bg-gradient-to-br from-primary/5 to-transparent border-primary/10 shadow-xl shadow-primary/5">
            <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 opacity-60">Серия 🔥</div>
            <div className="text-6xl font-black text-primary tracking-tighter mb-2 font-display">
              {overallStreak}
            </div>
            <div className="text-primary/60 text-[10px] font-black uppercase tracking-widest">
              {pluralize(overallStreak, ['день', 'дня', 'дней'])} с ритмом
            </div>
          </div>
        <div className="card glass pattern-dots flex flex-col items-center text-center p-10 bg-gradient-to-br from-primary-2/5 to-transparent border-primary-2/10 shadow-xl shadow-primary-2/5">
          <div className="text-[10px] font-black uppercase tracking-widest text-primary-2 mb-4 opacity-60">Привычки сегодня 🌱</div>
          <div className="text-6xl font-black text-primary-2 tracking-tighter mb-2 font-display">
            {state.habits.filter(h => h.dates.includes(todayISO())).length}/{state.habits.length}
          </div>
          <div className="text-primary-2/60 text-[10px] font-black uppercase tracking-widest">маленьких побед</div>
        </div>
        <div className="card glass pattern-waves flex flex-col items-center text-center p-10 bg-gradient-to-br from-accent/5 to-transparent border-accent/10 shadow-xl shadow-accent/5">
          <div className="text-[10px] font-black uppercase tracking-widest text-accent mb-4 opacity-60">Фокус дня 🎯</div>
          <div className="text-6xl font-black text-accent tracking-tighter mb-2 font-display">
            {state.tasks.filter(t => t.focus && !t.done).length}
          </div>
          <div className="text-accent/60 text-[10px] font-black uppercase tracking-widest">главные задачи</div>
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
              За 7 последних дней ты успешно закрепила <span className="text-primary font-black uppercase tracking-widest underline decoration-2 underline-offset-4">
                {state.habits.reduce((acc, h) => acc + h.dates.filter(d => {
                  const date = new Date(d);
                  const now = new Date();
                  return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
                }).length, 0)}
              </span> {pluralize(state.habits.reduce((acc, h) => acc + h.dates.filter(d => {
                const date = new Date(d);
                const now = new Date();
                return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
              }).length, 0), ['привычку', 'привычки', 'привычек'])}. Твое среднее настроение составляет 4.2 из 5.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h3 className="text-lg font-black uppercase tracking-wider mb-6 flex items-center gap-2">
              <CalendarIcon size={20} className="text-accent" /> Теплокарта жизни
            </h3>
            <div id="overviewHeat" className="overflow-x-auto custom-scrollbar">
              {renderHeatmap()}
            </div>
          </div>

          <div className="card">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black uppercase tracking-wider flex items-center gap-2">
                <ListTodo size={20} className="text-primary" /> Ближайшие задачи
              </h3>
              <button 
                onClick={() => setActiveSection('tasks')}
                className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
              >
                Все задачи →
              </button>
            </div>
            
            <div className="space-y-3">
              {state.tasks.filter(t => !t.done).slice(0, 3).length > 0 ? (
                state.tasks.filter(t => !t.done).slice(0, 3).map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg-soft border border-line/50 group transition-all">
                    <button 
                      onClick={() => handleTaskToggle(task.id)}
                      className="w-5 h-5 rounded-md border-2 border-line hover:border-primary transition-all"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{task.text}</span>
                        <button 
                          onClick={() => handleSmartSplit(task)}
                          className="p-1 text-primary hover:bg-primary/5 rounded-full"
                          title="Разбить задачу (ИИ)"
                        >
                          <Brain size={14} />
                        </button>
                      </div>
                    </div>
                    {task.priority === 'urgent' && <div className="w-2 h-2 rounded-full bg-bad animate-pulse" />}
                  </div>
                ))
              ) : (
                <EmptyState 
                  icon="✨" 
                  title="Все задачи выполнены!" 
                  text="Прекрасная работа. Ты заслужила отдых или чашечку чая." 
                />
              )}
            </div>
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
              <EmptyState 
                icon="🏔️" 
                title="Горизонты чисты" 
                text="Поставь свою первую большую цель, чтобы видеть путь вперед." 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderHabits = () => {
    const activeHabits = state.habits.filter(h => !h.archived);
    const archivedHabits = state.habits.filter(h => h.archived);
    const visibleHabits = showArchivedHabits ? archivedHabits : activeHabits;

    return (
      <div className="space-y-10">
        <div className="section-header flex flex-col sm:flex-row justify-between items-start sm:items-end px-2 gap-4">
          <div className="space-y-2">
            <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display leading-none">
              {showArchivedHabits ? 'Архив привычек 📂' : 'Привычки 🌱'}
            </h3>
            <p className="text-xs text-muted font-black uppercase tracking-[0.2em] opacity-60">
              {showArchivedHabits ? 'Твои прошлые победы' : 'Ритм создает дисциплину'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              className={cn(
                "chip-btn py-4 px-6 text-xs font-bold transition-all flex items-center gap-2",
                showArchivedHabits ? "bg-primary text-white" : "text-muted hover:text-primary"
              )}
              onClick={() => setShowArchivedHabits(!showArchivedHabits)}
            >
              {showArchivedHabits ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              {showArchivedHabits ? 'К активным' : 'Архив'}
              {archivedHabits.length > 0 && !showArchivedHabits && (
                <span className="bg-primary-soft text-primary px-1.5 py-0.5 rounded-full text-[9px] -mr-2">
                  {archivedHabits.length}
                </span>
              )}
            </button>
            {!showArchivedHabits && (
              <button className="chip-btn py-4 px-8 shadow-sm hover:shadow-lg transition-all flex items-center gap-3 border-primary/20 text-primary font-bold text-xs" onClick={() => setIsHabitModalOpen(true)}>
                <Plus size={18} /> Добавить
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {visibleHabits.map(habit => (
              <motion.div 
                key={habit.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="habit-row flex items-center justify-between p-6 rounded-[32px] bg-surface border border-line hover:border-primary/40 transition-all hover:shadow-lg group relative overflow-hidden"
              >
                {/* Visual Flair */}
                <div className="absolute -right-2 -bottom-2 text-6xl opacity-[0.03] group-hover:scale-125 transition-transform duration-700 pointer-events-none">{habit.icon}</div>
                
                <div className="flex items-center gap-4 relative z-10">
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-all shadow-sm",
                    habit.archived ? "bg-surface-2 opacity-50 grayscale" : "bg-bg-soft group-hover:bg-primary-soft"
                  )}>
                    {habit.icon}
                  </div>
                  <div className="space-y-1">
                    <div className={cn("font-black text-sm tracking-tight", habit.archived && "text-muted")}>{habit.name}</div>
                    <div className="text-[10px] text-muted font-black uppercase tracking-[0.1em] opacity-60 flex items-center gap-1">
                      <Flame size={12} className={cn(habit.archived ? "text-muted" : "text-orange-500")} /> Серия: {streakForHabit(habit)} {pluralize(streakForHabit(habit), ['день', 'дня', 'дней'])}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 relative z-10">
                  {!habit.archived ? (
                    <>
                      <button 
                        onClick={() => handleArchiveHabit(habit.id)}
                        className="p-2 text-muted hover:text-primary transition-colors hover:bg-primary-soft rounded-xl"
                        title="В архив"
                      >
                        <Archive size={18} />
                      </button>
                      <button 
                        onClick={() => handleHabitComplete(habit.id)}
                        className={cn(
                          "dot w-10 h-10 border-2",
                          habit.dates.includes(todayISO()) && "done"
                        )}
                      />
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => handleUnarchiveHabit(habit.id)}
                        className="chip-btn px-4 py-2 text-[10px] font-black uppercase"
                      >
                        Восстановить
                      </button>
                      <button 
                        onClick={() => handleDeleteHabit(habit.id)}
                        className="p-2 text-bad hover:bg-bad/10 rounded-xl"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {visibleHabits.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <EmptyState 
                icon={showArchivedHabits ? "📂" : "🌱"} 
                title={showArchivedHabits ? "Архив пуст" : "Здесь пока пусто"} 
                text={showArchivedHabits ? "Ты пока ничего не сохраняла в архив" : "Добавь свою первую привычку, чтобы котик не скучал! Ритм — это жизнь ✨"} 
              />
              {!showArchivedHabits && (
                <div className="flex justify-center mt-6">
                  <button className="btn px-10" onClick={() => setIsHabitModalOpen(true)}>Создать привычку</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTasks = () => {
    const filteredTasks = state.tasks.filter(t => {
      const matchDate = taskFilter.showAllDates || t.date === taskViewDate;
      const matchPriority = taskFilter.priority === 'all' || t.priority === taskFilter.priority;
      const matchStatus = taskFilter.status === 'all' || (taskFilter.status === 'done' ? t.done : !t.done);
      const matchSearch = taskFilter.search === '' || t.text.toLowerCase().includes(taskFilter.search.toLowerCase());
      const matchTags = taskFilter.selectedTags.length === 0 || taskFilter.selectedTags.every(tag => t.tags?.includes(tag));
      return matchDate && matchPriority && matchStatus && matchSearch && matchTags;
    }).sort((a, b) => {
      if (taskFilter.sortBy === 'date') {
        return a.date.localeCompare(b.date);
      }
      if (taskFilter.sortBy === 'status') {
        if (a.done === b.done) return 0;
        return a.done ? 1 : -1;
      }
      // Default: priority
      const pMap = { urgent: 0, important: 1, someday: 2, none: 3 };
      const aP = pMap[a.priority] ?? 3;
      const bP = pMap[b.priority] ?? 3;
      if (aP !== bP) return aP - bP;
      
      // Secondary sort for priority is rollover
      if (a.isRolledOver && !b.isRolledOver) return -1;
      if (b.isRolledOver && !a.isRolledOver) return 1;
      return 0;
    });

    const allTags = Array.from(new Set(state.tasks.flatMap(t => t.tags || []))).sort();

    const priorityOptions: { value: string, label: string, color: string }[] = [
      { value: 'all', label: 'Все', color: 'bg-surface-2' },
      { value: 'urgent', label: '🔥 Срочно', color: 'bg-bad/10 text-bad' },
      { value: 'important', label: '⭐ Важно', color: 'bg-warn/10 text-warn' },
      { value: 'someday', label: '💤 Потом', color: 'bg-primary/10 text-primary' }
    ];

    const statusOptions = [
      { value: 'all', label: 'Все' },
      { value: 'todo', label: 'К выполнению' },
      { value: 'done', label: 'Выполнено' }
    ];

    const isToday = taskViewDate === todayISO();

    return (
      <div className="space-y-10">
        <div className="section-header flex justify-between items-end px-2">
          <div className="space-y-2">
            <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display leading-none">Задачи 📝</h3>
            <p className="text-xs text-muted font-black uppercase tracking-[0.2em] opacity-60">Маленькие шаги к большим целям</p>
          </div>
          <p className="text-[10px] text-muted font-bold opacity-40 uppercase tracking-widest">{taskViewDate}</p>
        </div>

        {/* Date Selector Header */}
        <div className="flex items-center justify-between bg-surface p-2 rounded-2xl border border-line">
          <button 
            onClick={() => {
              setTaskViewDate(addDaysISO(taskViewDate, -1));
              setTaskFilter(prev => ({ ...prev, showAllDates: false }));
            }}
            className="p-2 hover:bg-surface-2 rounded-xl transition-colors disabled:opacity-30"
            disabled={taskFilter.showAllDates}
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex flex-col items-center">
            {taskFilter.showAllDates ? (
              <span className="text-sm font-bold">Все даты</span>
            ) : (
              <div className="relative flex items-center justify-center cursor-pointer group">
                <span className="text-sm font-bold group-hover:text-primary transition-colors flex items-center gap-1.5">
                  <CalendarIcon size={14} className="text-muted group-hover:text-primary transition-colors" />
                  {isToday ? 'Сегодня' : taskViewDate}
                </span>
                <input 
                  type="date"
                  title="Выбрать дату"
                  value={taskViewDate}
                  onChange={(e) => {
                    if(e.target.value) setTaskViewDate(e.target.value);
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            )}
            
            <button 
              onClick={() => setTaskFilter(prev => ({ ...prev, showAllDates: !prev.showAllDates }))}
              className={cn(
                "text-[9px] font-bold uppercase tracking-widest mt-1",
                taskFilter.showAllDates ? "text-primary" : "text-muted hover:text-text transition-colors"
              )}
            >
              {taskFilter.showAllDates ? "Выбрать конкретную" : "Показать все даты"}
            </button>
          </div>

          <button 
            onClick={() => {
              setTaskViewDate(addDaysISO(taskViewDate, 1));
              setTaskFilter(prev => ({ ...prev, showAllDates: false }));
            }}
            className="p-2 hover:bg-surface-2 rounded-xl transition-colors disabled:opacity-30"
            disabled={taskFilter.showAllDates}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="card">
          <h3 className="text-lg font-bold mb-4">Добавить задачу ✍️</h3>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input 
                type="text" 
                className="flex-1 bg-surface-2 border border-line p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Что нужно сделать?"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (handleAddTask(newTaskText, newTaskPriority, newTaskDate, newTaskRecurring, newTaskRecurringDays, newTaskIcon, newTaskTags.split(',')), setNewTaskText(''), setNewTaskTags(''), setNewTaskRecurringDays([]))}
              />
              <button 
                className="btn py-2 px-8"
                onClick={() => { handleAddTask(newTaskText, newTaskPriority, newTaskDate, newTaskRecurring, newTaskRecurringDays, newTaskIcon, newTaskTags.split(',')); setNewTaskText(''); setNewTaskTags(''); setNewTaskRecurringDays([]); }}
              >
                <Plus size={18} className="mr-2" /> Добавить
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-muted uppercase">Теги (через запятую)</label>
              <input 
                type="text"
                className="bg-surface-2 border border-line p-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="например: работа, дом, важно"
                value={newTaskTags}
                onChange={(e) => setNewTaskTags(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Иконка</label>
                <select 
                  className="chip-btn text-xs px-3 py-1.5"
                  value={newTaskIcon}
                  onChange={(e) => setNewTaskIcon(e.target.value)}
                >
                  <option value="📝">📝 Заметка</option>
                  <option value="💻">💻 Технологии</option>
                  <option value="🏠">🏠 Дом</option>
                  <option value="🛒">🛒 Покупки</option>
                  <option value="🔥">🔥 Срочно</option>
                  <option value="🏃">🏃 Здоровье</option>
                  <option value="🎨">🎨 Творчество</option>
                  <option value="💡">💡 Идея</option>
                  <option value="📚">📚 Учёба</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Приоритет</label>
                <select 
                  className="chip-btn text-xs px-3 py-1.5"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                >
                  <option value="someday">💤 Потом</option>
                  <option value="important">⭐ Важно</option>
                  <option value="urgent">🔥 Срочно</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Дата</label>
                <input 
                  type="date"
                  className="chip-btn text-xs px-3 py-1.5"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Повтор</label>
                <select 
                  className="chip-btn text-xs px-3 py-1.5"
                  value={newTaskRecurring}
                  onChange={(e) => setNewTaskRecurring(e.target.value as any)}
                >
                  <option value="none">Нет</option>
                  <option value="daily">🔄 Каждый день</option>
                  <option value="weekdays">💼 Будни</option>
                  <option value="weekly">📅 Еженедельно</option>
                </select>
              </div>
            </div>

            {newTaskRecurring === 'weekly' && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex flex-col gap-2 pt-2 border-t border-line/30"
              >
                <label className="text-[10px] font-bold text-muted uppercase">Дни недели</label>
                <div className="flex flex-wrap gap-2">
                  {['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'].map((day, i) => (
                    <button
                      key={day}
                      onClick={() => {
                        setNewTaskRecurringDays(prev => 
                          prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                        );
                      }}
                      className={cn(
                        "w-9 h-9 rounded-xl text-[10px] font-black uppercase transition-all duration-200",
                        newTaskRecurringDays.includes(i) 
                          ? "bg-primary text-white shadow-lg shadow-primary/20 scale-110" 
                          : "bg-surface-2 text-muted border border-line hover:border-primary/30"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted italic">Выберите дни, в которые задача должна повторяться автоматически.</p>
              </motion.div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-bold">Управление задачами ({filteredTasks.length}) 📋</h3>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-48">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input 
                    type="text"
                    placeholder="Поиск..."
                    className="w-full bg-surface-2 border border-line pl-9 pr-4 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20"
                    value={taskFilter.search}
                    onChange={(e) => setTaskFilter(prev => ({ ...prev, search: e.target.value }))}
                  />
                </div>
                <select 
                  className="bg-surface-2 border border-line px-3 py-2 rounded-xl text-xs outline-none"
                  value={taskFilter.sortBy}
                  onChange={(e) => setTaskFilter(prev => ({ ...prev, sortBy: e.target.value as any }))}
                >
                  <option value="priority">Сортировка: Приоритет</option>
                  <option value="date">Сортировка: Дата</option>
                  <option value="status">Сортировка: Статус</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {allTags.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2 block">Теги</label>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map(tag => (
                      <button 
                        key={tag}
                        onClick={() => setTaskFilter(prev => ({
                          ...prev,
                          selectedTags: prev.selectedTags.includes(tag)
                            ? prev.selectedTags.filter(t => t !== tag)
                            : [...prev.selectedTags, tag]
                        }))}
                        className={cn(
                          "chip-btn text-[10px] transition-all",
                          taskFilter.selectedTags.includes(tag) ? "bg-accent text-white border-transparent" : "hover:bg-bg-soft"
                        )}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-6">
                <div className="flex-1 min-w-[150px]">
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

                <div className="flex-1 min-w-[150px]">
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
                  </div>
                </div>
              </div>

              {(taskFilter.priority !== 'all' || taskFilter.status !== 'all' || taskFilter.search !== '' || taskFilter.showAllDates || taskFilter.selectedTags.length > 0) && (
                <div className="flex justify-start">
                  <button 
                    onClick={() => setTaskFilter({ 
                      priority: 'all', 
                      status: 'all', 
                      search: '', 
                      showAllDates: false, 
                      sortBy: 'priority', 
                      selectedTags: [] 
                    })}
                    className="text-[10px] font-bold text-bad hover:underline"
                  >
                    Сбросить все фильтры
                  </button>
                </div>
              )}
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
                    className={cn(
                      "task-row flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm hover:shadow-md group",
                      task.priority === 'urgent' ? "bg-bad/5 border-bad/20" : 
                      task.priority === 'important' ? "bg-warn/5 border-warn/20" : 
                      "bg-surface-2 border-line"
                    )}
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
                    <div className="flex-shrink-0 text-xl mx-1">
                      {task.icon || '📝'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 group/text">
                        <span className={cn(
                          "block font-medium truncate transition-all", 
                          task.done ? "line-through text-muted opacity-60" : "text-text"
                        )}>
                          {task.text}
                        </span>
                        {!task.done && (
                          <button 
                            onClick={() => handleSmartSplit(task)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary/10 rounded-full transition-all text-primary flex items-center gap-1"
                            title="Бережно разбить на шаги (ИИ)"
                          >
                            <Brain size={16} />
                            <span className="text-[10px] font-black uppercase tracking-tighter hidden md:inline">Разбить</span>
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1 items-center">
                        {task.priority === 'urgent' && <span className="text-[9px] font-bold text-bad uppercase tracking-tighter">🔥 Срочно</span>}
                        {task.priority === 'important' && <span className="text-[9px] font-bold text-warn uppercase tracking-tighter">⭐ Важно</span>}
                        {task.priority === 'someday' && <span className="text-[9px] font-bold text-primary uppercase tracking-tighter">💤 Потом</span>}
                        
                        {task.isRolledOver && !task.done && (
                          <span className="text-[9px] bg-primary/10 text-primary px-1.5 rounded-sm font-bold uppercase tracking-tighter">
                            🔄 Перенесено
                          </span>
                        )}

                        {task.tags && task.tags.map(tag => (
                          <span key={tag} className="text-[8px] bg-surface-2 text-muted px-1.5 py-0.5 rounded-full border border-line">#{tag}</span>
                        ))}

                        {(task.rolloverCount || 0) >= 3 && !task.done && (
                          <span className="text-[9px] text-accent font-black italic block w-full mt-1">
                            {state.settings.userName ? `«${state.settings.userName}, кажется, эта задача забирает много энергии. Может, стоит её разбить или отложить?»` : '«Кажется, эта задача забирает много энергии. Может, стоит её разбить или отложить?»'}
                          </span>
                        )}

                        <span className="text-[9px] text-muted font-medium ml-auto flex items-center gap-1">
                          <CalendarIcon size={10} />
                          {task.date} 
                          {task.recurring !== 'none' && (
                            <span className="ml-1 text-primary-2 font-bold px-1.5 py-0.5 bg-primary/5 rounded-md flex items-center gap-1">
                              <RefreshCw size={8} />
                              {task.recurring === 'daily' ? 'Ежедневно' : 
                               task.recurring === 'weekdays' ? 'Будни' : 
                               `Еженедельно (${task.recurringDays?.map(d => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d]).join(', ')})`}
                            </span>
                          )}
                        </span>
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
                <EmptyState 
                  icon="🔍" 
                  title="Задачи не найдены" 
                  text="Попробуй изменить фильтры или добавь новую задачу на эту дату ✨" 
                />
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
          <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display text-text leading-none">Мой дневник 📖</h3>
          <p className="text-xs text-muted font-black uppercase tracking-[0.2em] mt-2 opacity-60">Твое безопасное пространство для мыслей</p>
        </div>

        <div className="card glass border-primary/20 shadow-xl shadow-primary/5 rounded-[40px] p-8 lg:p-10">
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
            <div className="flex gap-2">
              <button 
                className={cn("chip-btn flex items-center gap-2", isAIThinking && "opacity-50 pointer-events-none")}
                onClick={extractTasksFromJournal}
              >
                <ListTodo size={14} className="text-primary" /> Задачи
              </button>
              <button 
                className={cn("btn", isAIThinking && "opacity-50 pointer-events-none")}
                onClick={() => askGemini(`Проанализируй мой день: ${JSON.stringify(state.journalEntries[todayISO()])}. Дай короткий совет.`)}
              >
                {isAIThinking ? <RefreshCw size={18} className="animate-spin" /> : '✨ Диско-ИИ'}
              </button>
            </div>
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
                  <div key={date} className="card space-y-3 flex flex-col hover:border-primary/20 transition-all cursor-pointer" onClick={() => { setSelectedDate(date); setIsDayModalOpen(true); }}>
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-sm">{date}</div>
                      {entry.mood && <div className="text-xl">{MOOD_SCALE.find(m => m.v === entry.mood)?.e}</div>}
                    </div>
                    {entry.note ? (
                      <div className="text-sm text-muted whitespace-pre-wrap line-clamp-4 flex-1">«{entry.note}»</div>
                    ) : (
                      <div className="text-xs text-muted/40 italic flex-1">Только настроение...</div>
                    )}
                    <button 
                      className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline mt-2 text-left"
                    >
                      Читать полностью →
                    </button>
                  </div>
                );
              })}
          </div>
          {Object.entries(state.journalEntries).filter(([date, e]) => date !== todayISO() && ((e as JournalEntry).note || (e as JournalEntry).mood)).length === 0 && (
            <EmptyState 
              icon="📖" 
              title="Архив пуст" 
              text="Твоя история только начинается. Сделай первую запись сегодня!" 
            />
          )}
        </div>
      </div>
    );
  };

  const heatmapData = useMemo(() => {
    const data: Record<string, { val: number, habitsCount: number, entry: JournalEntry | null, completedHabitNames: string[] }> = {};
    const year = heatmapYear;
    for (let i = 0; i < 366; i++) {
      const d = new Date(year, 0, 1 + i);
      if (d.getFullYear() !== year) continue;
      const iso = isoDate(d);
      const dayHabits = state.habits.filter(h => h.dates.includes(iso));
      const habitsCount = dayHabits.length;
      const entry = state.journalEntries[iso] as JournalEntry;
      let score = 0;
      if (habitsCount > 0) score += 1;
      // Activity density: 50% of habits for the day or max 3
      const threshold = Math.min(3, Math.ceil(state.habits.length / 2));
      if (habitsCount >= threshold && habitsCount > 0) score += 1;
      if (habitsCount === state.habits.length && state.habits.length > 0) score += 1;
      if (entry?.mood) score += 1;
      if (entry?.note && entry.note.length > 5) score += 1;
      data[iso] = { val: Math.min(4, score), habitsCount, entry, completedHabitNames: dayHabits.map(h => h.name) };
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

    // Stats Calculation
    const activeDaysCount = Object.values(heatmapData).filter(d => d.val > 0).length;
    const totalDays = days.length;
    const activePercent = ((activeDaysCount / totalDays) * 100).toFixed(1);

    const habitsByMonth = new Array(12).fill(0);
    Object.entries(heatmapData).forEach(([date, info]) => {
      const month = getDayFromISO(date).getMonth();
      habitsByMonth[month] += info.habitsCount;
    });
    const maxHabitsMonthIdx = habitsByMonth.indexOf(Math.max(...habitsByMonth));
    const productiveMonth = new Date(year, maxHabitsMonthIdx).toLocaleString('ru-RU', { month: 'long' });
    const totalHabits = habitsByMonth.reduce((a, b) => a + b, 0);

    // Fixed width calculations: cell (14px) + horizontal gap (2px) = 16px
    const CELL_SIZE = 14;
    const GAP_H = 2;
    const WEEK_WIDTH = CELL_SIZE + GAP_H;
    const LABEL_WIDTH_OFFSET = 26; // Account for "Пн", "Ср", "Пт" etc prefix

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
              <div className="absolute top-0 left-0 right-0 flex text-[10px] text-muted font-bold uppercase tracking-wider h-5">
                {monthLabels.map((m, i) => (
                  <div 
                    key={i} 
                    className="absolute" 
                    style={{ left: `${LABEL_WIDTH_OFFSET + m.col * WEEK_WIDTH}px` }}
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
                      
                      const dayInfo = heatmapData[date];
                      const val = dayInfo?.val || 0;
                      const isToday = date === todayISO();
                      const habitsCount = dayInfo?.habitsCount || 0;
                      const moodEmoji = dayInfo?.entry?.mood ? MOOD_SCALE.find(m => m.v === dayInfo.entry!.mood)?.e : '';
                      const habitNames = dayInfo?.completedHabitNames?.join(', ') || '';
                      const tooltipText = `${date}\n${habitsCount} привычек: ${habitNames}\nНастроение: ${moodEmoji || '—'}\n${dayInfo?.entry?.note ? `Заметка: ${dayInfo.entry.note.slice(0, 40)}...` : ''}`;

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
                          title={tooltipText}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <RadialHeatmap 
            year={year} 
            data={heatmapData} 
            theme={state.settings.theme}
            onDateClick={(date) => {
              setSelectedDate(date);
              setIsDayModalOpen(true);
            }}
          />
        )}
        
        {/* Common Legend and Stats Footer */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 border-t border-line/10 pt-8 mt-6">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted whitespace-nowrap">Меньше</span>
            <div className="flex gap-1.5 sm:gap-2">
              <div className="heatcell w-4 h-4 rounded-[3px] bg-surface-2 border border-line/10" title="Нет активности" />
              <div className="heatcell w-4 h-4 rounded-[3px] lv1" title="1 балл (Напр. 1 привычка)" />
              <div className="heatcell w-4 h-4 rounded-[3px] lv2" title="2 балла (Привычки + Цели)" />
              <div className="heatcell w-4 h-4 rounded-[3px] lv3" title="3 балла (Высокая активность)" />
              <div className="heatcell w-4 h-4 rounded-[3px] lv4" title="4 балла (Идеальный день)" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted whitespace-nowrap">Больше</span>
          </div>

          <div className="flex flex-wrap gap-8 lg:gap-12 w-full lg:w-auto overflow-x-auto no-scrollbar">
            <div className="stats-item flex flex-col min-w-[120px]">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1 opacity-60">Продуктивный месяц</span>
              <span className="text-sm font-black text-primary uppercase font-display leading-tight">{productiveMonth}</span>
            </div>
            <div className="stats-item flex flex-col min-w-[100px]">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1 opacity-60">Всего привычек</span>
              <span className="text-sm font-black text-primary-2 font-display leading-tight">{totalHabits}</span>
            </div>
            <div className="stats-item flex flex-col min-w-[100px]">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted mb-1 opacity-60">Активных дней</span>
              <span className="text-sm font-black text-accent font-display leading-tight">{activePercent}%</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-line">
          <div className="group relative">
            <div className="flex items-center gap-1 text-[10px] font-bold text-primary cursor-help uppercase tracking-wider">
              <Info size={12} /> Как считаются баллы?
            </div>
            <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-surface border border-line rounded-xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 translate-y-2 group-hover:translate-y-0">
              <ul className="text-[10px] space-y-1.5 text-muted font-medium">
                <li className="flex justify-between"><span>Мин. 1 привычка</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>50% целей (до 3)</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>Все привычки</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>Настроение</span> <span className="text-primary">+1</span></li>
                <li className="flex justify-between"><span>Заметка {'>'}5 симв.</span> <span className="text-primary">+1</span></li>
                <li className="pt-1 border-t border-line/5 text-[9px] text-primary/60 italic">Макс. уровень — 4</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-10">
      <div className="section-header flex items-end justify-between px-2">
        <div className="space-y-2">
          <h3 className="text-4xl lg:text-5xl font-black tracking-tighter font-display leading-none">Настройки ⚙️</h3>
          <p className="text-xs text-muted font-black uppercase tracking-[0.2em] opacity-60">Твой ритм — твои правила</p>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-good animate-pulse" />
          <span className="text-[10px] uppercase font-black tracking-widest opacity-40">Система стабильна</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card h-full space-y-8 glass shadow-xl shadow-primary/5">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-8 flex items-center gap-3 font-display">
              <UserIcon size={20} /> Профиль
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
          
          <div className="pt-8 border-t border-line space-y-4">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Статистика 📊</h4>
              <button 
                className="btn w-full py-4 flex items-center justify-center gap-3 bg-primary-soft text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all shadow-sm"
                onClick={() => setIsReportModalOpen(true)}
              >
                <BarChart3 size={20} />
                Посмотреть отчёт недели
              </button>
            </div>
            
            <div>
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
      </div>

      <div className="card h-full space-y-8 glass shadow-xl shadow-primary-2/5">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-8 flex items-center gap-3 font-display">
              <Palette size={20} /> Интерфейс
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

              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="space-y-0.5">
                  <div className="font-black text-xs">Экономный режим</div>
                  <div className="text-[10px] text-muted font-bold opacity-60">Отключает размытие и тени</div>
                </div>
                <button 
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, ecoMode: !prev.settings.ecoMode }
                  }))}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors relative",
                    state.settings.ecoMode ? "bg-good" : "bg-line"
                  )}
                >
                  <motion.div 
                    animate={{ x: state.settings.ecoMode ? 24 : 0 }}
                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="space-y-0.5">
                  <div className="font-black text-xs">Освещение</div>
                  <div className="text-[10px] text-muted font-bold opacity-60">Динамическое пятно света</div>
                </div>
                <button 
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, dynamicLighting: !prev.settings.dynamicLighting }
                  }))}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors relative",
                    state.settings.dynamicLighting ? "bg-primary" : "bg-line"
                  )}
                >
                  <motion.div 
                    animate={{ x: state.settings.dynamicLighting ? 24 : 0 }}
                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="space-y-0.5">
                  <div className="font-black text-xs">Уведомления</div>
                  <div className="text-[10px] text-muted font-bold opacity-60">Пуши о завершении фокуса</div>
                </div>
                <button 
                  onClick={async () => {
                    const status = state.settings.notifEnabled;
                    if (!status && "Notification" in window) {
                      const res = await Notification.requestPermission();
                      if (res !== 'granted') return;
                    }
                    handleStateChange(prev => ({
                      ...prev,
                      settings: { ...prev.settings, notifEnabled: !status }
                    }));
                  }}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors relative",
                    state.settings.notifEnabled ? "bg-primary" : "bg-line"
                  )}
                >
                  <motion.div 
                    animate={{ x: state.settings.notifEnabled ? 24 : 0 }}
                    className="w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-3xl bg-bg-soft border border-line/50">
                <div className="space-y-0.5">
                  <div className="font-black text-xs">Звуки</div>
                  <div className="text-[10px] text-muted font-bold opacity-60">Сигнал завершения и клики</div>
                </div>
                <button 
                  onClick={() => handleStateChange(prev => ({
                    ...prev,
                    settings: { ...prev.settings, soundEffects: !prev.settings.soundEffects }
                  }))}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-colors relative",
                    state.settings.soundEffects ? "bg-primary" : "bg-line"
                  )}
                >
                  <motion.div 
                    animate={{ x: state.settings.soundEffects ? 24 : 0 }}
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
      <DynamicLighting enabled={state.settings.dynamicLighting && !state.settings.ecoMode} />
      <div className={cn("min-h-screen app lg:flex", isPartyMode && "party-active", state.settings.ecoMode && "eco-mode")} data-theme={state.settings.theme}>
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

      <aside className="sidebar hidden lg:flex flex-col glass backdrop-blur-xl border-r border-line/10">
        <div className="brand brand-wrap cursor-pointer group mb-12" onClick={handleLogoClick}>
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
            {lastSaved && state.settings.autoSave && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                key={lastSaved.getTime()}
                className="text-[9px] font-bold uppercase tracking-widest text-muted mt-2 flex items-center gap-1.5"
              >
                <div className="w-1 h-1 rounded-full bg-success animate-pulse" />
                Сохранено в {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </motion.div>
            )}
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

        {/* Sidebar Tools Removed as requested */}
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
              
              {/* Mobile Sidebar Tools Removed as requested */}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="main flex-1 pb-12 lg:pb-8 px-4 lg:px-8 max-w-7xl mx-auto w-full relative">
        <header className="topbar flex justify-between items-center mb-10 py-6 sticky top-0 glass backdrop-blur-md z-40 -mx-4 px-6 border-b border-line/10 lg:static lg:bg-transparent lg:border-none lg:mx-0 lg:px-0">
          <div className="greet">
            <h2 className="font-display text-4xl lg:text-5xl font-black flex items-center gap-4">
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
        onRefresh={() => {
          setCatPopup(prev => prev ? { ...prev, img: '', breed: undefined } : null);
          fetchNextCat();
        }}
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

      {/* Goal Constructor Modal */}
      <AnimatePresence>
        {isGoalModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-surface rounded-[48px] border border-white/10 shadow-2xl overflow-hidden glass relative"
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h3 className="text-3xl font-black font-display tracking-tight leading-none">
                      {editingGoalId ? 'Правка цели' : 'Новое видение'}
                    </h3>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] text-muted font-bold uppercase tracking-widest opacity-60">Шаг {goalModalStep} из 3</span>
                       <div className="flex gap-1">
                          {[1,2,3].map(s => (
                            <div key={s} className={cn("h-1 rounded-full transition-all", s <= goalModalStep ? "w-4 bg-primary" : "w-1 bg-surface-2")} />
                          ))}
                       </div>
                    </div>
                  </div>
                  <button onClick={() => setIsGoalModalOpen(false)} className="p-3 hover:bg-bg-soft rounded-2xl transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="min-h-[300px]">
                  <AnimatePresence mode="wait">
                    {goalModalStep === 1 && (
                      <motion.div 
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Как назовем проект?</label>
                          <input 
                            autoFocus
                            type="text"
                            value={goalName}
                            onChange={(e) => setGoalName(e.target.value)}
                            className="w-full bg-surface-2 border border-line/50 p-6 rounded-[32px] text-2xl font-black outline-none focus:border-primary transition-all shadow-inner"
                            placeholder="Название цели..."
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Символ удачи</label>
                              <div className="flex flex-wrap gap-2 bg-surface-2 p-3 rounded-[32px] border border-line/50">
                                {['🎯', '🔥', '📚', '💰', '🏃', '🌿', '💻', '🎨', '🚀', '✨'].map(i => (
                                  <button 
                                    key={i}
                                    onClick={() => setGoalIcon(i)}
                                    className={cn(
                                      "w-10 h-10 flex items-center justify-center text-xl rounded-xl transition-all",
                                      goalIcon === i ? "bg-primary text-white shadow-glow" : "hover:bg-bg-soft"
                                    )}
                                  >
                                    {i}
                                  </button>
                                ))}
                              </div>
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Цвет настроения</label>
                              <div className="flex flex-wrap gap-2 bg-surface-2 p-3 rounded-[32px] border border-line/50">
                                {['#ff5dac', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'].map(c => (
                                  <button 
                                    key={c}
                                    onClick={() => setGoalColor(c)}
                                    className={cn(
                                      "w-10 h-10 rounded-xl transition-all border-2",
                                      goalColor === c ? "border-white shadow-lg scale-110" : "border-transparent opacity-60 hover:opacity-100"
                                    )}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                           </div>
                        </div>
                      </motion.div>
                    )}

                    {goalModalStep === 2 && (
                      <motion.div 
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                               <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Целевой масштаб</label>
                               <div className="relative">
                                  <input 
                                    type="number"
                                    value={goalTarget}
                                    onChange={(e) => setGoalTarget(parseInt(e.target.value) || 0)}
                                    className="w-full bg-surface-2 border border-line/50 p-6 rounded-[32px] text-3xl font-black outline-none focus:border-primary transition-all"
                                  />
                                  <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted opacity-50">
                                    <Target size={24} />
                                  </div>
                               </div>
                            </div>
                            <div className="space-y-2">
                               <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Единица измерения</label>
                               <div className="grid grid-cols-2 gap-2">
                                  {['%', 'ед.', 'стр.', 'час', 'мин.', 'руб.', 'занятий', 'раз'].map(u => (
                                    <button 
                                      key={u}
                                      onClick={() => setGoalUnit(u)}
                                      className={cn(
                                        "py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border border-line/30",
                                        goalUnit === u ? "bg-primary text-white border-primary shadow-sm" : "bg-bg-soft hover:bg-line/20"
                                      )}
                                    >
                                      {u}
                                    </button>
                                  ))}
                                  <input 
                                    type="text"
                                    placeholder="Своё..."
                                    className="col-span-2 bg-surface-2 border border-line/50 p-2 rounded-xl text-center text-xs outline-none focus:border-primary"
                                    onChange={(e) => setGoalUnit(e.target.value)}
                                  />
                               </div>
                            </div>
                         </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Шаг прогресса (+ / -)</label>
                            <div className="flex items-center gap-6 bg-surface-2 p-4 rounded-[32px] border border-line/50">
                               <div className="flex-1 space-y-1">
                                  <div className="text-xs font-black">Удобный интервал</div>
                                  <p className="text-[9px] text-muted leading-tight">На сколько будет меняться прогресс при нажатии кнопок на главной</p>
                               </div>
                               <input 
                                 type="number"
                                 value={goalStepValue}
                                 onChange={(e) => setGoalStepValue(parseInt(e.target.value) || 1)}
                                 className="w-24 bg-surface p-4 rounded-2xl text-center font-black text-xl outline-none border border-line"
                               />
                            </div>
                         </div>
                      </motion.div>
                    )}

                    {goalModalStep === 3 && (
                      <motion.div 
                        key="step3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted ml-1">Дата финиша</label>
                            <div className="relative">
                               <input 
                                 type="date"
                                 value={goalDeadline}
                                 onChange={(e) => setGoalDeadline(e.target.value)}
                                 className="w-full bg-surface-2 border border-line/50 p-6 rounded-[32px] text-2xl font-black outline-none focus:border-primary transition-all cursor-pointer"
                               />
                               <div className="absolute right-6 top-1/2 -translate-y-1/2 text-muted opacity-50">
                                  <CalendarIcon size={24} />
                               </div>
                            </div>
                         </div>

                         {goalDeadline && (
                           <div className="p-6 rounded-[32px] bg-primary-soft/10 border border-primary/20 space-y-3">
                              <h4 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                <Sparkles size={14} /> Умный расчет
                              </h4>
                              {(() => {
                                 const days = Math.ceil((new Date(goalDeadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                 if (days <= 0) return <p className="text-sm font-medium opacity-80">Дедлайн сегодня или уже прошел! Пора завершать! 🚀</p>;
                                 const perDay = (goalTarget / days).toFixed(1);
                                 const perWeek = ((goalTarget / days) * 7).toFixed(1);
                                 return (
                                   <div className="space-y-4">
                                      <p className="text-sm font-medium opacity-80 leading-relaxed">
                                        До дедлайна <span className="font-black text-primary">{days} дн.</span> Чтобы успеть вовремя, нужно выполнять в среднем:
                                      </p>
                                      <div className="grid grid-cols-2 gap-3">
                                         <div className="bg-surface p-4 rounded-2xl border border-line/50">
                                            <div className="text-[10px] text-muted font-bold uppercase">В день</div>
                                            <div className="text-xl font-black text-primary">{perDay} <span className="text-[10px] opacity-60 ml-1">{goalUnit}</span></div>
                                         </div>
                                         <div className="bg-surface p-4 rounded-2xl border border-line/50">
                                            <div className="text-[10px] text-muted font-bold uppercase">В неделю</div>
                                            <div className="text-xl font-black text-primary">{perWeek} <span className="text-[10px] opacity-60 ml-1">{goalUnit}</span></div>
                                         </div>
                                      </div>
                                   </div>
                                 );
                              })()}
                           </div>
                         )}

                         {!goalDeadline && (
                           <div className="p-10 text-center space-y-2 opacity-40">
                              <Clock size={40} className="mx-auto" />
                              <p className="text-xs font-bold uppercase tracking-widest">Бессрочная цель</p>
                           </div>
                         )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex gap-4 pt-4">
                  {goalModalStep > 1 && (
                    <button 
                      onClick={() => setGoalModalStep(prev => prev - 1)}
                      className="px-8 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest bg-bg-soft hover:bg-line/20 transition-all"
                    >
                      Назад
                    </button>
                  )}
                  {goalModalStep < 3 ? (
                    <button 
                      onClick={() => setGoalModalStep(prev => prev + 1)}
                      className="flex-1 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest bg-primary text-white shadow-glow hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      Продолжить
                    </button>
                  ) : (
                    <button 
                      onClick={handleSaveGoal}
                      className="flex-1 py-5 rounded-[24px] font-black uppercase text-xs tracking-widest bg-good text-white shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      {editingGoalId ? 'Сохранить изменения' : 'Запустить цель 🚀'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
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
                  {state.habits
                    .filter(h => !h.archived || h.dates.includes(selectedDate))
                    .map(h => (
                      <div key={h.id} className={cn("flex items-center justify-between p-3 rounded-xl border border-line", h.archived ? "bg-bg-soft opacity-70" : "bg-surface-2")}>
                        <div className="flex items-center gap-2">
                          <span>{h.icon}</span>
                          <span className="text-sm font-bold">
                            {h.name} {h.archived && <span className="text-[9px] opacity-50 uppercase ml-1">(Архив)</span>}
                          </span>
                        </div>
                        <button 
                          className={cn(
                            "chip-btn text-xs px-3 py-1 min-h-0 transition-all",
                            h.dates.includes(selectedDate) && "bg-primary text-white border-transparent shadow-sm"
                          )}
                          onClick={() => handleStateChange(prev => ({
                            ...prev,
                            habits: prev.habits.map(x => x.id === h.id ? {
                              ...x,
                              dates: x.dates.includes(selectedDate)
                                ? x.dates.filter(d => d !== selectedDate)
                                : [...x.dates, selectedDate]
                            } : x)
                          }))}
                        >
                          {h.dates.includes(selectedDate) ? 'Готово' : 'Отметить'}
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-muted block">Задачи на этот день</label>
                
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Добавить новую задачу..."
                    value={dayModalTaskText}
                    onChange={(e) => setDayModalTaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && dayModalTaskText.trim()) {
                        handleAddTask(dayModalTaskText, 'important', selectedDate);
                        setDayModalTaskText('');
                      }
                    }}
                    className="flex-1 bg-surface-2 border border-line p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button 
                    onClick={() => {
                      if (dayModalTaskText.trim()) {
                        handleAddTask(dayModalTaskText, 'important', selectedDate);
                        setDayModalTaskText('');
                      }
                    }}
                    className="chip-btn p-3 aspect-square flex items-center justify-center text-primary border-primary/20"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  {state.tasks.filter(t => t.date === selectedDate).length > 0 ? (
                    state.tasks.filter(t => t.date === selectedDate).map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-line">
                        <button 
                          onClick={() => handleTaskToggle(t.id)}
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                            t.done ? "bg-primary border-primary text-white" : "border-line"
                          )}
                        >
                          {t.done && <Check size={12} strokeWidth={4} />}
                        </button>
                        <span className="flex-shrink-0 text-lg mr-1">{t.icon || '📝'}</span>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm block truncate", t.done && "line-through opacity-50")}>{t.text}</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {t.tags && t.tags.map(tag => (
                              <span key={tag} className="text-[7px] bg-bg-soft text-muted px-1 rounded-full border border-line">#{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-muted italic text-center py-2">Задач пока нет</div>
                  )}
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
                    <X size={14} />
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

      {/* FAB removed as requested */}

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
