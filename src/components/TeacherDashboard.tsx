import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  Trophy,
  BookOpen,
  FileSpreadsheet,
  CalendarDays,
  Clock,
  Lock,
  Search,
  UserPlus,
  Edit3,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import DashboardShell, { type NavItem } from './DashboardShell';
import StudentProfileModal from './StudentProfileModal';
import { apiFetch, resolveAssetUrl, uploadFile } from '../lib/api';
import type { NotificationItem, PktTimeInfo, SessionUser, StudentFullProfile } from '../types';

interface TeacherDashboardProps {
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

export default function TeacherDashboard({
  user,
  pkt,
  notifications,
  onRefreshNotifications,
  onLogout,
  onPasswordChanged,
  darkMode,
  onToggleDarkMode,
  liveSignal,
}: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [markMap, setMarkMap] = useState<Record<number, string>>({});
  const [corrections, setCorrections] = useState<any[]>([]);
  const [rankings, setRankings] = useState<{ attendanceRanking: any[]; academicRanking: any[] }>({
    attendanceRanking: [],
    academicRanking: [],
  });
  const [rankingSearch, setRankingSearch] = useState('');
  const [homeworkList, setHomeworkList] = useState<any[]>([]);
  const [testsList, setTestsList] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const [selectedProfile, setSelectedProfile] = useState<StudentFullProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Student Registration / Edit state
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    fatherName: '',
    photoUrl: '',
    dob: '2015-01-01',
    gender: 'Male',
    rollNumber: '',
    parentName: '',
    parentMobile: '',
    studentUsername: '',
    studentPassword: '',
    parentUsername: '',
    parentPassword: '',
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Correction Request modal state
  const [correctionTarget, setCorrectionTarget] = useState<any>(null);
  const [correctionStatus, setCorrectionStatus] = useState('Present');
  const [correctionReason, setCorrectionReason] = useState('');

  // Homework modal state
  const [showHwModal, setShowHwModal] = useState(false);
  const [editingHw, setEditingHw] = useState<any>(null);
  const [hwForm, setHwForm] = useState({
    subject: 'Mathematics',
    title: '',
    description: '',
    dueDate: '',
    attachmentUrl: '',
    attachmentName: '',
    status: 'published',
  });
  const [uploadingHwFile, setUploadingHwFile] = useState(false);

  // Test modal & Marks modal state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testForm, setTestForm] = useState({
    title: '',
    subject: 'Mathematics',
    testType: 'Weekly',
    testDate: '',
    totalMarks: 25,
    syllabus: '',
    instructions: '',
  });
  const [gradingTest, setGradingTest] = useState<any>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<number, { obtainedMarks: string; remarks: string }>>({});

  const loadAll = useCallback(async () => {
    try {
      const [ov, st, att, corr, rank, hw, ts, tt, hol, ann] = await Promise.all([
        apiFetch('/api/teacher/overview'),
        apiFetch(`/api/teacher/students?search=${encodeURIComponent(studentSearch)}`),
        apiFetch(`/api/teacher/attendance${attendanceDate ? `?date=${attendanceDate}` : ''}`),
        apiFetch('/api/teacher/correction-requests'),
        apiFetch('/api/teacher/rankings'),
        apiFetch('/api/teacher/homework'),
        apiFetch('/api/teacher/tests'),
        apiFetch('/api/timetable'),
        apiFetch('/api/holidays'),
        apiFetch('/api/announcements'),
      ]);
      setOverview(ov);
      setStudents(st.students || []);
      setAttendanceData(att);
      if (!attendanceDate && att?.date) setAttendanceDate(att.date);

      const initialMarks: Record<number, string> = {};
      for (const row of att.students || []) {
        initialMarks[row.student_id] = row.status || 'Present';
      }
      setMarkMap(initialMarks);

      setCorrections(corr.requests || []);
      setRankings(rank);
      setHomeworkList(hw.homework || []);
      setTestsList(ts.tests || []);
      setTimetable(tt.timetable || []);
      setHolidays(hol.holidays || []);
      setAnnouncements(ann.announcements || []);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load teacher data.' });
    }
  }, [studentSearch, attendanceDate]);

  useEffect(() => {
    loadAll();
  }, [loadAll, liveSignal]);

  const openProfile = async (studentId: number) => {
    setProfileLoading(true);
    setSelectedProfile(null);
    try {
      const profile = await apiFetch<StudentFullProfile>(`/api/teacher/students/${studentId}`);
      setSelectedProfile(profile);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load student profile.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const res = await uploadFile(file);
      setStudentForm((prev) => ({ ...prev, photoUrl: res.url }));
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Photo upload failed.' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleHwFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHwFile(true);
    try {
      const res = await uploadFile(file);
      setHwForm((prev) => ({ ...prev, attachmentUrl: res.url, attachmentName: res.originalName }));
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Attachment upload failed.' });
    } finally {
      setUploadingHwFile(false);
    }
  };

  const openCreateStudent = () => {
    setEditingStudent(null);
    setStudentForm({
      fullName: '',
      fatherName: '',
      photoUrl: '',
      dob: '2015-05-01',
      gender: 'Male',
      rollNumber: String(students.length + 1).padStart(2, '0'),
      parentName: '',
      parentMobile: '',
      studentUsername: '',
      studentPassword: '',
      parentUsername: '',
      parentPassword: '',
    });
    setShowStudentModal(true);
  };

  const openEditStudent = (s: any) => {
    setEditingStudent(s);
    setStudentForm({
      fullName: s.full_name,
      fatherName: s.father_name,
      photoUrl: s.photo_url || '',
      dob: s.dob,
      gender: s.gender,
      rollNumber: s.roll_number,
      parentName: s.parent_name,
      parentMobile: s.parent_mobile,
      studentUsername: s.student_username || '',
      studentPassword: '',
      parentUsername: s.parent_username || '',
      parentPassword: '',
    });
    setShowStudentModal(true);
  };

  const submitStudentForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (editingStudent) {
        await apiFetch(`/api/teacher/students/${editingStudent.id}`, {
          method: 'PUT',
          body: JSON.stringify(studentForm),
        });
        setFeedback({ type: 'ok', text: `Updated ${studentForm.fullName}'s profile (Student ID remained immutable).` });
      } else {
        const res = await apiFetch<{ studentCode: string }>('/api/teacher/students', {
          method: 'POST',
          body: JSON.stringify(studentForm),
        });
        setFeedback({
          type: 'ok',
          text: `Student registered with permanent ID ${res.studentCode}. Student & Parent portal accounts created.`,
        });
      }
      setShowStudentModal(false);
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not save student.' });
    }
  };

  const submitAttendance = async () => {
    if (!attendanceData?.students?.length) return;
    setFeedback(null);
    try {
      const entries = attendanceData.students.map((s: any) => ({
        studentId: s.student_id,
        status: markMap[s.student_id] || 'Present',
      }));
      await apiFetch('/api/teacher/attendance', {
        method: 'POST',
        body: JSON.stringify({ entries }),
      });
      setFeedback({
        type: 'ok',
        text: 'Attendance submitted, locked, and dispatched in real time to Principal & Parents.',
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Attendance submission blocked.' });
    }
  };

  const submitCorrectionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    setFeedback(null);
    try {
      await apiFetch('/api/teacher/correction-requests', {
        method: 'POST',
        body: JSON.stringify({
          attendanceId: correctionTarget.attendance_id,
          requestedStatus: correctionStatus,
          reason: correctionReason,
        }),
      });
      setCorrectionTarget(null);
      setCorrectionReason('');
      setFeedback({ type: 'ok', text: 'Attendance correction request sent to Principal for review.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to submit request.' });
    }
  };

  const submitHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      if (editingHw) {
        await apiFetch(`/api/teacher/homework/${editingHw.id}`, {
          method: 'PUT',
          body: JSON.stringify(hwForm),
        });
      } else {
        await apiFetch('/api/teacher/homework', {
          method: 'POST',
          body: JSON.stringify(hwForm),
        });
      }
      setShowHwModal(false);
      setEditingHw(null);
      setFeedback({
        type: 'ok',
        text:
          hwForm.status === 'published'
            ? 'Homework published and students/parents notified in real time.'
            : 'Homework saved as draft.',
      });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not save homework.' });
    }
  };

  const submitTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/teacher/tests', {
        method: 'POST',
        body: JSON.stringify(testForm),
      });
      setShowTestModal(false);
      setFeedback({ type: 'ok', text: 'Test scheduled and class students/parents notified instantly.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not create test.' });
    }
  };

  const openGrading = (test: any) => {
    setGradingTest(test);
    const existingMap = new Map<number, any>((test.results || []).map((r: any) => [r.student_id, r]));
    const inputs: Record<number, { obtainedMarks: string; remarks: string }> = {};
    for (const s of students) {
      const ex = existingMap.get(s.id);
      inputs[s.id] = {
        obtainedMarks: ex ? String(ex.obtained_marks) : '',
        remarks: ex?.remarks || '',
      };
    }
    setGradeInputs(inputs);
  };

  const submitMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingTest) return;
    setFeedback(null);
    try {
      const marks = students
        .filter((s) => gradeInputs[s.id]?.obtainedMarks !== '')
        .map((s) => ({
          studentId: s.id,
          obtainedMarks: Number(gradeInputs[s.id].obtainedMarks),
          remarks: gradeInputs[s.id].remarks,
        }));
      await apiFetch(`/api/teacher/tests/${gradingTest.id}/marks`, {
        method: 'POST',
        body: JSON.stringify({ marks }),
      });
      setGradingTest(null);
      setFeedback({ type: 'ok', text: 'Test marks saved, positions calculated, and results published.' });
      await loadAll();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save marks.' });
    }
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'students', label: 'Students', icon: Users, badge: students.length },
    { id: 'rankings', label: 'Rankings', icon: Trophy },
    { id: 'homework', label: 'Homework', icon: BookOpen },
    { id: 'tests', label: 'Tests & Marks', icon: FileSpreadsheet },
    { id: 'schedule', label: 'Timetable', icon: CalendarDays },
  ];

  const effectivePkt = overview?.pkt || pkt;
  const assignedClass = overview?.assignedClass || user.assignedClass;

  return (
    <DashboardShell
      user={user}
      pkt={effectivePkt}
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
          className={`mb-5 p-3.5 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between gap-3 ${
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
          <div className="bg-[#0B1B3A] text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-amber-400 mb-1">
                {overview?.teacher?.teacher_code || user.code} · {assignedClass ? `Class ${assignedClass.name} (${assignedClass.class_code})` : 'No Class Assigned'}
              </p>
              <h1 className="text-2xl font-bold font-display">Welcome, {user.fullName}</h1>
              <p className="text-sm text-slate-300 mt-1">
                {overview?.teacher?.subject_specialty || user.subjectSpecialty}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-xs font-mono">
                <span className="text-slate-300 block">Server PKT Time</span>
                <span className="text-amber-300 font-semibold text-sm">
                  {effectivePkt ? `${effectivePkt.time} PKT` : 'Syncing...'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('attendance')}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap cursor-pointer"
              >
                Open Attendance Register
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Students', value: overview?.stats?.totalStudents ?? 0 },
              { label: 'Present Today', value: overview?.stats?.presentToday ?? 0 },
              { label: 'Absent Today', value: overview?.stats?.absentToday ?? 0 },
              { label: 'Class Attendance Avg', value: `${overview?.stats?.classAttendanceAverage ?? 0}%` },
              { label: 'Published Homework', value: overview?.stats?.homeworkCount ?? 0 },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#0B1B3A] dark:text-white mt-1">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">
                  Upcoming Tests
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('tests')}
                  className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Manage Tests
                </button>
              </div>
              {(overview?.upcomingTests || []).length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No upcoming tests scheduled.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.upcomingTests.map((t: any) => (
                    <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
                        <p className="text-xs text-slate-500">{t.subject} · {t.test_type} · {t.total_marks} Marks</p>
                      </div>
                      <span className="text-xs font-mono text-amber-700 dark:text-amber-400">{t.test_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
                Recent Notifications & Announcements
              </h2>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {announcements.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-[#0B1B3A] dark:text-amber-300">{a.title}</span>
                      <span className="font-mono text-slate-400">{a.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{a.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE & PKT WINDOW */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold font-display text-[#0B1B3A] dark:text-white">
                Daily Class Attendance — {attendanceData?.classInfo ? `Class ${attendanceData.classInfo.name}` : ''}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                <span className="font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Server PKT: {attendanceData?.pkt?.date} {attendanceData?.pkt?.time}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    attendanceData?.pkt?.isAttendanceWindowOpen ? 'text-emerald-600' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {attendanceData?.pkt?.windowMessage}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {attendanceData?.submission ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Attendance for <strong>{attendanceData.date}</strong> was submitted at{' '}
                  <span className="font-mono">{attendanceData.submission.pkt_time_str} PKT</span> and is permanently locked. Use "Request Correction" if a Principal-approved adjustment is needed.
                </span>
              </div>
              <div className="text-xs font-mono tabular-nums text-emerald-900 dark:text-emerald-200">
                P: {attendanceData.submission.present_count} · A: {attendanceData.submission.absent_count} · L:{' '}
                {attendanceData.submission.late_count} · Lv: {attendanceData.submission.leave_count}
              </div>
            </div>
          ) : !attendanceData?.pkt?.isAttendanceWindowOpen && attendanceData?.isToday ? (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex items-center gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                <strong>Submission Disabled:</strong> Server enforces attendance strictly between 08:00 AM and 11:59 AM Pakistan Standard Time. Device clock changes cannot bypass this rule.
              </span>
            </div>
          ) : null}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-left">
                    <th className="py-3 px-4">Roll</th>
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Attendance Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(attendanceData?.students || []).map((st: any) => {
                    const isLocked = Boolean(attendanceData?.submission) || !attendanceData?.isToday || !attendanceData?.pkt?.isAttendanceWindowOpen;
                    return (
                      <tr key={st.student_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono tabular-nums text-xs">{st.roll_number}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">{st.student_code}</td>
                        <td className="py-3 px-4 font-medium">{st.full_name}</td>
                        <td className="py-3 px-4">
                          {attendanceData?.submission ? (
                            <span
                              className={`text-xs font-semibold ${
                                st.status === 'Present'
                                  ? 'text-emerald-600'
                                  : st.status === 'Absent'
                                  ? 'text-red-600'
                                  : st.status === 'Late'
                                  ? 'text-amber-600'
                                  : 'text-blue-600'
                              }`}
                            >
                              {st.status || '—'}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {['Present', 'Absent', 'Late', 'Leave'].map((opt) => {
                                const selected = (markMap[st.student_id] || 'Present') === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    disabled={isLocked}
                                    onClick={() => setMarkMap((prev) => ({ ...prev, [st.student_id]: opt }))}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                                      selected
                                        ? opt === 'Present'
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : opt === 'Absent'
                                          ? 'bg-red-600 text-white border-red-600'
                                          : opt === 'Late'
                                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                                          : 'bg-blue-600 text-white border-blue-600'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {attendanceData?.submission && st.attendance_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCorrectionTarget(st);
                                setCorrectionStatus(st.status === 'Present' ? 'Absent' : 'Present');
                              }}
                              className="text-xs font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              Request Correction
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!attendanceData?.submission && attendanceData?.isToday && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={!attendanceData?.pkt?.isAttendanceWindowOpen}
                  onClick={submitAttendance}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Submit & Lock Today’s Attendance
                </button>
              </div>
            )}
          </div>

          {/* Teacher Correction History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-3">
              Submitted Correction Requests
            </h2>
            {corrections.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">No attendance correction requests submitted.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {corrections.map((c: any) => (
                  <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {c.student_name} ({c.student_code}) · {c.date}
                      </p>
                      <p className="text-slate-500">
                        {c.old_status} → {c.requested_status} · Reason: {c.reason}
                      </p>
                    </div>
                    <span
                      className={`font-semibold uppercase ${
                        c.status === 'approved'
                          ? 'text-emerald-600'
                          : c.status === 'rejected'
                          ? 'text-red-600'
                          : 'text-amber-600'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STUDENT REGISTRATION & DIRECTORY */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by Student Name, ID, or Roll Number..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={openCreateStudent}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Register New Student
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => openProfile(s.id)}
                    className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                  >
                    <img
                      src={resolveAssetUrl(s.photo_url)}
                      alt={s.full_name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openProfile(s.id)}
                      className="font-display font-bold text-base text-[#0B1B3A] dark:text-white hover:underline text-left truncate block w-full cursor-pointer"
                    >
                      {s.full_name}
                    </button>
                    <p className="text-xs font-mono text-amber-700 dark:text-amber-400 mt-0.5">
                      {s.student_code} · Roll #{s.roll_number}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Class {s.class_name} · Attendance:{' '}
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {s.attendancePercentage}%
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => openProfile(s.id)}
                    className="font-semibold text-[#0B1B3A] dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    View Full Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditStudent(s)}
                    className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEPARATE ATTENDANCE VS ACADEMIC RANKINGS */}
      {activeTab === 'rankings' && (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={rankingSearch}
              onChange={(e) => setRankingSearch(e.target.value)}
              placeholder="Filter rankings by student name or ID..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
                Attendance Percentage Ranking
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rankings.attendanceRanking
                  .filter(
                    (r) =>
                      r.full_name.toLowerCase().includes(rankingSearch.toLowerCase()) ||
                      r.student_code.toLowerCase().includes(rankingSearch.toLowerCase())
                  )
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openProfile(r.id)}
                      className="w-full py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-sm font-mono font-bold text-amber-600">#{r.rank}</span>
                        <img
                          src={resolveAssetUrl(r.photo_url)}
                          alt={r.full_name}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{r.full_name}</p>
                          <p className="text-xs font-mono text-slate-500">{r.student_code}</p>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold tabular-nums text-emerald-600">
                        {r.attendancePercentage}%
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
              <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
                Academic Performance Ranking
              </h2>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {rankings.academicRanking
                  .filter(
                    (r) =>
                      r.full_name.toLowerCase().includes(rankingSearch.toLowerCase()) ||
                      r.student_code.toLowerCase().includes(rankingSearch.toLowerCase())
                  )
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openProfile(r.id)}
                      className="w-full py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-sm font-mono font-bold text-[#0B1B3A] dark:text-amber-400">
                          #{r.rank}
                        </span>
                        <img
                          src={resolveAssetUrl(r.photo_url)}
                          alt={r.full_name}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{r.full_name}</p>
                          <p className="text-xs font-mono text-slate-500">
                            {r.student_code} · {r.testCount} tests
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold tabular-nums text-[#0B1B3A] dark:text-white">
                        {r.academicPercentage}%
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HOMEWORK MANAGEMENT */}
      {activeTab === 'homework' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold font-display text-[#0B1B3A] dark:text-white">
              Homework Assignments
            </h1>
            <button
              type="button"
              onClick={() => {
                setEditingHw(null);
                setHwForm({
                  subject: 'Mathematics',
                  title: '',
                  description: '',
                  dueDate: effectivePkt?.date || '',
                  attachmentUrl: '',
                  attachmentName: '',
                  status: 'published',
                });
                setShowHwModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Create Homework
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {homeworkList.map((h) => (
              <div
                key={h.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{h.subject}</span>
                    <span className="font-mono uppercase">
                      {h.status} · Due {h.due_date}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">{h.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{h.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  {h.attachment_url ? (
                    <a
                      href={h.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#0B1B3A] dark:text-amber-400 font-semibold hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {h.attachment_name || 'Attachment'}
                    </a>
                  ) : (
                    <span className="text-slate-400">Assigned {h.assigned_date}</span>
                  )}

                  {h.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingHw(h);
                        setHwForm({
                          subject: h.subject,
                          title: h.title,
                          description: h.description,
                          dueDate: h.due_date,
                          attachmentUrl: h.attachment_url || '',
                          attachmentName: h.attachment_name || '',
                          status: 'published',
                        });
                        setShowHwModal(true);
                      }}
                      className="font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      Edit / Publish
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TESTS & MARKS */}
      {activeTab === 'tests' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold font-display text-[#0B1B3A] dark:text-white">
              Tests & Examinations
            </h1>
            <button
              type="button"
              onClick={() => {
                setTestForm({
                  title: '',
                  subject: 'Mathematics',
                  testType: 'Weekly',
                  testDate: effectivePkt?.date || '',
                  totalMarks: 25,
                  syllabus: '',
                  instructions: '',
                });
                setShowTestModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
            >
              Schedule New Test
            </button>
          </div>

          <div className="space-y-4">
            {testsList.map((t) => (
              <div
                key={t.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {t.subject} · {t.test_type} · Total Marks: {t.total_marks}
                    </p>
                    <h3 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">{t.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Syllabus: {t.syllabus} · Date: <span className="font-mono">{t.test_date}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openGrading(t)}
                    className="px-3.5 py-2 rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer"
                  >
                    Enter / Update Marks ({t.graded_count} graded)
                  </button>
                </div>

                {(t.results || []).length > 0 && (
                  <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 text-left">
                          <th className="py-1.5 pr-3">Pos</th>
                          <th className="py-1.5 pr-3">Student</th>
                          <th className="py-1.5 pr-3 text-right">Marks</th>
                          <th className="py-1.5 pr-3 text-right">%</th>
                          <th className="py-1.5">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {t.results.map((r: any) => (
                          <tr key={r.id}>
                            <td className="py-1.5 pr-3 font-mono font-semibold">#{r.class_position}</td>
                            <td className="py-1.5 pr-3">{r.student_name}</td>
                            <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                              {r.obtained_marks}/{r.total_marks}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{r.percentage}%</td>
                            <td className="py-1.5 font-semibold">{r.grade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TIMETABLE & HOLIDAYS */}
      {activeTab === 'schedule' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
              Class Timetable
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {timetable.map((slot) => (
                    <tr key={slot.id}>
                      <td className="py-2 pr-3 font-medium">{slot.day_of_week}</td>
                      <td className="py-2 pr-3 font-mono">P{slot.period_number}</td>
                      <td className="py-2 pr-3 font-mono">
                        {slot.start_time} – {slot.end_time}
                      </td>
                      <td className="py-2 font-semibold">{slot.subject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <h2 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white mb-4">
              School Holidays Calendar
            </h2>
            <div className="space-y-3">
              {holidays.map((h) => (
                <div key={h.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-mono text-amber-700 dark:text-amber-400">{h.date}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{h.title}</p>
                  {h.description && <p className="text-xs text-slate-500 mt-0.5">{h.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STUDENT REGISTER / EDIT MODAL */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden my-6">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-base">
                {editingStudent ? `Edit Student (${editingStudent.student_code})` : 'Register New Student'}
              </h3>
              <button type="button" onClick={() => setShowStudentModal(false)} className="text-slate-300 cursor-pointer">
                Close
              </button>
            </div>

            <form onSubmit={submitStudentForm} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {editingStudent && (
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs flex items-center justify-between">
                  <span>Immutable Student ID:</span>
                  <span className="font-mono font-bold">{editingStudent.student_code}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Student Full Name</label>
                  <input
                    required
                    value={studentForm.fullName}
                    onChange={(e) => setStudentForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Father’s Name</label>
                  <input
                    required
                    value={studentForm.fatherName}
                    onChange={(e) => setStudentForm((p) => ({ ...p, fatherName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={studentForm.dob}
                    onChange={(e) => setStudentForm((p) => ({ ...p, dob: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Gender</label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm((p) => ({ ...p, gender: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Roll Number</label>
                  <input
                    required
                    value={studentForm.rollNumber}
                    onChange={(e) => setStudentForm((p) => ({ ...p, rollNumber: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Student Photo Upload</label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Uploading...' : studentForm.photoUrl ? 'Photo Attached' : 'Upload Photo (JPG/PNG)'}
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent/Guardian Name</label>
                  <input
                    required
                    value={studentForm.parentName}
                    onChange={(e) => setStudentForm((p) => ({ ...p, parentName: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Parent Mobile Number</label>
                  <input
                    required
                    value={studentForm.parentMobile}
                    onChange={(e) => setStudentForm((p) => ({ ...p, parentMobile: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              {!editingStudent && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Student Username</label>
                    <input
                      required
                      value={studentForm.studentUsername}
                      onChange={(e) => setStudentForm((p) => ({ ...p, studentUsername: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Student Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={studentForm.studentPassword}
                      onChange={(e) => setStudentForm((p) => ({ ...p, studentPassword: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Parent Username</label>
                    <input
                      required
                      value={studentForm.parentUsername}
                      onChange={(e) => setStudentForm((p) => ({ ...p, parentUsername: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Parent Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={studentForm.parentPassword}
                      onChange={(e) => setStudentForm((p) => ({ ...p, parentPassword: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  {editingStudent ? 'Save Changes' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CORRECTION REQUEST MODAL */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white">
              <h3 className="font-display font-bold text-base">Request Attendance Correction</h3>
              <p className="text-xs text-slate-300">
                {correctionTarget.full_name} · Current: {correctionTarget.status}
              </p>
            </div>
            <form onSubmit={submitCorrectionRequest} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Requested New Status</label>
                <select
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {['Present', 'Absent', 'Late', 'Leave']
                    .filter((s) => s !== correctionTarget.status)
                    .map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Reason for Principal Review</label>
                <textarea
                  required
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Provide factual justification for audit trail..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectionTarget(null)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Send to Principal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HOMEWORK MODAL */}
      {showHwModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white">
              <h3 className="font-display font-bold text-base">{editingHw ? 'Edit Draft Homework' : 'Assign Homework'}</h3>
            </div>
            <form onSubmit={submitHomework} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Subject</label>
                  <input
                    required
                    value={hwForm.subject}
                    onChange={(e) => setHwForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Submission Deadline</label>
                  <input
                    type="date"
                    required
                    value={hwForm.dueDate}
                    onChange={(e) => setHwForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Homework Title</label>
                <input
                  required
                  value={hwForm.title}
                  onChange={(e) => setHwForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Instructions & Details</label>
                <textarea
                  required
                  rows={3}
                  value={hwForm.description}
                  onChange={(e) => setHwForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Attachment (PDF/Image/Doc)</label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingHwFile ? 'Uploading...' : hwForm.attachmentName || 'Attach File'}
                    <input type="file" onChange={handleHwFileUpload} className="hidden" />
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Publish Mode</label>
                  <select
                    value={hwForm.status}
                    onChange={(e) => setHwForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="published">Publish & Notify Class</option>
                    <option value="draft">Save as Draft</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHwModal(false)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Save Homework
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TEST MODAL */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white">
              <h3 className="font-display font-bold text-base">Create & Announce Test</h3>
            </div>
            <form onSubmit={submitTest} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Test Title</label>
                  <input
                    required
                    value={testForm.title}
                    onChange={(e) => setTestForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Subject</label>
                  <input
                    required
                    value={testForm.subject}
                    onChange={(e) => setTestForm((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Test Type</label>
                  <select
                    value={testForm.testType}
                    onChange={(e) => setTestForm((p) => ({ ...p, testType: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Examination">Examination</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Test Date</label>
                  <input
                    type="date"
                    required
                    value={testForm.testDate}
                    onChange={(e) => setTestForm((p) => ({ ...p, testDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Total Marks</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={testForm.totalMarks}
                  onChange={(e) => setTestForm((p) => ({ ...p, totalMarks: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Test Syllabus</label>
                <input
                  required
                  value={testForm.syllabus}
                  onChange={(e) => setTestForm((p) => ({ ...p, syllabus: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Instructions</label>
                <textarea
                  rows={2}
                  value={testForm.instructions}
                  onChange={(e) => setTestForm((p) => ({ ...p, instructions: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Publish Test & Notify Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENTER MARKS MODAL */}
      {gradingTest && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden my-6">
            <div className="bg-[#0B1B3A] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base">Enter Marks — {gradingTest.title}</h3>
                <p className="text-xs text-amber-300">Total Marks: {gradingTest.total_marks}</p>
              </div>
              <button type="button" onClick={() => setGradingTest(null)} className="text-slate-300 cursor-pointer">
                Close
              </button>
            </div>
            <form onSubmit={submitMarks} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((s) => (
                  <div key={s.id} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-5">
                      <p className="text-sm font-semibold">{s.full_name}</p>
                      <p className="text-xs font-mono text-slate-500">{s.student_code}</p>
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        min={0}
                        max={gradingTest.total_marks}
                        step="0.5"
                        placeholder={`/${gradingTest.total_marks}`}
                        value={gradeInputs[s.id]?.obtainedMarks || ''}
                        onChange={(e) =>
                          setGradeInputs((p) => ({
                            ...p,
                            [s.id]: { ...(p[s.id] || { remarks: '' }), obtainedMarks: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Remarks (optional)"
                        value={gradeInputs[s.id]?.remarks || ''}
                        onChange={(e) =>
                          setGradeInputs((p) => ({
                            ...p,
                            [s.id]: { ...(p[s.id] || { obtainedMarks: '' }), remarks: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setGradingTest(null)}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1B3A] dark:bg-amber-500 text-white dark:text-slate-950 cursor-pointer"
                >
                  Save & Publish Results
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
