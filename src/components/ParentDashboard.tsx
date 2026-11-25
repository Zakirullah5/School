import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  CalendarCheck,
  BookOpen,
  Award,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import DashboardShell, { type NavItem } from './DashboardShell';
import { apiFetch } from '../lib/api';
import type { NotificationItem, PktTimeInfo, SessionUser, StudentFullProfile } from '../types';

interface ParentDashboardProps {
  user: SessionUser;
  pkt: PktTimeInfo | null;
  notifications: NotificationItem[];
  onRefreshNotifications: () => void;
  onLogout: () => void;
  onPasswordChanged: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  liveSignal: number;
}

export default function ParentDashboard({
  user,
  pkt,
  notifications,
  onRefreshNotifications,
  onLogout,
  onPasswordChanged,
  darkMode,
  onToggleDarkMode,
  liveSignal,
}: ParentDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [childrenData, setChildrenData] = useState<Array<StudentFullProfile & { todayAttendance: any; upcomingTests: any[] }>>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [serverPkt, setServerPkt] = useState<PktTimeInfo | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    const [dash, ann] = await Promise.all([
      apiFetch('/api/parent/dashboard'),
      apiFetch('/api/announcements'),
    ]);
    setChildrenData(dash.children || []);
    setServerPkt(dash.pkt);
    setAnnouncements(ann.announcements || []);
  }, []);

  useEffect(() => {
    loadData().catch(() => null);
  }, [loadData, liveSignal]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Child Overview', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'homework', label: 'Homework', icon: BookOpen },
    { id: 'tests', label: 'Test Results', icon: Award },
    { id: 'fees', label: 'Fee & Notices', icon: CreditCard },
  ];

  const child = childrenData[selectedIdx];
  const st = child?.student;
  const overall = child?.attendanceAnalytics?.overall;

  return (
    <DashboardShell
      user={user}
      pkt={serverPkt || pkt}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      notifications={notifications}
      onRefreshNotifications={onRefreshNotifications}
      onLogout={onLogout}
      onPasswordChanged={onPasswordChanged}
      darkMode={darkMode}
      onToggleDarkMode={onToggleDarkMode}
    >
      {!child || !st ? (
        <div className="py-20 text-center text-sm text-slate-500">Loading your child’s academic dashboard...</div>
      ) : (
        <div className="space-y-6">
          {childrenData.length > 1 && (
            <div className="flex items-center gap-2">
              {childrenData.map((c, idx) => (
                <button
                  key={c.student.id}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    idx === selectedIdx
                      ? 'bg-[#0B1B3A] text-white dark:bg-amber-500 dark:text-slate-950'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {c.student.full_name} (Class {c.student.class_name})
                </button>
              ))}
            </div>
          )}

          {activeTab === 'overview' && (
            <>
              {/* Live Attendance Status Banner */}
              <div className="bg-[#0B1B3A] text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={st.photo_url || '/src/assets/images/avatar_student_male_1795627463854.jpg'}
                    alt={st.full_name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-mono text-amber-300">
                      {st.student_code} · Class {st.class_name} ({st.section}) · Roll #{st.roll_number}
                    </p>
                    <h1 className="text-2xl font-bold font-display">{st.full_name}</h1>
                    <p className="text-sm text-slate-200 mt-1">
                      {child.todayAttendance
                        ? `Your child ${st.full_name} is ${String(child.todayAttendance.status).toUpperCase()} today.`
                        : `Today’s attendance for ${st.full_name} has not been submitted yet.`}
                    </p>
                  </div>
                </div>
                <div className="px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-xs">
                  <span className="text-slate-300 block">Today’s Live Status</span>
                  <span className="text-base font-bold font-mono text-amber-300">
                    {child.todayAttendance ? String(child.todayAttendance.status).toUpperCase() : 'PENDING'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Attendance %', val: `${overall?.percentage ?? 0}%` },
                  { label: 'Total Present Days', val: overall?.presentDays ?? 0 },
                  { label: 'Total Absent Days', val: overall?.absentDays ?? 0 },
                  { label: 'Monthly Average', val: `${child.attendanceAnalytics.monthly.percentage}%` },
                  { label: 'Yearly Average', val: `${child.attendanceAnalytics.yearly.percentage}%` },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-[#0B1B3A] dark:text-white mt-1">{kpi.val}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="font-display font-bold text-base mb-3">Recent Homework</h2>
                  {child.homeworkHistory.slice(0, 4).map((h) => (
                    <div key={h.id} className="py-2.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-amber-700 dark:text-amber-400">{h.subject}</span>
                        <span className="font-mono text-slate-500">Due {h.due_date}</span>
                      </div>
                      <p className="text-sm font-medium mt-0.5">{h.title}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="font-display font-bold text-base mb-3">School Announcements</h2>
                  <div className="space-y-3">
                    {announcements.slice(0, 3).map((a) => (
                      <div key={a.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                        <p className="text-xs font-semibold text-[#0B1B3A] dark:text-amber-300">{a.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{a.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
                <h2 className="font-display font-bold text-base mb-3">Monthly Attendance Trend</h2>
                <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={child.attendanceAnalytics.monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="percentage" stroke="#0B1B3A" fill="#D9A738" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Recorded At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {child.attendanceRecords.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono">{r.date}</td>
                        <td className="py-2.5 px-4 font-semibold">{r.status}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">{r.marked_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'homework' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {child.homeworkHistory.map((h) => (
                <div key={h.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{h.subject}</span>
                    <span className="font-mono text-slate-500">Due {h.due_date}</span>
                  </div>
                  <h3 className="font-display font-bold text-base">{h.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{h.description}</p>
                  {h.attachment_url && (
                    <a
                      href={h.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline pt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {h.attachment_name || 'Download Attachment'}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base mb-3">Upcoming Tests</h2>
                {child.upcomingTests.length === 0 ? (
                  <p className="text-xs text-slate-500">No upcoming tests scheduled.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {child.upcomingTests.map((t) => (
                      <div key={t.id} className="py-2.5 flex justify-between text-xs">
                        <div>
                          <p className="font-semibold text-sm">{t.title} ({t.subject})</p>
                          <p className="text-slate-500">Syllabus: {t.syllabus}</p>
                        </div>
                        <span className="font-mono text-amber-700 dark:text-amber-400">{t.test_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="font-display font-bold text-base">Test & Examination Results</h2>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                      <th className="py-3 px-4">Test</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4 text-right">Marks</th>
                      <th className="py-3 px-4 text-right">%</th>
                      <th className="py-3 px-4">Grade</th>
                      <th className="py-3 px-4 text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {child.testResults.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4 font-semibold">{r.test_title}</td>
                        <td className="py-3 px-4">{r.subject}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {r.obtained_marks}/{r.total_marks}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.percentage}%</td>
                        <td className="py-3 px-4 font-semibold">{r.grade}</td>
                        <td className="py-3 px-4 text-right font-mono">
                          #{r.class_position}/{r.total_appeared}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base mb-4">Monthly Fee Records</h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {child.fees.map((f) => (
                    <div key={f.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{f.month} {f.year}</p>
                        <p className="text-slate-500 font-mono">PKR {f.amount.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold ${f.status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {f.status}
                        </span>
                        {f.receipt_no && <p className="font-mono text-[11px] text-slate-400">{f.receipt_no}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base mb-4">School Notices</h2>
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <div key={a.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-semibold text-[#0B1B3A] dark:text-amber-300">{a.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{a.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
