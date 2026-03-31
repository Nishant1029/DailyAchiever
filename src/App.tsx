/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  format, 
  subDays, 
  addDays, 
  isSameDay, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday,
  subMonths,
  addMonths
} from 'date-fns';
import { 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  Calendar as CalendarIcon,
  Trophy,
  Activity,
  Code,
  Database,
  BookOpen,
  Languages,
  Keyboard,
  AlertCircle,
  Plus,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Settings,
  Target,
  LayoutDashboard,
  BarChart2,
  Sun,
  Moon,
  Bell,
  ArrowUp,
  ArrowRight,
  ArrowDown,
  RotateCcw,
  Undo2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider } from './firebase';
import { cn } from './lib/utils';
import { collection, query, orderBy, deleteDoc, addDoc } from 'firebase/firestore';

// --- Error Handling Spec for Firestore Operations ---
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

// --- Contexts & Components ---

const ThemeContext = React.createContext<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

const Tooltip = ({ children, text }: { children: React.ReactNode; text: string }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold rounded-xl whitespace-nowrap z-50 pointer-events-none shadow-2xl border border-slate-800 dark:border-slate-200"
          >
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const UndoToast = ({ action, onUndo, onDismiss }: { action: any; onUndo: () => void; onDismiss: () => void }) => {
  const [progress, setProgress] = useState(100);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const duration = 5000;
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (progress <= 0) {
      onDismissRef.current();
    }
  }, [progress]);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 bg-slate-900 dark:bg-white text-white dark:text-slate-900 p-4 rounded-2xl shadow-2xl z-50 flex items-center justify-between border border-slate-800 dark:border-slate-200 overflow-hidden"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
          <RotateCcw size={16} />
        </div>
        <p className="text-xs font-bold tracking-tight">
          {action.type === 'delete' ? 'Task deleted' : 'Task updated'}
        </p>
      </div>
      <button
        onClick={onUndo}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center gap-2"
      >
        <Undo2 size={12} />
        Undo
      </button>
      <div 
        className="absolute bottom-0 left-0 h-1 bg-blue-600 transition-all duration-75" 
        style={{ width: `${progress}%` }} 
      />
    </motion.div>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.error.message);
        if (parsed.error) {
          setError(`Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`);
        }
      } catch {
        setError(event.error.message || 'An unexpected error occurred');
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle size={24} />
            <h2 className="text-xl font-bold">Something went wrong</h2>
          </div>
          <p className="text-gray-600 mb-6 break-words">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const TaskItem = ({ 
  label, 
  done, 
  onToggle, 
  icon: Icon,
  colorClass,
  priority
}: { 
  label: string; 
  done: boolean; 
  onToggle: () => void | Promise<void>;
  icon: any;
  colorClass: string;
  priority?: number;
  key?: string;
}) => (
  <motion.button 
    whileHover={{ scale: 1.02, y: -4 }}
    whileTap={{ scale: 0.98 }}
    onClick={onToggle}
    className={cn(
      "flex items-center justify-between p-6 rounded-[2.5rem] border-2 transition-all duration-500 group relative overflow-hidden",
      done 
        ? "bg-slate-50/50 dark:bg-zinc-900/30 border-transparent opacity-70" 
        : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/10 dark:hover:shadow-none"
    )}
  >
    {done && (
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-12 -mt-12 blur-2xl" />
    )}
    <div className="flex items-center gap-6 relative z-10">
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm", 
        done 
          ? "bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500" 
          : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 group-hover:rotate-3"
      )}>
        <Icon size={28} />
      </div>
      <div className="flex flex-col items-start">
        <span className={cn(
          "font-black text-2xl tracking-tight transition-all duration-500", 
          done ? "text-slate-400 line-through decoration-2" : "text-slate-900 dark:text-white"
        )}>
          {label}
        </span>
        {priority && (
          <div className={cn(
            "mt-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5",
            priority === 3 ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" : 
            priority === 2 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" : 
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
              priority === 3 ? "bg-rose-500" : priority === 2 ? "bg-amber-500" : "bg-emerald-500"
            )} />
            {priority === 3 ? 'High' : priority === 2 ? 'Medium' : 'Low'} Priority
          </div>
        )}
      </div>
    </div>
    <div className={cn(
      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 relative z-10 border-2",
      done 
        ? "bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-500/40 rotate-0" 
        : "bg-slate-50 dark:bg-zinc-800 border-slate-100 dark:border-zinc-700 text-transparent -rotate-12 group-hover:rotate-0 group-hover:text-indigo-600/30 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20"
    )}>
      <CheckCircle2 size={28} className={cn("transition-transform duration-500", done ? "scale-100" : "scale-0 group-hover:scale-100")} />
    </div>
  </motion.button>
);

const iconMap: { [key: string]: any } = {
  Activity, Code, Database, BookOpen, Languages, Keyboard
};

interface DailyLog {
  date: string;
  tasks: Record<string, boolean>;
  reasonForIncomplete?: string;
  isComplete?: boolean;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { theme, toggleTheme } = React.useContext(ThemeContext);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyLog, setDailyLog] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [customTasks, setCustomTasks] = useState<any[]>([]);
  const [showTaskManager, setShowTaskManager] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState(2);
  const [showNotes, setShowNotes] = useState(false);
  const [reasonForIncomplete, setReasonForIncomplete] = useState('');
  const [view, setView] = useState<'daily' | 'calendar' | 'dashboard'>('daily');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [logs, setLogs] = useState<Record<string, DailyLog>>({});
  const [reminderTime, setReminderTime] = useState<string>(() => userData?.reminderTime || '');
  const [showReminderSettings, setShowReminderSettings] = useState(false);
  const [undoAction, setUndoAction] = useState<any>(null);
  const [deletedTaskIds, setDeletedTaskIds] = useState<Set<string>>(new Set());

  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!reminderTime || !user) return;

    const checkReminder = () => {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');
      
      if (currentTime === reminderTime) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Daily Achievement Reminder', {
            body: "Don't forget to complete your tasks today!",
            icon: '/favicon.ico'
          });
        }
      }
    };

    const interval = setInterval(checkReminder, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [reminderTime, user]);

  const updateReminderTime = async (time: string) => {
    if (!user) return;
    setReminderTime(time);
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, { reminderTime: time });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const checkMilestones = async (newStreak: number) => {
    if (!user || !userData) return;
    
    const milestones = [7, 30, 60, 100, 365];
    if (milestones.includes(newStreak)) {
      const badgeName = `${newStreak} Day Streak`;
      const currentBadges = userData.badges || [];
      
      if (!currentBadges.includes(badgeName)) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          badges: [...currentBadges, badgeName]
        });
      }
    }
  };

  const calculateStreaks = async (allLogs: Record<string, any>) => {
    if (!user) return;
    
    const sortedDates = Object.keys(allLogs).sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    let today = format(new Date(), 'yyyy-MM-dd');
    let yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    
    // Check if streak is still active (either today or yesterday must have a log)
    if (!allLogs[today]?.isComplete && !allLogs[yesterday]?.isComplete) {
      currentStreak = 0;
    } else {
      let checkDate = allLogs[today]?.isComplete ? new Date() : subDays(new Date(), 1);
      while (true) {
        const key = format(checkDate, 'yyyy-MM-dd');
        if (allLogs[key]?.isComplete) {
          currentStreak++;
          checkDate = subDays(checkDate, 1);
        } else {
          break;
        }
      }
    }

    const userRef = doc(db, 'users', user.uid);
    const bestStreak = Math.max(userData?.bestStreak || 0, currentStreak);
    
    if (currentStreak !== userData?.currentStreak || bestStreak !== userData?.bestStreak) {
      await updateDoc(userRef, {
        currentStreak,
        bestStreak
      });
      if (currentStreak > (userData?.currentStreak || 0)) {
        checkMilestones(currentStreak);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setIsAuthReady(true);
      
      if (u) {
        // Ensure user document exists
        const userRef = doc(db, 'users', u.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setUserData(snap.data());
          } else {
            const initialData = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              challengeGoal: 60,
              createdAt: serverTimestamp()
            };
            setDoc(userRef, initialData).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
            setUserData(initialData);
          }
        });

        // Fetch custom tasks
        const tasksRef = collection(db, 'users', u.uid, 'tasks');
        const q = query(tasksRef, orderBy('createdAt', 'asc'));
        onSnapshot(q, (snap) => {
          const tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (tasks.length === 0) {
            // Seed default tasks if none exist
            const defaultTasks = [
              { label: 'Workout', icon: 'Activity', color: 'bg-orange-500 text-white', priority: 3 },
              { label: 'DSA', icon: 'Code', color: 'bg-blue-500 text-white', priority: 3 },
              { label: 'Data Science', icon: 'Database', color: 'bg-purple-500 text-white', priority: 2 },
              { label: 'Academic', icon: 'BookOpen', color: 'bg-emerald-500 text-white', priority: 2 },
              { label: 'English', icon: 'Languages', color: 'bg-indigo-500 text-white', priority: 1 },
              { label: 'Typing (60 Days)', icon: 'Keyboard', color: 'bg-pink-500 text-white', priority: 1 },
            ];
            defaultTasks.forEach(t => {
              addDoc(tasksRef, { ...t, createdAt: serverTimestamp() });
            });
          }
          setCustomTasks(tasks);
        });
      }
    });
    return unsubscribe;
  }, []);

  // Validate connection to Firestore
  useEffect(() => {
    if (isAuthReady && user) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if(error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration. ");
          }
        }
      };
      testConnection();
    }
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const logRef = doc(db, 'users', user.uid, 'daily_logs', dateKey);
    const unsubscribe = onSnapshot(logRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDailyLog(data);
        setReasonForIncomplete(data.reasonForIncomplete || '');
      } else {
        setDailyLog({
          date: dateKey,
          tasks: {},
          reasonForIncomplete: ''
        });
        setReasonForIncomplete('');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/daily_logs/${dateKey}`);
    });

    return unsubscribe;
  }, [user, dateKey, isAuthReady]);

  const toggleTask = async (taskId: string) => {
    if (!user || !dailyLog) return;

    const logRef = doc(db, 'users', user.uid, 'daily_logs', dateKey);
    const currentTasks = dailyLog.tasks || {};
    const oldValue = !!currentTasks[taskId];
    const newValue = !oldValue;
    
    // Save for undo
    setUndoAction({
      type: 'toggle',
      taskId,
      oldValue,
      dateKey
    });

    const updatedTasks = {
      ...currentTasks,
      [taskId]: newValue
    };

    const isComplete = customTasks.every(t => updatedTasks[t.id]);

    try {
      await setDoc(logRef, {
        ...dailyLog,
        tasks: updatedTasks,
        isComplete,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/daily_logs/${dateKey}`);
    }
  };

  const undoToggle = async (action: any) => {
    if (!user) return;
    const logRef = doc(db, 'users', user.uid, 'daily_logs', action.dateKey);
    const logSnap = await getDoc(logRef);
    if (!logSnap.exists()) return;
    
    const data = logSnap.data();
    const updatedTasks = {
      ...(data.tasks || {}),
      [action.taskId]: action.oldValue
    };
    
    const isComplete = customTasks.every(t => updatedTasks[t.id]);
    
    await updateDoc(logRef, {
      tasks: updatedTasks,
      isComplete,
      updatedAt: serverTimestamp()
    });
    setUndoAction(null);
  };

  const removeTask = async (taskId: string) => {
    if (!user) return;
    
    // Soft delete locally first
    setDeletedTaskIds(prev => new Set(prev).add(taskId));
    
    setUndoAction({
      type: 'delete',
      taskId,
      taskData: customTasks.find(t => t.id === taskId)
    });
  };

  const finalizeDelete = async (taskId: string) => {
    if (!user) return;
    const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
    try {
      await deleteDoc(taskRef);
      setDeletedTaskIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/tasks/${taskId}`);
    }
  };

  const updateReason = async (newReason: string) => {
    if (!user || !dailyLog) return;
    const logRef = doc(db, 'users', user.uid, 'daily_logs', dateKey);
    try {
      await updateDoc(logRef, {
        reasonForIncomplete: newReason,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/daily_logs/${dateKey}`);
    }
  };

  const addTask = async () => {
    if (!user || !newTaskLabel.trim()) return;
    const tasksRef = collection(db, 'users', user.uid, 'tasks');
    try {
      await addDoc(tasksRef, {
        label: newTaskLabel,
        icon: 'Activity',
        color: 'bg-blue-500 text-white',
        priority: newTaskPriority,
        createdAt: serverTimestamp()
      });
      setNewTaskLabel('');
      setNewTaskPriority(2);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/tasks`);
    }
  };

  const undoDelete = (taskId: string) => {
    setDeletedTaskIds(prev => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setUndoAction(null);
  };

  const updateGoal = async (goal: number) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, { challengeGoal: goal });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const logsRef = collection(db, 'users', user.uid, 'daily_logs');
    const unsubscribe = onSnapshot(logsRef, (snap) => {
      const logsMap: { [key: string]: any } = {};
      snap.docs.forEach(doc => {
        logsMap[doc.id] = doc.data();
      });
      setLogs(logsMap);
      calculateStreaks(logsMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/daily_logs`);
    });

    return unsubscribe;
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError(null);
    console.log('Starting login process...');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Login successful:', result.user.email);
    } catch (error: any) {
      console.error('Login error details:', {
        code: error.code,
        message: error.message,
        customData: error.customData,
        email: error.email
      });
      
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('Login popup closed by user');
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('The login popup was blocked by your browser. Please allow popups for this site to sign in.');
      } else if (error.code === 'auth/api-key-not-valid') {
        setAuthError('Firebase API Key is invalid. This might be a configuration issue. Please try refreshing the page or contact support.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized for Firebase Auth. Please contact the developer.');
      } else {
        setAuthError(`Login failed: ${error.message} (${error.code})`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="mb-8 inline-flex p-4 bg-blue-500/10 rounded-3xl">
            <Trophy className="text-blue-400" size={48} />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Daily Achievement</h1>
          <p className="text-slate-400 mb-8 text-lg">Track your daily progress and conquer your 60-day challenge.</p>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex flex-col gap-3 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
              <button 
                onClick={() => setAuthError(null)}
                className="text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors self-end"
              >
                Clear Error
              </button>
            </div>
          )}

          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={cn(
              "w-full py-4 px-6 bg-white text-slate-900 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-all shadow-xl flex items-center justify-center gap-3",
              isLoggingIn && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoggingIn ? (
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-slate-900"></div>
            ) : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />
                Sign in with Google
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const completedCount = customTasks.filter(t => dailyLog?.tasks?.[t.id]).length;
  const progressPercent = customTasks.length > 0 ? Math.round((completedCount / customTasks.length) * 100) : 0;
  const challengeGoal = userData?.challengeGoal || 60;

  const getCompletionRate = (log: any) => {
    if (!log || !log.tasks || customTasks.length === 0) return 0;
    const completed = Object.values(log.tasks).filter(v => v === true).length;
    return Math.round((completed / customTasks.length) * 100);
  };

  const statsData = Array.from({ length: 30 }, (_, i) => {
    const date = subDays(new Date(), 29 - i);
    const key = format(date, 'yyyy-MM-dd');
    const log = logs[key];
    return {
      date: format(date, 'MMM d'),
      rate: getCompletionRate(log),
      fullDate: key
    };
  });

  const weeklyAverage = Math.round(
    statsData.slice(-7).reduce((acc, curr) => acc + curr.rate, 0) / 7
  );
  const monthlyAverage = Math.round(
    statsData.reduce((acc, curr) => acc + curr.rate, 0) / 30
  );

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

  const totalTasksCompleted = Object.values(logs).reduce((acc: number, log: any) => {
    return acc + Object.values(log.tasks || {}).filter(v => v === true).length;
  }, 0);

  return (
    <ErrorBoundary>
      <div className={cn("min-h-screen pb-32 transition-colors duration-500", theme === 'dark' ? "bg-black text-white" : "bg-slate-50 text-slate-900")}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-black/80 backdrop-blur-3xl border-b border-slate-200 dark:border-zinc-900">
          <div className="max-w-6xl mx-auto px-6 h-24 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 rotate-6 hover:rotate-0 transition-all duration-500 cursor-pointer">
                <Target size={28} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">Achiever</h1>
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.3em] mt-1">Personal Growth</span>
              </div>
              
              <div className="w-px h-10 bg-slate-200 dark:bg-zinc-800 mx-2 hidden md:block" />

              <Tooltip text="View Dashboard">
                <button 
                  onClick={() => setView('dashboard')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-2xl transition-all group",
                    view === 'dashboard' ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" : "hover:bg-slate-100 dark:hover:bg-zinc-900 text-slate-500 dark:text-zinc-400"
                  )}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-500/20 group-hover:border-indigo-500 transition-all">
                    <img src={user.photoURL || ''} alt="Profile" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold text-sm hidden lg:block">My Dashboard</span>
                </button>
              </Tooltip>
            </div>
            
            {view === 'daily' && (
              <div className="flex items-center gap-1 bg-gray-100/50 dark:bg-zinc-900/50 p-1 rounded-2xl border border-gray-200/50 dark:border-zinc-800/50">
                <button 
                  onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                  className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-all text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="px-4 flex items-center gap-2 font-bold text-gray-700 dark:text-slate-300 min-w-[140px] justify-center text-xs uppercase tracking-widest">
                  <CalendarIcon size={14} className="text-indigo-500" />
                  {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMM d, yyyy')}
                </div>
                <button 
                  onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                  className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-all text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}

            {view === 'calendar' && (
              <div className="flex items-center gap-1 bg-gray-100/50 dark:bg-zinc-900/50 p-1 rounded-2xl border border-gray-200/50 dark:border-zinc-800/50">
                <button 
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="px-4 flex items-center gap-2 font-bold text-gray-700 dark:text-slate-300 min-w-[140px] justify-center text-xs uppercase tracking-widest">
                  {format(currentMonth, 'MMMM yyyy')}
                </div>
                <button 
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 hover:bg-white dark:hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}

            {view === 'dashboard' && (
              <div className="font-black text-gray-900 dark:text-white uppercase tracking-[0.2em] text-xs">Analytics</div>
            )}

            <div className="flex items-center gap-3">
              <Tooltip text={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
                <button 
                  onClick={toggleTheme}
                  className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-900"
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
              </Tooltip>
              
              <Tooltip text={showTaskManager ? 'Close' : 'Add Task'}>
                <button 
                  onClick={() => setShowTaskManager(!showTaskManager)}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl transition-all",
                    showTaskManager 
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                      : "bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  )}
                >
                  <Plus size={20} className={cn("transition-transform duration-300", showTaskManager && "rotate-45")} />
                </button>
              </Tooltip>

              <div className="w-px h-6 bg-gray-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

              <Tooltip text="Sign Out">
                <button 
                  onClick={handleLogout}
                  className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut size={20} />
                </button>
              </Tooltip>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-16">
          {view === 'daily' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Welcome Message */}
              <div className="mb-12 px-4">
                <h1 className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight mb-4">
                  Hello, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">{user.displayName?.split(' ')[0]}</span>! 👋
                </h1>
                <p className="text-slate-500 dark:text-zinc-400 font-medium text-xl md:text-2xl max-w-3xl leading-relaxed">
                  {progressPercent === 100 
                    ? "You've conquered all your tasks today! Amazing work. 🚀" 
                    : progressPercent > 0 
                      ? "You're making great progress. Keep it up! ✨" 
                      : "Ready to start your daily achievement journey? Let's go! 💪"}
                </p>
              </div>

              {/* Progress Card */}
              <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-[3rem] p-10 mb-12 text-white shadow-2xl shadow-indigo-500/30 dark:shadow-none relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl group-hover:scale-125 transition-transform duration-1000" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/20 rounded-full -ml-32 -mb-32 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div>
                      <h2 className="text-indigo-100 font-bold uppercase tracking-[0.3em] text-[10px] mb-3">Daily Completion</h2>
                      <div className="flex items-end gap-3">
                        <span className="text-8xl font-black tracking-tighter leading-none">{progressPercent}%</span>
                        <span className="text-indigo-200 mb-2 font-bold text-lg">Done</span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-white/10 backdrop-blur-xl p-5 rounded-3xl border border-white/20 text-center min-w-[100px] shadow-xl">
                        <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-2">Streak</p>
                        <p className="text-3xl font-black">🔥 {userData?.currentStreak || 0}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-xl p-5 rounded-3xl border border-white/20 text-center min-w-[100px] shadow-xl">
                        <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest mb-2">Best</p>
                        <p className="text-3xl font-black">🏆 {userData?.bestStreak || 0}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-10 w-full h-4 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm border border-white/10">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-blue-400 to-white shadow-[0_0_20px_rgba(255,255,255,0.6)]"
                    />
                  </div>
                  
                  <div className="mt-8 flex flex-wrap gap-2">
                    {userData?.badges?.slice(-3).map((badge: string) => (
                      <span key={badge} className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-xl text-[10px] font-bold uppercase tracking-wider border border-white/20 flex items-center gap-1.5">
                        <span className="text-xs">✨</span> {badge}
                      </span>
                    ))}
                  </div>
                </div>
                <Trophy className="absolute -right-12 -bottom-12 text-white/5 rotate-12 group-hover:rotate-0 transition-transform duration-700" size={240} />
              </div>

              {/* Task Manager */}
              {showTaskManager && (
                <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 mb-10 border border-slate-200 dark:border-zinc-800 shadow-xl shadow-slate-200/50 dark:shadow-none animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex flex-col">
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                          <Plus size={24} />
                        </div>
                        Manage Your Tasks
                      </h3>
                      <p className="text-slate-500 dark:text-zinc-400 text-sm mt-1 font-medium">Add, edit, or remove your daily goals</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Tooltip text="Daily Reminder Settings">
                        <button 
                          onClick={() => setShowReminderSettings(!showReminderSettings)}
                          className={cn(
                            "w-12 h-12 rounded-2xl transition-all flex items-center justify-center shadow-sm",
                            showReminderSettings ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800" : "text-slate-400 bg-slate-50 dark:bg-zinc-800 hover:text-indigo-600 border border-slate-200 dark:border-zinc-700"
                          )}
                        >
                          <Bell size={20} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {showReminderSettings && (
                    <div className="mb-6 p-4 bg-blue-50 dark:bg-slate-900 rounded-2xl border border-blue-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-blue-900 dark:text-blue-400 uppercase tracking-wider">Daily Reminder</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-500 font-bold">SET TIME</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <input 
                          type="time" 
                          value={reminderTime}
                          onChange={(e) => updateReminderTime(e.target.value)}
                          className="bg-white dark:bg-slate-800 dark:text-white px-4 py-2 rounded-xl border-2 border-transparent focus:border-blue-500 outline-none transition-all font-mono"
                        />
                        <p className="text-xs text-blue-700 dark:text-blue-500 leading-relaxed">
                          We'll send you a browser notification at this time every day to help you stay on track.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3 mb-6">
                    {customTasks
                      .filter(t => !deletedTaskIds.has(t.id))
                      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                      .map(task => (
                      <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 group transition-all hover:border-blue-200 dark:hover:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg", task.color)}>
                            {React.createElement(iconMap[task.icon] || Activity, { size: 14 })}
                          </div>
                          <span className="font-bold text-gray-700 dark:text-slate-300 text-sm">{task.label}</span>
                          <span className={cn(
                            "text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                            task.priority === 3 ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : 
                            task.priority === 2 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" : 
                            "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                          )}>
                            {task.priority === 3 ? 'High' : task.priority === 2 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                        <button 
                          onClick={() => removeTask(task.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newTaskLabel}
                        onChange={(e) => setNewTaskLabel(e.target.value)}
                        placeholder="Add new task..."
                        className="flex-1 px-4 py-2 bg-gray-50 dark:bg-slate-900 dark:text-white border-2 border-transparent focus:border-blue-500 rounded-xl outline-none transition-all"
                      />
                      <button 
                        onClick={addTask}
                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                      >
                        <Plus size={24} />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-4 px-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Priority:</span>
                      <div className="flex gap-2">
                        {[1, 2, 3].map((p) => (
                          <button
                            key={p}
                            onClick={() => setNewTaskPriority(p)}
                            className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                              newTaskPriority === p 
                                ? (p === 3 ? "bg-red-600 text-white" : p === 2 ? "bg-orange-600 text-white" : "bg-blue-600 text-white")
                                : "bg-gray-100 dark:bg-slate-900 text-gray-400 dark:text-slate-500 hover:bg-gray-200 dark:hover:bg-slate-700"
                            )}
                          >
                            {p === 3 ? 'High' : p === 2 ? 'Medium' : 'Low'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Task List */}
              <div className="space-y-4 mb-8">
                <h3 className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] px-2">Daily Objectives</h3>
                <div className="grid gap-4">
                  {customTasks
                    .filter(t => !deletedTaskIds.has(t.id))
                    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                    .map((task) => (
                    <TaskItem
                      key={task.id}
                      label={task.label}
                      icon={iconMap[task.icon] || Activity}
                      colorClass={task.color}
                      priority={task.priority}
                      done={!!dailyLog?.tasks?.[task.id]}
                      onToggle={() => toggleTask(task.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Reason Section */}
              <div className="mb-8">
                <button 
                  onClick={() => setShowNotes(!showNotes)}
                  className="flex items-center justify-between w-full text-sm font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest px-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    Reason for Incomplete Tasks
                  </div>
                  {showNotes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showNotes && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <textarea 
                      value={reasonForIncomplete}
                      onChange={(e) => setReasonForIncomplete(e.target.value)}
                      onBlur={() => updateReason(reasonForIncomplete)}
                      placeholder="Why did you miss a task? (e.g., Exam, Health, Travel...)"
                      className="w-full h-24 p-4 bg-white dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-800 focus:border-blue-500 rounded-2xl outline-none transition-all resize-none shadow-sm text-gray-700 dark:text-slate-300"
                    />
                    <div className="mt-4 flex justify-between items-center px-2">
                      <p className="text-[10px] text-gray-400 dark:text-slate-600 uppercase font-bold tracking-wider">Auto-saved on blur</p>
                    </div>
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Recent History</h3>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-200 dark:border-slate-800 overflow-hidden shadow-xl shadow-gray-200/20 dark:shadow-none">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                          <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest sticky left-0 bg-gray-50 dark:bg-slate-800 z-10">Date</th>
                          {customTasks
                            .filter(t => !deletedTaskIds.has(t.id))
                            .map(t => {
                            const Icon = iconMap[t.icon] || Activity;
                            return (
                              <th key={t.id} className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest text-center">
                                <Tooltip text={t.label}>
                                  <div className="flex flex-col items-center gap-1">
                                    <Icon size={16} className="text-blue-500" />
                                    <span className="hidden sm:inline">{t.label}</span>
                                  </div>
                                </Tooltip>
                              </th>
                            );
                          })}
                          <th className="p-6 text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                        {Object.values(logs)
                          .sort((a: DailyLog, b: DailyLog) => b.date.localeCompare(a.date))
                          .slice(0, 7)
                          .map((log: DailyLog) => (
                          <tr key={log.date} className={cn("hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group", isSameDay(parseISO(log.date), selectedDate) && "bg-blue-50 dark:bg-blue-900/20")}>
                            <td className="p-6 sticky left-0 bg-white dark:bg-slate-900 z-10 group-hover:bg-blue-50/30 dark:group-hover:bg-blue-900/10 transition-colors">
                              <button 
                                onClick={() => setSelectedDate(parseISO(log.date))}
                                className="text-sm font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
                              >
                                {isSameDay(parseISO(log.date), new Date()) ? 'Today' : format(parseISO(log.date), 'MMM d')}
                              </button>
                            </td>
                            {customTasks
                              .filter(t => !deletedTaskIds.has(t.id))
                              .map(t => (
                              <td key={t.id} className="p-6 text-center">
                                {log.tasks?.[t.id] ? (
                                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                                    <CheckCircle2 size={18} />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 bg-red-50 dark:bg-red-900/20 text-red-200 dark:text-red-800 rounded-xl flex items-center justify-center mx-auto">
                                    <XCircle size={18} />
                                  </div>
                                )}
                              </td>
                            ))}
                            <td className="p-6 min-w-[200px]">
                              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 line-clamp-2 italic" title={log.reasonForIncomplete}>
                                {log.reasonForIncomplete || '-'}
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'calendar' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-gray-200 dark:border-slate-800 shadow-xl shadow-gray-200/20 dark:shadow-none">
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, i) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const log = logs[key];
                    const rate = getCompletionRate(log);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = isSameDay(day, selectedDate);
                    
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedDate(day);
                          setView('daily');
                        }}
                        className={cn(
                          "aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border-4 group",
                          !isCurrentMonth ? "opacity-20 pointer-events-none" : "opacity-100",
                          isSelected ? "border-blue-500 scale-110 z-10 shadow-xl shadow-blue-500/20" : "border-transparent",
                          rate === 0 ? "bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700" : 
                          rate < 34 ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" :
                          rate < 67 ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                          "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        )}
                      >
                        <span className={cn("text-sm font-black tracking-tighter", isToday(day) && !isSelected && "text-blue-600 dark:text-blue-400 underline decoration-2 underline-offset-4")}>
                          {format(day, 'd')}
                        </span>
                        {log && (
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full mt-1 transition-transform group-hover:scale-150",
                            rate === 100 ? "bg-white" : "bg-current opacity-50"
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-gray-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-[10px] font-black text-gray-400 dark:text-slate-500 mb-6 uppercase tracking-widest">Completion Legend</h3>
                <div className="flex flex-wrap gap-6">
                  {[
                    { label: 'No Data', color: 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700' },
                    { label: '1-33%', color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/40' },
                    { label: '34-66%', color: 'bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-900/60' },
                    { label: '67-100%', color: 'bg-blue-600 border-transparent' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={cn("w-5 h-5 rounded-lg border-2", item.color)} />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'dashboard' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
              {/* Profile Section */}
              <div className="bg-white dark:bg-zinc-900 rounded-[3rem] p-10 border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-slate-200/50 dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full -mr-48 -mt-48 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full -ml-48 -mb-48 blur-3xl" />
                
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                  <div className="relative group">
                    <div className="w-40 h-40 rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-zinc-800 shadow-2xl rotate-3 group-hover:rotate-0 transition-all duration-700">
                      <img 
                        src={user.photoURL || ''} 
                        alt={user.displayName || ''} 
                        className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-700"
                        referrerPolicy="no-referrer" 
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-emerald-500 w-8 h-8 rounded-full border-4 border-white dark:border-zinc-900 shadow-lg animate-pulse" />
                  </div>
                  
                  <div className="text-center md:text-left flex-1">
                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
                      {user.displayName}
                    </h2>
                    <p className="text-slate-500 dark:text-zinc-400 font-medium text-lg mb-6">{user.email}</p>
                    
                    <div className="flex flex-wrap justify-center md:justify-start gap-4">
                      <div className="px-5 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-2xl text-xs font-bold uppercase tracking-widest border border-indigo-100 dark:border-indigo-800 flex items-center gap-2">
                        <CalendarIcon size={14} />
                        Member Since {userData?.createdAt ? format(userData.createdAt.toDate(), 'MMM yyyy') : '...'}
                      </div>
                      <div className="px-5 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-2xl text-xs font-bold uppercase tracking-widest border border-purple-100 dark:border-purple-800 flex items-center gap-2">
                        <Target size={14} />
                        {customTasks.length} Active Tasks
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                {[
                  { label: 'Total Done', value: totalTasksCompleted, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-100 dark:border-emerald-800/50' },
                  { label: 'Weekly Avg', value: `${weeklyAverage}%`, icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-100 dark:border-indigo-800/50' },
                  { label: 'Monthly Avg', value: `${monthlyAverage}%`, icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-800/50' },
                  { label: 'Current Streak', value: userData?.currentStreak || 0, icon: Sun, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-800/50' },
                  { label: 'Best Streak', value: userData?.bestStreak || 0, icon: Trophy, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-100 dark:border-rose-800/50' },
                ].map((stat, i) => (
                  <div key={i} className={cn("bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border transition-all hover:scale-105 hover:shadow-xl group", stat.border)}>
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:rotate-12", stat.bg, stat.color)}>
                      <stat.icon size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Performance Chart */}
              <div className="bg-white dark:bg-zinc-900 p-10 rounded-[3rem] border border-slate-200 dark:border-zinc-800 shadow-xl shadow-slate-200/50 dark:shadow-none">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex flex-col">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Performance Trend</h3>
                    <p className="text-slate-500 dark:text-zinc-400 text-sm font-medium mt-1">Your completion rates over the last 30 days</p>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-zinc-800 rounded-xl border border-slate-100 dark:border-zinc-700">
                    <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Last 30 Days</span>
                  </div>
                </div>
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%" minHeight={400}>
                    <AreaChart data={statsData}>
                      <defs>
                        <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#27272a' : '#f1f5f9'} />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 'bold', fill: theme === 'dark' ? '#71717a' : '#94a3b8' }}
                        interval={6}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 'bold', fill: theme === 'dark' ? '#71717a' : '#94a3b8' }}
                        domain={[0, 100]}
                      />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff',
                          borderRadius: '24px', 
                          border: '1px solid ' + (theme === 'dark' ? '#27272a' : '#f1f5f9'), 
                          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                          color: theme === 'dark' ? '#f8fafc' : '#0f172a',
                          padding: '16px'
                        }}
                        labelStyle={{ fontWeight: '900', marginBottom: '8px', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="rate" 
                        stroke="#4f46e5" 
                        strokeWidth={6}
                        fillOpacity={1} 
                        fill="url(#colorRate)" 
                        name="Completion %"
                        animationDuration={2000}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Achievements & Insights */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                    <Trophy size={18} className="text-orange-500" />
                    Earned Badges
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {userData?.badges && userData.badges.length > 0 ? (
                      userData.badges.map((badge: string) => (
                        <div key={badge} className="group relative">
                          <div className="px-4 py-2 bg-gradient-to-br from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 border border-orange-100 dark:border-orange-800/50 rounded-2xl flex items-center gap-2 transition-all hover:scale-105">
                            <span className="text-xl">✨</span>
                            <span className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">{badge}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="w-full py-8 text-center border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-[2rem]">
                        <p className="text-sm text-gray-400 dark:text-slate-500 italic">Complete streaks to earn badges!</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-gray-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={18} className="text-blue-500" />
                    Consistency Insights
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-800/30">
                      <div className="p-2 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-xl">
                        <Target size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Goal Progress</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          You are currently at <span className="font-bold text-blue-600">{userData?.currentStreak || 0}</span> days out of your <span className="font-bold text-blue-600">{userData?.challengeGoal || 60}</span> day goal.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/50 dark:border-emerald-800/30">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-300 rounded-xl">
                        <Activity size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Consistency Level</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          {monthlyAverage > 80 ? 'Elite: You are incredibly consistent!' : monthlyAverage > 50 ? 'Steady: You are making great progress.' : 'Developing: Keep building that momentum!'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Motivation Footer */}
          <div className="mt-12 text-center">
            <p className="text-gray-400 italic">"Consistency is the key to success. Keep pushing!"</p>
          </div>
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-gray-200 dark:border-slate-800 pb-safe z-20">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-around">
            <Tooltip text="Daily Task List">
              <button 
                onClick={() => setView('daily')}
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors",
                  view === 'daily' ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                )}
              >
                <LayoutDashboard size={20} />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Daily</span>
              </button>
            </Tooltip>
            <Tooltip text="Monthly Calendar View">
              <button 
                onClick={() => setView('calendar')}
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors",
                  view === 'calendar' ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                )}
              >
                <CalendarIcon size={20} />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Calendar</span>
              </button>
            </Tooltip>
            <Tooltip text="Performance Statistics & Profile">
              <button 
                onClick={() => setView('dashboard')}
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors",
                  view === 'dashboard' ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
                )}
              >
                <BarChart2 size={20} />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Dashboard</span>
              </button>
            </Tooltip>
          </div>
        </nav>

        <AnimatePresence>
          {undoAction && (
            <UndoToast 
              action={undoAction} 
              onUndo={() => {
                if (undoAction.type === 'delete') {
                  undoDelete(undoAction.taskId);
                } else {
                  undoToggle(undoAction);
                }
              }}
              onDismiss={() => {
                if (undoAction.type === 'delete') {
                  finalizeDelete(undoAction.taskId);
                }
                setUndoAction(null);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
