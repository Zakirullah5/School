import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  CalendarCheck,
  BookOpen,
  Award,
  CalendarDays,
  Download,
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
import { apiFetch, resolveAssetUrl } from '../lib/api';
import { exportStudentIdCardPdf } from '../lib/exports';
import type { NotificationItem, PktTimeInfo, SessionUser, StudentFullProfile } from '../types';

interface StudentDashboardProps {
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

export default function StudentDashboard({
  user,
  pkt,
  notifications,
  onRefreshNotifications,
  onLogout,
  onPasswordChanged,
  darkMode,
  onToggleDarkMode,
  liveSignal,
}: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState<(StudentFullProfile & { pkt: PktTimeInfo; todayAttendance: any; upcomingTests: any[] }) | null>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    const [dash, tt, hol, ann] = await Promise.all([
      apiFetch('/api/student/dashboard'),
      apiFetch('/api/timetable'),
      apiFetch('/api/holidays'),
      apiFetch('/api/announcements'),
    ]);
    setData(dash);
    setTimetable(tt.timetable || []);
    setHolidays(hol.holidays || []);
    setAnnouncements(ann.announcements || []);
  }, []);

  useEffect(() => {
    loadData().catch(() => null);
  }, [loadData, liveSignal]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'My Dashboard', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'homework', label: 'Homework', icon: BookOpen },
    { id: 'tests', label: 'Tests & Results', icon: Award },
    { id: 'schedule', label: 'Timetable', icon: CalendarDays },
  ];

  const st = data?.student;
  const overall = data?.attendanceAnalytics?.overall;

  return (
    <DashboardShell
      user={user}
      pkt={data?.pkt || pkt}
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
      {!data || !st ? (
        <div className="py-20 text-center text-sm text-slate-500">Loading your personal academic portal...</div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-[#0B1B3A] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={resolveAssetUrl(st.photo_url)}
                    alt={st.full_name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400 shrink-0"
                  />
                  <div>
                    <p className="text-xs font-mono text-amber-300">
                      {st.student_code} · Class {st.class_name} ({st.section}) · Roll #{st.roll_number}
                    </p>
                    <h1 className="text-2xl font-bold font-display">Welcome, {st.full_name}</h1>
                    <p className="text-xs text-slate-300 mt-1">
                      Today’s Attendance:{' '}
                      <span className="font-semibold text-amber-300">
                        {data.todayAttendance ? data.todayAttendance.status : 'Pending Submission'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => exportStudentIdCardPdf(st)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Student ID Card
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Attendance Average', val: `${overall?.percentage ?? 0}%` },
                  { label: 'Present Days', val: overall?.presentDays ?? 0 },
                  { label: 'Absent Days', val: overall?.absentDays ?? 0 },
                  { label: 'Monthly Average', val: `${data.attendanceAnalytics.monthly.percentage}%` },
                  { label: 'Yearly Average', val: `${data.attendanceAnalytics.yearly.percentage}%` },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-[#0B1B3A] dark:text-white mt-1">{kpi.val}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
                    Recent Homework
                  </h2>
                  {data.homeworkHistory.slice(0, 4).map((h) => (
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
                  <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
                    School Announcements
                  </h2>
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
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
                <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                  Monthly Attendance Analytics
                </h2>
                <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={data.attendanceAnalytics.monthlySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="percentage" stroke="#0B1B3A" fill="#D9A738" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-left">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Marked At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.attendanceRecords.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono text-xs">{r.date}</td>
                        <td className="py-2.5 px-4 text-xs font-semibold">{r.status}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{r.marked_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'homework' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.homeworkHistory.map((h) => (
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
                      Download {h.attachment_name || 'Attachment'}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                  Upcoming Tests
                </h2>
                {data.upcomingTests.length === 0 ? (
                  <p className="text-xs text-slate-500">No upcoming tests scheduled.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.upcomingTests.map((t) => (
                      <div key={t.id} className="py-3 flex justify-between text-xs">
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
                  <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">
                    My Test Results
                  </h2>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                      <th className="py-3 px-4">Test</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4 text-right">Marks</th>
                      <th className="py-3 px-4 text-right">%</th>
                      <th className="py-3 px-4">Grade</th>
                      <th className="py-3 px-4 text-right">Class Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.testResults.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4 font-semibold">{r.test_title}</td>
                        <td className="py-3 px-4">{r.subject}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {r.obtained_marks}/{r.total_marks}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.percentage}%</td>
                        <td className="py-3 px-4 font-semibold">{r.grade}</td>
                        <td className="py-3 px-4 text-right font-mono">
                          #{r.class_position} of {r.total_appeared}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base mb-4">Class Timetable</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                      <th className="py-2">Day</th>
                      <th className="py-2">Time</th>
                      <th className="py-2">Subject</th>
                      <th className="py-2">Teacher</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {timetable.map((slot) => (
                      <tr key={slot.id}>
                        <td className="py-2 font-medium">{slot.day_of_week}</td>
                        <td className="py-2 font-mono">{slot.start_time} – {slot.end_time}</td>
                        <td className="py-2 font-semibold">{slot.subject}</td>
                        <td className="py-2 text-slate-500">{slot.teacher_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <h2 className="font-display font-bold text-base mb-4">School Holidays</h2>
                <div className="space-y-3">
                  {holidays.map((h) => (
                    <div key={h.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                      <p className="text-xs font-mono text-amber-700 dark:text-amber-400">{h.date}</p>
                      <p className="text-sm font-semibold">{h.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
