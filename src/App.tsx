import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import WelcomePage from './components/WelcomePage';
import { apiFetch, detectBackendMode, getAuthToken, isFirebaseMode, isStaticMode, setAuthToken, setBackendMode } from './lib/api';
import { auth } from './lib/firebase';
import { subscribeFirebaseEvents } from './lib/firebaseBackend';
import { subscribeStaticEvents } from './lib/staticBackend';
import { playNotificationChime, triggerBrowserPushNotification } from './lib/sound';
import type { NotificationItem, PktTimeInfo, SessionUser } from './types';

const PrincipalDashboard = lazy(() => import('./components/PrincipalDashboard'));
const TeacherDashboard = lazy(() => import('./components/TeacherDashboard'));
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const ParentDashboard = lazy(() => import('./components/ParentDashboard'));

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pkt, setPkt] = useState<PktTimeInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [liveSignal, setLiveSignal] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  // Sync Tailwind dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(res.notifications || []);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  // Restore session (Node cookie or Firebase Auth) & fetch server PKT time
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await auth.authStateReady().catch(() => undefined);
        if (auth.currentUser) {
          setBackendMode('firebase');
        } else {
          await detectBackendMode();
        }
        const health = await apiFetch<{ pkt: PktTimeInfo }>('/api/health');
        if (!cancelled && health?.pkt) setPkt(health.pkt);

        const me = await apiFetch<{ user: SessionUser; pkt: PktTimeInfo }>('/api/auth/me');
        if (!cancelled && me?.user) {
          setUser(me.user);
          if (me.pkt) setPkt(me.pkt);
          await fetchNotifications();
        }
      } catch {
        // Not signed in
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [fetchNotifications]);

  // Periodically resync PKT clock every 30s
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const health = await apiFetch<{ pkt: PktTimeInfo }>('/api/health');
        if (health?.pkt) setPkt(health.pkt);
      } catch {
        // Ignore transient network errors
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time WebSocket connection (live server) or static event bus (GitHub Pages)
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const handleRealtimeMessage = (event: string, payload: unknown) => {
      if (event === 'notification:new' && payload) {
        const incoming = payload as NotificationItem;
        setNotifications((prev) => {
          if (prev.some((p) => p.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        setToast(incoming);
        setLiveSignal((s) => s + 1);
        if (userRef.current?.soundAlerts !== false) {
          playNotificationChime();
        }
        if (userRef.current?.pushEnabled) {
          triggerBrowserPushNotification(incoming.title, incoming.message);
        }
      } else if (event === 'attendance:updated') {
        setLiveSignal((s) => s + 1);
      }
    };

    if (isFirebaseMode()) {
      return subscribeFirebaseEvents(handleRealtimeMessage);
    }
    if (isStaticMode()) {
      return subscribeStaticEvents(handleRealtimeMessage);
    }

    let closed = false;
    let reconnectTimer: number | undefined;

    function connect() {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getAuthToken();
      const wsUrl = `${proto}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleRealtimeMessage(msg.event, msg.payload);
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 3500);
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleLoginSuccess = async (loggedInUser: SessionUser) => {
    setUser(loggedInUser);
    await fetchNotifications();
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setAuthToken(null);
    setUser(null);
    setNotifications([]);
  };

  const handlePasswordChanged = () => {
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-600 dark:text-slate-300">
        Initializing Abdali Education Academy...
      </div>
    );
  }

  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-600 dark:text-slate-300">
            Loading Abdali Education Academy Portal...
          </div>
        }
      >
        {!user ? (
          <WelcomePage
            onLoginSuccess={handleLoginSuccess}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            pktTimeStr={pkt ? `${pkt.date} ${pkt.time}` : undefined}
          />
        ) : user.role === 'principal' ? (
          <PrincipalDashboard
            user={user}
            pkt={pkt}
            notifications={notifications}
            onRefreshNotifications={fetchNotifications}
            onLogout={handleLogout}
            onPasswordChanged={handlePasswordChanged}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            liveSignal={liveSignal}
          />
        ) : user.role === 'teacher' ? (
          <TeacherDashboard
            user={user}
            pkt={pkt}
            notifications={notifications}
            onRefreshNotifications={fetchNotifications}
            onLogout={handleLogout}
            onPasswordChanged={handlePasswordChanged}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            liveSignal={liveSignal}
          />
        ) : user.role === 'student' ? (
          <StudentDashboard
            user={user}
            pkt={pkt}
            notifications={notifications}
            onRefreshNotifications={fetchNotifications}
            onLogout={handleLogout}
            onPasswordChanged={handlePasswordChanged}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            liveSignal={liveSignal}
          />
        ) : (
          <ParentDashboard
            user={user}
            pkt={pkt}
            notifications={notifications}
            onRefreshNotifications={fetchNotifications}
            onLogout={handleLogout}
            onPasswordChanged={handlePasswordChanged}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            liveSignal={liveSignal}
          />
        )}
      </Suspense>

      {/* Real-Time Notification Toast */}
      {toast && (
        <div className="fixed bottom-18 lg:bottom-6 right-4 z-50 max-w-sm bg-[#0B1B3A] text-white border border-amber-400/50 rounded-xl shadow-2xl p-4 no-print">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-amber-400">{toast.title}</p>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
