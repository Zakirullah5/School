import React, { useState } from 'react';
import {
  Bell,
  Clock,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  CheckCheck,
  X,
  ShieldAlert,
  Menu,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { NotificationItem, PktTimeInfo, SessionUser } from '../types';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface DashboardShellProps {
  user: SessionUser;
  pkt: PktTimeInfo | null;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  notifications: NotificationItem[];
  onRefreshNotifications: () => void;
  onLogout: () => void;
  onPasswordChanged: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  user,
  pkt,
  navItems,
  activeTab,
  onSelectTab,
  notifications,
  onRefreshNotifications,
  onLogout,
  onPasswordChanged,
  darkMode,
  onToggleDarkMode,
  children,
}: DashboardShellProps) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(user.soundAlerts !== false);
  const [pushEnabled, setPushEnabled] = useState(Boolean(user.pushEnabled));

  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPass, setSavingPass] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Overview';

  const markRead = async (n: NotificationItem) => {
    if (!n.is_read) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null);
      onRefreshNotifications();
    }
    if (n.link_tab) {
      onSelectTab(n.link_tab);
      setNotifOpen(false);
    }
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' }).catch(() => null);
    onRefreshNotifications();
  };

  const toggleSound = async () => {
    const next = !soundAlerts;
    setSoundAlerts(next);
    await apiFetch('/api/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify({ soundAlerts: next, pushEnabled }),
    }).catch(() => null);
  };

  const enableBrowserPush = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    const granted = perm === 'granted';
    setPushEnabled(granted);
    await apiFetch('/api/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify({ soundAlerts, pushEnabled: granted }),
    }).catch(() => null);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setSavingPass(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: currPass, newPassword: newPass }),
      });
      setPassMsg({ type: 'ok', text: 'Password updated securely.' });
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
      onPasswordChanged();
    } catch (err) {
      setPassMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update password.' });
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[#0B1B3A] text-white border-r border-[#162C56] no-print">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <img
            src="/src/assets/images/academy_crest_emblem_1795627463223.jpg"
            alt="Abdali Crest"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-lg object-cover bg-white shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-tight text-white truncate font-display">
              ABDALI ACADEMY
            </p>
            <p className="text-[11px] text-amber-400 capitalize truncate">{user.role} Portal</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                      active ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-3 px-1">
            <img
              src={user.avatarUrl || '/src/assets/images/avatar_teacher_portrait_1795627465105.jpg'}
              alt={user.fullName}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] font-mono text-slate-400 truncate">{user.code || user.username}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSecurityOpen(true)}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Security
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        {/* Top Breadcrumb Bar */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 capitalize hidden sm:inline whitespace-nowrap">
                {user.role} Portal
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <span className="font-semibold text-[#0B1B3A] dark:text-white truncate">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {pkt && (
              <div className="hidden md:flex items-center gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{pkt.date} · {pkt.time} PKT</span>
              </div>
            )}

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Toggle Light or Dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Mandatory Security Warning Banner for Default Demo Principal Password */}
        {user.mustChangePassword && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Security Notice:</strong> You are signed in with the initial demo password. Update your password for production security.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSecurityOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              Update Password Now
            </button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (compact <= 56px, well within 15% mobile sticky cap) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-1 no-print">
        {navItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium min-w-[60px] ${
                active ? 'text-[#0B1B3A] dark:text-amber-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 flex">
          <div className="w-72 bg-[#0B1B3A] text-white h-full flex flex-col p-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <span className="font-display font-bold text-sm">ABDALI ACADEMY</span>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                      activeTab === item.id ? 'bg-amber-500 text-slate-950 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="pt-4 border-t border-white/10 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setSecurityOpen(true);
                }}
                className="flex-1 py-2 rounded-lg bg-white/10 text-xs font-medium"
              >
                Security
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-200 text-xs font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Real-Time Notifications Slide-Over */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">
                  Notifications Center
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {unreadCount} unread · Live WebSocket updates active
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSound}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {soundAlerts ? <Volume2 className="w-3.5 h-3.5 text-amber-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  <span>Sound: {soundAlerts ? 'On' : 'Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={enableBrowserPush}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Push: {pushEnabled ? 'Enabled' : 'Enable'}
                </button>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[#0B1B3A] dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n)}
                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                      n.is_read ? 'opacity-75' : 'bg-amber-50/40 dark:bg-amber-950/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#0B1B3A] dark:text-white">
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-1.5">
                      {n.message}
                    </p>
                    <span className="text-[11px] font-mono text-slate-400">{n.created_at}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Security & Password Change Modal */}
      {securityOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-base">Account Security & Password</h3>
              <button type="button" onClick={() => setSecurityOpen(false)} className="text-slate-300 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              {passMsg && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium border ${
                    passMsg.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                  }`}
                >
                  {passMsg.text}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currPass}
                  onChange={(e) => setCurrPass(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSecurityOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingPass}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  {savingPass ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
