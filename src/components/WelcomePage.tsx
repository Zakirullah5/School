import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  GraduationCap,
  BookOpenCheck,
  Users,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  Clock,
  Sun,
  Moon,
  X,
} from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api';
import type { SessionUser, UserRole } from '../types';

interface WelcomePageProps {
  onLoginSuccess: (user: SessionUser) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  pktTimeStr?: string;
}

const PORTALS: Array<{
  role: UserRole;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  demoId: string;
  demoPass: string;
  placeholder: string;
}> = [
  {
    role: 'principal',
    title: 'Principal Login',
    subtitle: 'Executive & Administration',
    description: 'Manage classes, faculty, attendance audits, correction approvals, and school-wide analytics.',
    icon: ShieldCheck,
    demoId: 'Ali',
    demoPass: 'Ali',
    placeholder: 'Principal ID or Username (e.g. Ali)',
  },
  {
    role: 'teacher',
    title: 'Teacher Login',
    subtitle: 'Class Faculty Portal',
    description: 'Mark PKT-verified daily attendance, register students, assign homework, and grade tests.',
    icon: BookOpenCheck,
    demoId: 'teacher.fatima',
    demoPass: 'Teacher@123',
    placeholder: 'Teacher ID or Username (e.g. teacher.fatima)',
  },
  {
    role: 'student',
    title: 'Student Login',
    subtitle: 'Personal Academic Hub',
    description: 'Track personal attendance, view homework assignments, upcoming tests, and class rankings.',
    icon: GraduationCap,
    demoId: 'ahmad.khan',
    demoPass: 'Student@123',
    placeholder: 'Student ID or Username (e.g. AEA-2026-0501)',
  },
  {
    role: 'parent',
    title: 'Parent Login',
    subtitle: 'Guardian Live Monitoring',
    description: 'Receive real-time daily attendance alerts, review child report cards, and track fee status.',
    icon: Users,
    demoId: 'parent.tariq',
    demoPass: 'Parent@123',
    placeholder: 'Parent ID or Username (e.g. parent.tariq)',
  },
];

export default function WelcomePage({
  onLoginSuccess,
  darkMode,
  onToggleDarkMode,
  pktTimeStr,
}: WelcomePageProps) {
  const [selectedPortal, setSelectedPortal] = useState<(typeof PORTALS)[number] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [crestFailed, setCrestFailed] = useState(false);

  const openPortal = (portal: (typeof PORTALS)[number]) => {
    setSelectedPortal(portal);
    setUsername('');
    setPassword('');
    setError(null);
    setShowPassword(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPortal) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ token: string; user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password,
          portalRole: selectedPortal.role,
        }),
      });
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please verify your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = () => {
    if (!selectedPortal) return;
    setUsername(selectedPortal.demoId);
    setPassword(selectedPortal.demoPass);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: Exactly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#overview"
            className="text-lg font-bold tracking-tight text-[#0B1B3A] dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            Abdali Education Academy
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#overview" className="hover:text-[#0B1B3A] dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Overview
            </a>
            <a href="#portals" className="hover:text-[#0B1B3A] dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Portals
            </a>
            <a href="#capabilities" className="hover:text-[#0B1B3A] dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Modules
            </a>
            <a href="#governance" className="hover:text-[#0B1B3A] dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0">
              Governance
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openPortal(PORTALS[0])}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1B3A] hover:bg-[#132955] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Portal Sign In
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="overview" className="max-w-7xl mx-auto px-6 pt-10 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-6 flex flex-col justify-between bg-[#0B1B3A] text-white rounded-2xl p-8 lg:p-10 border border-[#193261]"
          >
            <div>
              <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-amber-400/50 shrink-0 flex items-center justify-center">
                    {!crestFailed ? (
                      <img
                        src="/src/assets/images/academy_crest_emblem_1795627463223.jpg"
                        alt="Abdali Education Academy Crest"
                        referrerPolicy="no-referrer"
                        onError={() => setCrestFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <GraduationCap className="w-7 h-7 text-[#0B1B3A]" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium tracking-wider text-amber-400">
                      Academic Session 2026–2027
                    </p>
                    <p className="text-sm text-slate-300">Islamabad Campus · Smart Management</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  aria-label="Toggle Light or Dark theme"
                  className="p-2.5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>

              <h1
                className="font-display font-bold tracking-tight text-white mb-5"
                style={{ fontSize: 'clamp(2.15rem, 3.6vw, 3.35rem)', lineHeight: 1.12, textWrap: 'balance' }}
              >
                ABDALI EDUCATION ACADEMY
              </h1>

              <p className="text-slate-300 text-base leading-relaxed max-w-xl mb-8">
                Unified campus intelligence for Principals, Faculty, Students, and Parents. Server-verified PKT attendance governance, immutable student records, live parent notifications, and academic analytics in one system.
              </p>
            </div>

            <div className="space-y-5 pt-6 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300 font-mono tabular-nums">
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  PKT Clock: {pktTimeStr || 'Asia/Karachi'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Attendance Window: 08:00 – 11:59 PKT</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#portals"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                >
                  Select Your Portal
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => openPortal(PORTALS[0])}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/20 hover:bg-white/10 text-white font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Principal Console
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 }}
            className="lg:col-span-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[340px] relative"
          >
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/academy_campus_hero_1795627464044.jpg"
                alt="Abdali Education Academy Campus"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full lg:h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0B1B3A] via-[#132955] to-slate-900 flex items-center justify-center p-10">
                <GraduationCap className="w-20 h-20 text-amber-400/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1B3A]/90 via-[#0B1B3A]/20 to-transparent flex flex-col justify-end p-8">
              <p className="text-xs font-medium text-amber-300 mb-1">
                Verified Institutional Architecture
              </p>
              <p className="text-white text-lg font-semibold leading-snug max-w-md">
                Discipline, Academic Precision, and Real-Time Transparency Across Every Classroom.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Four Portal Access Strip */}
      <section id="portals" className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
              Role-Based Access Portals
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-[#0B1B3A] dark:text-white">
              Sign in to Your Academy Portal
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
            Each portal enforces strict server-side authorization and isolates records by role, assigned class, or linked child.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PORTALS.map((portal, idx) => {
            const Icon = portal.icon;
            return (
              <motion.button
                key={portal.role}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
                onClick={() => openPortal(portal)}
                className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#0B1B3A] dark:hover:border-amber-400 rounded-xl p-6 transition-all flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-11 h-11 rounded-lg bg-[#0B1B3A] dark:bg-slate-800 text-amber-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#0B1B3A] dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {portal.subtitle}
                  </p>
                  <h3 className="text-lg font-bold font-display text-[#0B1B3A] dark:text-white mb-2">
                    {portal.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                    {portal.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-[#0B1B3A] dark:text-amber-400">
                  <span>Open Login Interface</span>
                  <Lock className="w-3.5 h-3.5" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Core Capabilities */}
      <section id="capabilities" className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200 dark:border-slate-800">
        <div className="mb-8">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
            Integrated School Operations
          </p>
          <h2 className="text-2xl font-bold font-display text-[#0B1B3A] dark:text-white">
            Core Platform Modules
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="font-display font-semibold text-base text-[#0B1B3A] dark:text-white mb-2">
              01. PKT-Verified Smart Attendance
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Server-enforced 08:00 AM to 11:59 AM Pakistan Standard Time submission window, automatic post-submission lock, Principal correction workflow, and immutable audit trails.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="font-display font-semibold text-base text-[#0B1B3A] dark:text-white mb-2">
              02. Real-Time Parent & Principal Alerts
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              WebSocket-powered live notifications dispatch immediately when attendance is submitted, homework is published, test results are posted, or announcements are issued.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <h3 className="font-display font-semibold text-base text-[#0B1B3A] dark:text-white mb-2">
              03. Student Analytics & PDF/Excel Reports
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Separate Attendance and Academic rankings, 13-section student profiles, downloadable Official Student ID Cards, PDF attendance registers, and Excel exports.
            </p>
          </div>
        </div>
      </section>

      {/* Governance & Security */}
      <section id="governance" className="max-w-7xl mx-auto px-6 py-10 mb-8">
        <div className="bg-[#0B1B3A] text-white rounded-2xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold font-display mb-2">
              Strict Role-Based Security & Immutable Record Protection
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Student IDs cannot be altered once assigned, teachers cannot permanently delete student records, and every attendance modification requires Principal approval with full audit logging.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPortal(PORTALS[0])}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            Enter Administration
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© 2026 Abdali Education Academy. All rights reserved.</span>
          <span>Academic Session 2026–2027 · Pakistan Standard Time (UTC+5)</span>
        </div>
      </footer>

      {/* Role-Specific Secure Login Modal */}
      {selectedPortal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="bg-[#0B1B3A] px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center">
                  <selectedPortal.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-amber-300 font-medium">{selectedPortal.subtitle}</p>
                  <h3 className="text-lg font-bold font-display">{selectedPortal.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPortal(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer"
                aria-label="Close login modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Account ID or Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={selectedPortal.placeholder}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B1B3A] hover:bg-[#132955] dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-semibold text-sm transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Verifying Credentials...' : `Sign In to ${selectedPortal.title}`}
              </button>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Demo: <code className="font-mono text-slate-700 dark:text-slate-200">{selectedPortal.demoId}</code> /{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-200">{selectedPortal.demoPass}</code>
                </span>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Fill Demo
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
