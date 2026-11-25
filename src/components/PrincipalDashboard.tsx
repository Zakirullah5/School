import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Building2,
  UserCog,
  ClipboardList,
  ShieldAlert,
  GraduationCap,
  BarChart3,
  Megaphone,
  Settings,
  Download,
  Printer,
  FileSpreadsheet,
  Search,
  Plus,
  Check,
  X,
  Database,
  KeyRound,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import DashboardShell, { type NavItem } from './DashboardShell';
import StudentProfileModal from './StudentProfileModal';
import { apiFetch, getAuthToken } from '../lib/api';
import { exportAnalyticsReportPdf, exportAttendanceExcel, exportAttendancePdf } from '../lib/exports';
import type { NotificationItem, PktTimeInfo, SessionUser, StudentFullProfile } from '../types';

interface PrincipalDashboardProps {
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

export default function PrincipalDashboard({
  user,
  pkt,
  notifications,
  onRefreshNotifications,
  onLogout,
  onPasswordChanged,
  darkMode,
  onToggleDarkMode,
  liveSignal,
}: PrincipalDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [teacherAttDate, setTeacherAttDate] = useState('');
  const [teacherAttRows, setTeacherAttRows] = useState<any[]>([]);

  // Attendance Monitoring filters
  const [attFilter, setAttFilter] = useState({ date: '', month: '', year: '', classId: '', search: '' });
  const [attMonitor, setAttMonitor] = useState<any>(null);

  const [corrections, setCorrections] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [promoteTargetClassId, setPromoteTargetClassId] = useState('');

  const [analyticsFilter, setAnalyticsFilter] = useState({ classId: '', month: '', year: '', subject: '' });
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const [selectedProfile, setSelectedProfile] = useState<StudentFullProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Forms & Modals
  const [classModal, setClassModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });
  const [classForm, setClassForm] = useState({ classCode: '', name: '', section: 'A', roomNumber: '', teacherId: '' });
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', classId: '' });

  const [teacherModal, setTeacherModal] = useState<{ open: boolean; editing: any }>({ open: false, editing: null });
  const [teacherForm, setTeacherForm] = useState({
    fullName: '',
    username: '',
    password: '',
    subjectSpecialty: '',
    phone: '',
    qualification: '',
    classId: '',
  });
  const [resetTeacherModal, setResetTeacherModal] = useState<any>(null);
  const [resetPassValue, setResetPassValue] = useState('');

  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', targetRole: 'all', priority: 'normal' });
  const [holidayForm, setHolidayForm] = useState({ date: '', title: '', description: '' });
  const [sessionForm, setSessionForm] = useState({ name: '', startDate: '', endDate: '' });

  const loadOverviewAndCore = useCallback(async () => {
    const [ov, cls, sub, tch, corr, logs, ann, hol, tt, fe, sess, sett] = await Promise.all([
      apiFetch('/api/principal/overview'),
      apiFetch('/api/principal/classes'),
      apiFetch('/api/principal/subjects'),
      apiFetch('/api/principal/teachers'),
      apiFetch('/api/principal/correction-requests'),
      apiFetch('/api/principal/audit-logs'),
      apiFetch('/api/announcements'),
      apiFetch('/api/holidays'),
      apiFetch('/api/timetable'),
      apiFetch('/api/principal/fees'),
      apiFetch('/api/principal/sessions'),
      apiFetch('/api/principal/settings'),
    ]);
    setOverview(ov);
    setClasses(cls.classes || []);
    setSubjects(sub.subjects || []);
    setTeachers(tch.teachers || []);
    setCorrections(corr.requests || []);
    setAuditLogs(logs.logs || []);
    setAnnouncements(ann.announcements || []);
    setHolidays(hol.holidays || []);
    setTimetable(tt.timetable || []);
    setFees(fe.fees || []);
    setSessions(sess.sessions || []);
    setSettings(sett.settings || {});
    if (!teacherAttDate && ov?.pkt?.date) setTeacherAttDate(ov.pkt.date);
    if (!attFilter.date && !attFilter.month && !attFilter.year && ov?.pkt?.date) {
      setAttFilter((prev) => ({ ...prev, date: ov.pkt.date }));
    }
  }, [teacherAttDate, attFilter.date, attFilter.month, attFilter.year]);

  const loadTeacherAttendance = useCallback(async () => {
    if (!teacherAttDate) return;
    const res = await apiFetch(`/api/principal/teacher-attendance?date=${teacherAttDate}`);
    setTeacherAttRows(
      (res.records || []).map((r: any) => ({
        ...r,
        status: r.status || 'Present',
        check_in_time: r.check_in_time || '07:50 AM',
      }))
    );
  }, [teacherAttDate]);

  const loadAttendanceMonitor = useCallback(async () => {
    const params = new URLSearchParams();
    if (attFilter.month) params.set('month', attFilter.month);
    else if (attFilter.year) params.set('year', attFilter.year);
    else if (attFilter.date) params.set('date', attFilter.date);
    if (attFilter.classId) params.set('classId', attFilter.classId);
    if (attFilter.search) params.set('search', attFilter.search);
    const res = await apiFetch(`/api/principal/attendance?${params.toString()}`);
    setAttMonitor(res);
  }, [attFilter]);

  const loadStudents = useCallback(async () => {
    const params = new URLSearchParams();
    if (studentClassFilter) params.set('classId', studentClassFilter);
    if (studentSearch) params.set('search', studentSearch);
    const res = await apiFetch(`/api/principal/students?${params.toString()}`);
    setStudents(res.students || []);
  }, [studentClassFilter, studentSearch]);

  const loadAnalytics = useCallback(async () => {
    const params = new URLSearchParams();
    if (analyticsFilter.classId) params.set('classId', analyticsFilter.classId);
    if (analyticsFilter.month) params.set('month', analyticsFilter.month);
    if (analyticsFilter.year) params.set('year', analyticsFilter.year);
    if (analyticsFilter.subject) params.set('subject', analyticsFilter.subject);
    const res = await apiFetch(`/api/principal/analytics?${params.toString()}`);
    setAnalyticsData(res);
  }, [analyticsFilter]);

  useEffect(() => {
    loadOverviewAndCore().catch(() => null);
  }, [loadOverviewAndCore, liveSignal]);

  useEffect(() => {
    loadTeacherAttendance().catch(() => null);
  }, [loadTeacherAttendance]);

  useEffect(() => {
    loadAttendanceMonitor().catch(() => null);
  }, [loadAttendanceMonitor, liveSignal]);

  useEffect(() => {
    loadStudents().catch(() => null);
  }, [loadStudents]);

  useEffect(() => {
    loadAnalytics().catch(() => null);
  }, [loadAnalytics, liveSignal]);

  const openProfile = async (studentId: number) => {
    setProfileLoading(true);
    setSelectedProfile(null);
    try {
      const profile = await apiFetch<StudentFullProfile>(`/api/principal/students/${studentId}`);
      setSelectedProfile(profile);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  // Class CRUD
  const saveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (classModal.editing) {
        await apiFetch(`/api/principal/classes/${classModal.editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(classForm),
        });
        setFeedback({ type: 'ok', text: `Updated class ${classForm.name}.` });
      } else {
        await apiFetch('/api/principal/classes', {
          method: 'POST',
          body: JSON.stringify(classForm),
        });
        setFeedback({ type: 'ok', text: `Created class ${classForm.name} (${classForm.classCode}).` });
      }
      setClassModal({ open: false, editing: null });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save class.' });
    }
  };

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/principal/subjects', {
        method: 'POST',
        body: JSON.stringify(subjectForm),
      });
      setSubjectForm({ code: '', name: '', classId: '' });
      setFeedback({ type: 'ok', text: 'Subject added to class.' });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to add subject.' });
    }
  };

  // Teacher CRUD
  const saveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (teacherModal.editing) {
        await apiFetch(`/api/principal/teachers/${teacherModal.editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(teacherForm),
        });
        setFeedback({ type: 'ok', text: `Updated teacher ${teacherForm.fullName}.` });
      } else {
        const res = await apiFetch<{ teacherCode: string }>('/api/principal/teachers', {
          method: 'POST',
          body: JSON.stringify(teacherForm),
        });
        setFeedback({ type: 'ok', text: `Teacher account created with unique ID ${res.teacherCode}.` });
      }
      setTeacherModal({ open: false, editing: null });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save teacher.' });
    }
  };

  const toggleTeacherStatus = async (teacherId: number) => {
    await apiFetch(`/api/principal/teachers/${teacherId}/toggle-status`, { method: 'POST' });
    await loadOverviewAndCore();
  };

  const resetTeacherPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTeacherModal) return;
    try {
      await apiFetch(`/api/principal/teachers/${resetTeacherModal.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPassValue }),
      });
      setResetTeacherModal(null);
      setResetPassValue('');
      setFeedback({ type: 'ok', text: 'Teacher password reset successfully.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Password reset failed.' });
    }
  };

  const saveTeacherAttendance = async () => {
    try {
      await apiFetch('/api/principal/teacher-attendance', {
        method: 'POST',
        body: JSON.stringify({
          date: teacherAttDate,
          records: teacherAttRows.map((r) => ({
            teacherId: r.teacher_id,
            status: r.status,
            checkInTime: r.check_in_time,
          })),
        }),
      });
      setFeedback({ type: 'ok', text: `Faculty attendance saved for ${teacherAttDate}.` });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save faculty attendance.' });
    }
  };

  const reviewCorrection = async (id: number, decision: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/api/principal/correction-requests/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, reviewNotes: `Reviewed by Principal (${decision})` }),
      });
      setFeedback({ type: 'ok', text: `Correction request ${decision} and recorded in immutable audit log.` });
      await Promise.all([loadOverviewAndCore(), loadAttendanceMonitor()]);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Review failed.' });
    }
  };

  const promoteStudents = async () => {
    if (!promoteTargetClassId || selectedStudentIds.length === 0) return;
    try {
      await apiFetch('/api/principal/students/promote', {
        method: 'POST',
        body: JSON.stringify({ studentIds: selectedStudentIds, targetClassId: Number(promoteTargetClassId) }),
      });
      setSelectedStudentIds([]);
      setFeedback({ type: 'ok', text: 'Selected students promoted to next class.' });
      await Promise.all([loadStudents(), loadOverviewAndCore()]);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Promotion failed.' });
    }
  };

  const publishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/principal/announcements', {
        method: 'POST',
        body: JSON.stringify(announcementForm),
      });
      setAnnouncementForm({ title: '', content: '', targetRole: 'all', priority: 'normal' });
      setFeedback({ type: 'ok', text: 'Announcement published and real-time notifications dispatched.' });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to publish announcement.' });
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/principal/holidays', {
        method: 'POST',
        body: JSON.stringify(holidayForm),
      });
      setHolidayForm({ date: '', title: '', description: '' });
      await loadOverviewAndCore();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to add holiday.' });
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/principal/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setFeedback({ type: 'ok', text: 'School settings updated.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save settings.' });
    }
  };

  const pendingCorrCount = overview?.kpis?.pendingCorrectionsCount || 0;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'classes', label: 'Classes & Subjects', icon: Building2 },
    { id: 'teachers', label: 'Teachers', icon: UserCog },
    { id: 'attendance', label: 'Attendance Monitor', icon: ClipboardList },
    { id: 'corrections', label: 'Corrections & Audit', icon: ShieldAlert, badge: pendingCorrCount },
    { id: 'students', label: 'Students', icon: GraduationCap },
    { id: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'operations', label: 'Campus & Fees', icon: Megaphone },
    { id: 'settings', label: 'Settings & Backup', icon: Settings },
  ];

  const kpis = overview?.kpis;

  return (
    <DashboardShell
      user={user}
      pkt={overview?.pkt || pkt}
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
      {feedback && (
        <div
          className={`mb-5 p-3.5 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 no-print ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Students', val: kpis?.totalStudents ?? 0 },
              { label: 'Total Teachers', val: kpis?.totalTeachers ?? 0 },
              { label: 'Total Classes', val: kpis?.totalClasses ?? 0 },
              { label: 'Today’s Present', val: kpis?.todayPresent ?? 0 },
              { label: 'Today’s Absent', val: kpis?.todayAbsent ?? 0 },
              { label: 'Overall Attendance %', val: `${kpis?.overallAttendancePct ?? 0}%` },
              { label: 'Teachers Present Today', val: kpis?.teachersPresentToday ?? 0 },
              { label: 'Teachers Absent Today', val: kpis?.teachersAbsentToday ?? 0 },
              { label: 'Pending Submissions', val: kpis?.pendingSubmissionsCount ?? 0 },
              { label: 'Pending Corrections', val: kpis?.pendingCorrectionsCount ?? 0 },
            ].map((k) => (
              <div key={k.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#0B1B3A] dark:text-white mt-1">{k.val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                Monthly Attendance Overview (%)
              </h2>
              <ResponsiveContainer width="100%" height="84%">
                <AreaChart data={overview?.monthlyOverview || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="rate" stroke="#0B1B3A" fill="#D9A738" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                Class-wise Attendance Comparison (%)
              </h2>
              <ResponsiveContainer width="100%" height="84%">
                <BarChart data={overview?.classComparison || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="percentage" fill="#0B1B3A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                Today’s Pending Attendance Submissions
              </h2>
              {(overview?.pendingSubmissions || []).length === 0 ? (
                <p className="text-xs text-emerald-600 font-semibold py-4">All classes have submitted today’s attendance.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {overview.pendingSubmissions.map((c: any) => (
                    <div key={c.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">Class {c.name} ({c.class_code})</p>
                        <p className="text-slate-500">Teacher: {c.teacher_name || 'Unassigned'} · {c.student_count} students</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttFilter((p) => ({ ...p, classId: String(c.id) }));
                          setActiveTab('attendance');
                        }}
                        className="font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        Inspect Register
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
                Recent Real-Time Notifications
              </h2>
              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
                    <p className="font-semibold text-[#0B1B3A] dark:text-amber-300">{n.title}</p>
                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLASSES & SUBJECTS */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold font-display">Classes & Curriculum Management</h1>
            <button
              type="button"
              onClick={() => {
                setClassForm({ classCode: '', name: '', section: 'A', roomNumber: '', teacherId: '' });
                setClassModal({ open: true, editing: null });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create New Class
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((c) => (
              <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-mono text-amber-700 dark:text-amber-400">{c.class_code}</p>
                    <h3 className="font-display font-bold text-lg">
                      Class {c.name} ({c.section})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClassForm({
                        classCode: c.class_code,
                        name: c.name,
                        section: c.section,
                        roomNumber: c.room_number || '',
                        teacherId: c.teacher_id ? String(c.teacher_id) : '',
                      });
                      setClassModal({ open: true, editing: c });
                    }}
                    className="text-xs font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p>Class Teacher: <span className="font-medium text-slate-900 dark:text-white">{c.teacher_name || 'Unassigned'}</span></p>
                  <p>Students: <span className="font-mono font-semibold">{c.student_count}</span> · Room: {c.room_number || '—'}</p>
                  <p>
                    Attendance Avg: <span className="font-mono font-semibold text-emerald-600">{c.attendancePercentage}%</span> ·
                    Academic Avg: <span className="font-mono font-semibold">{c.academicAverage}%</span>
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStudentClassFilter(String(c.id));
                      setActiveTab('students');
                    }}
                    className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    View Class Students
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttFilter((p) => ({ ...p, classId: String(c.id) }));
                      setActiveTab('attendance');
                    }}
                    className="text-slate-500 hover:underline cursor-pointer"
                  >
                    Attendance Stats
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Subject Management */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base mb-4">Subject Management</h2>
            <form onSubmit={addSubject} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <input
                required
                placeholder="Subject Code (e.g. MATH-5)"
                value={subjectForm.code}
                onChange={(e) => setSubjectForm((p) => ({ ...p, code: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                required
                placeholder="Subject Name (e.g. Mathematics)"
                value={subjectForm.name}
                onChange={(e) => setSubjectForm((p) => ({ ...p, name: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                required
                value={subjectForm.classId}
                onChange={(e) => setSubjectForm((p) => ({ ...p, classId: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select Class...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Class {c.name} ({c.class_code})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
              >
                Add Subject
              </button>
            </form>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {subjects.map((sub) => (
                <div key={sub.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{sub.name}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {sub.code} · Class {sub.class_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/principal/subjects/${sub.id}`, { method: 'DELETE' });
                      await loadOverviewAndCore();
                    }}
                    className="text-red-500 hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TEACHERS & STAFF ATTENDANCE */}
      {activeTab === 'teachers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold font-display">Teacher Accounts & Directory</h1>
            <button
              type="button"
              onClick={() => {
                setTeacherForm({
                  fullName: '',
                  username: '',
                  password: '',
                  subjectSpecialty: '',
                  phone: '',
                  qualification: '',
                  classId: '',
                });
                setTeacherModal({ open: true, editing: null });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Teacher Account
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4">Teacher ID</th>
                    <th className="py-3 px-4">Name & Username</th>
                    <th className="py-3 px-4">Assigned Class</th>
                    <th className="py-3 px-4">Specialty</th>
                    <th className="py-3 px-4">Submissions</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teachers.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono">{t.teacher_code}</td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-sm">{t.full_name}</p>
                        <p className="font-mono text-slate-500">@{t.username}</p>
                      </td>
                      <td className="py-3 px-4">{t.assigned_classes || 'Unassigned'}</td>
                      <td className="py-3 px-4">{t.subject_specialty}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{t.submission_count} logs</td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold uppercase ${t.status === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherForm({
                              fullName: t.full_name,
                              username: t.username,
                              password: '',
                              subjectSpecialty: t.subject_specialty,
                              phone: t.phone || '',
                              qualification: t.qualification || '',
                              classId: '',
                            });
                            setTeacherModal({ open: true, editing: t });
                          }}
                          className="text-[#0B1B3A] dark:text-amber-400 font-semibold hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTeacherModal(t);
                            setResetPassValue('');
                          }}
                          className="text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                        >
                          Reset Password
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleTeacherStatus(t.id)}
                          className="text-red-600 hover:underline cursor-pointer"
                        >
                          {t.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Faculty Attendance Register */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-base">Daily Teacher Attendance</h2>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={teacherAttDate}
                  onChange={(e) => setTeacherAttDate(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={saveTeacherAttendance}
                  className="px-4 py-1.5 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  Save Faculty Attendance
                </button>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {teacherAttRows.map((r, idx) => (
                <div key={r.teacher_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{r.full_name}</p>
                    <p className="font-mono text-slate-500">{r.teacher_code} · {r.subject_specialty}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {['Present', 'Absent', 'Late', 'Leave'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          setTeacherAttRows((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, status: st } : row))
                          )
                        }
                        className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                          r.status === st
                            ? 'bg-[#0B1B3A] text-white border-[#0B1B3A] dark:bg-amber-500 dark:text-slate-950'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE MONITORING */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 no-print">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-lg font-bold font-display">All-Classes Attendance Register</h1>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportAttendancePdf(
                      'Attendance Register Report',
                      `Filter Date: ${attFilter.date || attFilter.month || attFilter.year || 'All'}`,
                      attMonitor?.records || []
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => exportAttendanceExcel('abdali-attendance', attMonitor?.records || [])}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Register
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                placeholder="Search student name, ID, roll..."
                value={attFilter.search}
                onChange={(e) => setAttFilter((p) => ({ ...p, search: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <select
                value={attFilter.classId}
                onChange={(e) => setAttFilter((p) => ({ ...p, classId: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Class {c.name} ({c.class_code})
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={attFilter.date}
                onChange={(e) => setAttFilter((p) => ({ ...p, date: e.target.value, month: '', year: '' }))}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="month"
                value={attFilter.month}
                onChange={(e) => setAttFilter((p) => ({ ...p, month: e.target.value, date: '', year: '' }))}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Year (e.g. 2026)"
                value={attFilter.year}
                onChange={(e) => setAttFilter((p) => ({ ...p, year: e.target.value, date: '', month: '' }))}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Absent Students Prominent Panel */}
          {(attMonitor?.absentStudents || []).length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-5">
              <h2 className="font-display font-bold text-sm text-red-800 dark:text-red-300 mb-3">
                Absent Students Alert ({attMonitor.absentStudents.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {attMonitor.absentStudents.map((a: any) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openProfile(a.student_id)}
                    className="text-left p-3 rounded-lg bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 hover:border-red-400 cursor-pointer"
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{a.full_name}</p>
                    <p className="font-mono text-slate-500">
                      Class {a.class_name} · {a.student_code} · {a.date}
                    </p>
                    <p className="text-red-600 dark:text-red-400 mt-1">Guardian: {a.parent_mobile}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complete Register Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Roll</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(attMonitor?.records || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No attendance records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    attMonitor.records.map((r: any) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono">{r.date}</td>
                        <td className="py-2.5 px-4 font-mono">{r.student_code}</td>
                        <td className="py-2.5 px-4 font-mono">{r.roll_number}</td>
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => openProfile(r.student_id)}
                            className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            {r.full_name}
                          </button>
                        </td>
                        <td className="py-2.5 px-4">Class {r.class_name}</td>
                        <td className="py-2.5 px-4 font-semibold">{r.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CORRECTIONS & AUDIT LOG */}
      {activeTab === 'corrections' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base mb-4">Attendance Correction Requests</h2>
            {corrections.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No correction requests submitted yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {corrections.map((c) => (
                  <div key={c.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">
                        {c.student_name} ({c.student_code}) · Class {c.class_name} · {c.date}
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        Requested by {c.teacher_name}: <strong>{c.old_status}</strong> → <strong>{c.requested_status}</strong>
                      </p>
                      <p className="text-slate-500 mt-0.5">Reason: {c.reason}</p>
                    </div>

                    {c.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => reviewCorrection(c.id, 'approved')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewCorrection(c.id, 'rejected')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="font-semibold uppercase text-slate-500">{c.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base mb-4">Immutable Security & Audit Log</h2>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-2 pr-3">Timestamp</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Details / Changes</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{log.created_at}</td>
                      <td className="py-2 pr-3 font-medium">
                        {log.actor_name} ({log.actor_role})
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold">{log.action_type}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                        {log.old_value ? `${log.old_value} → ` : ''}
                        {log.new_value || '—'}
                      </td>
                      <td className="py-2 text-slate-500">{log.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STUDENTS DIRECTORY & PROMOTION */}
      {activeTab === 'students' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search students by name, ID, roll..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>
              <select
                value={studentClassFilter}
                onChange={(e) => setStudentClassFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Class {c.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedStudentIds.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={promoteTargetClassId}
                  onChange={(e) => setPromoteTargetClassId(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Promote {selectedStudentIds.length} to...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Class {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={promoteStudents}
                  className="px-3.5 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  Promote
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                  <th className="py-3 px-4 w-8">Sel</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Guardian</th>
                  <th className="py-3 px-4 text-right">Attendance</th>
                  <th className="py-3 px-4 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(s.id)}
                        onChange={(e) =>
                          setSelectedStudentIds((prev) =>
                            e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                          )
                        }
                      />
                    </td>
                    <td className="py-3 px-4 font-mono">{s.student_code}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => openProfile(s.id)}
                        className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        {s.full_name}
                      </button>
                      <span className="block text-slate-500">Roll #{s.roll_number}</span>
                    </td>
                    <td className="py-3 px-4">Class {s.class_name}</td>
                    <td className="py-3 px-4">
                      {s.parent_name} · <span className="font-mono">{s.parent_mobile}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">{s.attendancePercentage}%</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openProfile(s.id)}
                        className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        Open Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADVANCED REPORTS & ANALYTICS */}
      {activeTab === 'analytics' && analyticsData && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={analyticsFilter.classId}
                onChange={(e) => setAnalyticsFilter((p) => ({ ...p, classId: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Class {c.name}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={analyticsFilter.month}
                onChange={(e) => setAnalyticsFilter((p) => ({ ...p, month: e.target.value }))}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <input
                type="text"
                placeholder="Subject filter..."
                value={analyticsFilter.subject}
                onChange={(e) => setAnalyticsFilter((p) => ({ ...p, subject: e.target.value }))}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportAnalyticsReportPdf(
                    'Student Attendance & Academic Summary',
                    ['Rank', 'Student ID', 'Name', 'Class', 'Attendance %'],
                    (analyticsData.rankings?.attendanceRanking || []).map((r: any) => [
                      r.rank,
                      r.student_code,
                      r.full_name,
                      r.class_name,
                      `${r.attendancePercentage}%`,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  exportAttendanceExcel('abdali-analytics-rankings', analyticsData.rankings?.attendanceRanking || [])
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Excel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
              <h2 className="font-display font-bold text-sm mb-3">Daily Attendance Trend</h2>
              <ResponsiveContainer width="100%" height="84%">
                <BarChart data={analyticsData.dailyChart || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="#16A34A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" fill="#DC2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-72">
              <h2 className="font-display font-bold text-sm mb-3">Test Performance Average (%)</h2>
              <ResponsiveContainer width="100%" height="84%">
                <BarChart data={analyticsData.testPerformance || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                  <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avg_percentage" fill="#D9A738" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base mb-3">Attendance Ranking</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(analyticsData.rankings?.attendanceRanking || []).slice(0, 10).map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between">
                    <span>
                      <strong className="font-mono text-amber-600 mr-2">#{r.rank}</strong>
                      {r.full_name} · <span className="font-mono text-slate-500">{r.student_code}</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-600">{r.attendancePercentage}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base mb-3">Academic Performance Ranking</h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(analyticsData.rankings?.academicRanking || []).slice(0, 10).map((r: any) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between">
                    <span>
                      <strong className="font-mono text-[#0B1B3A] dark:text-amber-400 mr-2">#{r.rank}</strong>
                      {r.full_name} · <span className="font-mono text-slate-500">{r.student_code}</span>
                    </span>
                    <span className="font-mono font-bold">{r.academicPercentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAMPUS OPERATIONS (ANNOUNCEMENTS, HOLIDAYS, TIMETABLE, FEES) */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="font-display font-bold text-base">Publish Principal Announcement</h2>
              <form onSubmit={publishAnnouncement} className="space-y-3">
                <input
                  required
                  placeholder="Announcement Title"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <textarea
                  required
                  rows={3}
                  placeholder="Message body..."
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm((p) => ({ ...p, content: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={announcementForm.targetRole}
                    onChange={(e) => setAnnouncementForm((p) => ({ ...p, targetRole: e.target.value }))}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="all">All Portals</option>
                    <option value="teacher">Teachers Only</option>
                    <option value="student">Students Only</option>
                    <option value="parent">Parents Only</option>
                  </select>
                  <select
                    value={announcementForm.priority}
                    onChange={(e) => setAnnouncementForm((p) => ({ ...p, priority: e.target.value }))}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="normal">Normal Notice</option>
                    <option value="important">Important Alert</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  Publish & Notify Users
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="font-display font-bold text-base">School Holidays Calendar</h2>
              <form onSubmit={addHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((p) => ({ ...p, date: e.target.value }))}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  required
                  placeholder="Holiday Title"
                  value={holidayForm.title}
                  onChange={(e) => setHolidayForm((p) => ({ ...p, title: e.target.value }))}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  Add Holiday
                </button>
              </form>
              <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                {holidays.map((h) => (
                  <div key={h.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-mono text-amber-700 dark:text-amber-400 mr-2">{h.date}</span>
                      <span className="font-semibold">{h.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/principal/holidays/${h.id}`, { method: 'DELETE' });
                        await loadOverviewAndCore();
                      }}
                      className="text-red-500 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base mb-3">Fee Management Ledger</h2>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fees.map((f) => (
                    <tr key={f.id}>
                      <td className="py-2.5 pr-3 font-medium">
                        {f.student_name} <span className="font-mono text-slate-500">({f.student_code})</span>
                      </td>
                      <td className="py-2.5 pr-3">Class {f.class_name}</td>
                      <td className="py-2.5 pr-3">{f.month} {f.year}</td>
                      <td className="py-2.5 pr-3 text-right font-mono">PKR {f.amount.toLocaleString()}</td>
                      <td className="py-2.5 pr-3 font-semibold">{f.status}</td>
                      <td className="py-2.5 text-right">
                        {f.status !== 'Paid' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/principal/fees/${f.id}/mark-paid`, { method: 'POST' });
                              await loadOverviewAndCore();
                            }}
                            className="font-semibold text-emerald-600 hover:underline cursor-pointer"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <span className="font-mono text-slate-400">{f.receipt_no}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base mb-3">Master Class Timetable Preview</h2>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2">Teacher</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {timetable.slice(0, 20).map((slot) => (
                    <tr key={slot.id}>
                      <td className="py-2 pr-3 font-semibold">Class {slot.class_name}</td>
                      <td className="py-2 pr-3">{slot.day_of_week}</td>
                      <td className="py-2 pr-3 font-mono">{slot.start_time} – {slot.end_time}</td>
                      <td className="py-2 pr-3">{slot.subject}</td>
                      <td className="py-2 text-slate-500">{slot.teacher_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS & DATABASE BACKUP */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={saveSettings}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <h2 className="font-display font-bold text-base">Academy & Attendance Policy Settings</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Academy Display Name</label>
              <input
                value={settings.academy_name || ''}
                onChange={(e) => setSettings((p) => ({ ...p, academy_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Campus Address</label>
              <input
                value={settings.campus_address || ''}
                onChange={(e) => setSettings((p) => ({ ...p, campus_address: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Late Counts as Present</label>
                <select
                  value={settings.late_counts_as_present || '1'}
                  onChange={(e) => setSettings((p) => ({ ...p, late_counts_as_present: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="1">Yes (Present + Late)</option>
                  <option value="0">No (Strict Present Only)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Approved Leave Policy</label>
                <select
                  value={settings.leave_excluded_from_denominator || '1'}
                  onChange={(e) => setSettings((p) => ({ ...p, leave_excluded_from_denominator: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="1">Excused (Excluded from denominator)</option>
                  <option value="0">Counted in total days</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Save Policy Settings
            </button>
          </form>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h2 className="font-display font-bold text-base">Academic Year Management</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/principal/sessions', { method: 'POST', body: JSON.stringify(sessionForm) });
                  setSessionForm({ name: '', startDate: '', endDate: '' });
                  await loadOverviewAndCore();
                }}
                className="grid grid-cols-3 gap-2"
              >
                <input
                  required
                  placeholder="2027-2028"
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm((p) => ({ ...p, name: e.target.value }))}
                  className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="date"
                  required
                  value={sessionForm.startDate}
                  onChange={(e) => setSessionForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <input
                  type="date"
                  required
                  value={sessionForm.endDate}
                  onChange={(e) => setSessionForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="col-span-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Add Academic Session
                </button>
              </form>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {sessions.map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between">
                    <span>
                      <strong>{s.name}</strong> ({s.start_date} – {s.end_date})
                    </span>
                    {s.is_active ? (
                      <span className="font-semibold text-emerald-600">Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/principal/sessions/${s.id}/activate`, { method: 'POST' });
                          await loadOverviewAndCore();
                        }}
                        className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base">Database Backup</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Download a consistent snapshot of the Abdali Education Academy SQLite database.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = getAuthToken();
                    const res = await fetch('/api/principal/backup', {
                      credentials: 'include',
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });
                    if (!res.ok) throw new Error('Backup failed');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `abdali-academy-backup-${new Date().toISOString().slice(0, 10)}.db`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch {
                    setFeedback({ type: 'err', text: 'Unable to download database backup.' });
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                Download Backup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLASS MODAL */}
      {classModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white">
              <h3 className="font-display font-bold text-base">
                {classModal.editing ? `Edit Class ${classModal.editing.name}` : 'Create New Class'}
              </h3>
            </div>
            <form onSubmit={saveClass} className="p-6 space-y-4">
              {!classModal.editing && (
                <div>
                  <label className="block text-xs font-semibold mb-1">Unique Class ID (e.g. CLS-06)</label>
                  <input
                    required
                    value={classForm.classCode}
                    onChange={(e) => setClassForm((p) => ({ ...p, classCode: e.target.value }))}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Class Name (e.g. 6th)</label>
                  <input
                    required
                    value={classForm.name}
                    onChange={(e) => setClassForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Section</label>
                  <input
                    required
                    value={classForm.section}
                    onChange={(e) => setClassForm((p) => ({ ...p, section: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Room Number</label>
                <input
                  value={classForm.roomNumber}
                  onChange={(e) => setClassForm((p) => ({ ...p, roomNumber: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Assign Class Teacher</label>
                <select
                  value={classForm.teacherId}
                  onChange={(e) => setClassForm((p) => ({ ...p, teacherId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">Unassigned</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.teacher_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClassModal({ open: false, editing: null })}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEACHER MODAL */}
      {teacherModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white">
              <h3 className="font-display font-bold text-base">
                {teacherModal.editing ? `Edit Teacher (${teacherModal.editing.teacher_code})` : 'Create Teacher Account'}
              </h3>
            </div>
            <form onSubmit={saveTeacher} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Full Name</label>
                  <input
                    required
                    value={teacherForm.fullName}
                    onChange={(e) => setTeacherForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                {!teacherModal.editing && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Username</label>
                    <input
                      required
                      value={teacherForm.username}
                      onChange={(e) => setTeacherForm((p) => ({ ...p, username: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
                {!teacherModal.editing && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Initial Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={teacherForm.password}
                      onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1">Subject Specialty</label>
                  <input
                    required
                    value={teacherForm.subjectSpecialty}
                    onChange={(e) => setTeacherForm((p) => ({ ...p, subjectSpecialty: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Phone</label>
                  <input
                    value={teacherForm.phone}
                    onChange={(e) => setTeacherForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Qualification</label>
                  <input
                    value={teacherForm.qualification}
                    onChange={(e) => setTeacherForm((p) => ({ ...p, qualification: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Assign to Class</label>
                <select
                  value={teacherForm.classId}
                  onChange={(e) => setTeacherForm((p) => ({ ...p, classId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">Keep / Unassigned</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      Class {c.name} ({c.class_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTeacherModal({ open: false, editing: null })}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Save Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET TEACHER PASSWORD MODAL */}
      {resetTeacherModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-5 py-4 text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <h3 className="font-display font-bold text-sm">Reset Password — {resetTeacherModal.full_name}</h3>
            </div>
            <form onSubmit={resetTeacherPassword} className="p-5 space-y-4">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New temporary password (min 6 chars)"
                value={resetPassValue}
                onChange={(e) => setResetPassValue(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTeacherModal(null)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StudentProfileModal
        profile={selectedProfile}
        loading={profileLoading}
        onClose={() => {
          setSelectedProfile(null);
          setProfileLoading(false);
        }}
      />
    </DashboardShell>
  );
}
