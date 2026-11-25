import React from 'react';
import { X, Download, User, Phone, BookOpen, Award, CalendarCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import type { StudentFullProfile } from '../types';
import { exportStudentIdCardPdf } from '../lib/exports';

interface StudentProfileModalProps {
  profile: StudentFullProfile | null;
  loading?: boolean;
  onClose: () => void;
}

export default function StudentProfileModal({ profile, loading, onClose }: StudentProfileModalProps) {
  if (!profile && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#0B1B3A] px-6 py-5 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            {profile && (
              <img
                src={profile.student.photo_url || '/src/assets/images/avatar_student_male_1795627463854.jpg'}
                alt={profile.student.full_name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-xl object-cover border-2 border-amber-400 shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-mono text-amber-300">
                {profile ? `${profile.student.student_code} · Roll #${profile.student.roll_number}` : 'Loading Student Profile...'}
              </p>
              <h2 className="text-xl font-bold font-display truncate">
                {profile ? profile.student.full_name : 'Student Record'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {profile && (
              <button
                type="button"
                onClick={() => exportStudentIdCardPdf(profile.student)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                ID Card PDF
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-300 hover:bg-white/10 cursor-pointer"
              aria-label="Close profile"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading || !profile ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading complete academic and attendance profile...</div>
          ) : (
            <>
              {/* Sections 1–4 & 13: Personal, ID, Class & Parent Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    <User className="w-3.5 h-3.5" />
                    Personal & ID Information
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Student ID (Immutable): <span className="font-mono font-semibold text-slate-900 dark:text-white">{profile.student.student_code}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Father’s Name: <span className="font-medium text-slate-900 dark:text-white">{profile.student.father_name}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Date of Birth: <span className="font-mono text-slate-900 dark:text-white">{profile.student.dob}</span> · {profile.student.gender}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Admission Date: <span className="font-mono text-slate-900 dark:text-white">{profile.student.admission_date}</span>
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    Class & Academic Info
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Class: <span className="font-semibold text-slate-900 dark:text-white">{profile.student.class_name} ({profile.student.section})</span> · {profile.student.class_code}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Roll Number: <span className="font-mono font-semibold text-slate-900 dark:text-white">{profile.student.roll_number}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Class Teacher: <span className="font-medium text-slate-900 dark:text-white">{profile.student.class_teacher_name || 'Assigned Faculty'}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Classroom: <span className="font-medium text-slate-900 dark:text-white">{profile.student.room_number || 'Main Block'}</span>
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    <Phone className="w-3.5 h-3.5" />
                    Parent / Guardian Information
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Guardian Name: <span className="font-semibold text-slate-900 dark:text-white">{profile.student.parent_name}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mobile Number: <span className="font-mono text-slate-900 dark:text-white">{profile.student.parent_mobile}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Parent Portal ID: <span className="font-mono text-slate-900 dark:text-white">{profile.student.parent_username || 'Linked'}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Student Portal ID: <span className="font-mono text-slate-900 dark:text-white">{profile.student.student_username || 'Active'}</span>
                  </p>
                </div>
              </div>

              {/* Sections 5–8: Attendance Analytics */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarCheck className="w-4 h-4 text-[#0B1B3A] dark:text-amber-400" />
                  <h3 className="font-display font-bold text-base text-[#0B1B3A] dark:text-white">
                    Attendance Analytics & Breakdown
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
                  {[
                    { label: 'Attendance %', val: `${profile.attendanceAnalytics.overall.percentage}%` },
                    { label: 'Counted Days', val: profile.attendanceAnalytics.overall.countedDays },
                    { label: 'Present Days', val: profile.attendanceAnalytics.overall.presentDays },
                    { label: 'Absent Days', val: profile.attendanceAnalytics.overall.absentDays },
                    { label: 'Late Days', val: profile.attendanceAnalytics.overall.lateDays },
                    { label: 'Monthly Avg', val: `${profile.attendanceAnalytics.monthly.percentage}%` },
                    { label: 'Yearly Avg', val: `${profile.attendanceAnalytics.yearly.percentage}%` },
                  ].map((m) => (
                    <div key={m.label} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.label}</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#0B1B3A] dark:text-white mt-0.5">
                        {m.val}
                      </p>
                    </div>
                  ))}
                </div>

                {profile.attendanceAnalytics.monthlySeries.length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-56">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      Monthly Attendance Percentage Trend
                    </p>
                    <ResponsiveContainer width="100%" height="85%">
                      <AreaChart data={profile.attendanceAnalytics.monthlySeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="percentage" stroke="#0B1B3A" fill="#D9A738" fillOpacity={0.25} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Sections 10–12: Test & Exam Results + Performance Analytics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4 text-amber-600" />
                    <h3 className="font-display font-bold text-sm text-[#0B1B3A] dark:text-white">
                      Test & Examination Results
                    </h3>
                  </div>
                  {profile.testResults.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">No graded test results recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                            <th className="py-2 pr-2">Assessment</th>
                            <th className="py-2 pr-2">Subject</th>
                            <th className="py-2 pr-2 text-right">Marks</th>
                            <th className="py-2 pr-2 text-right">%</th>
                            <th className="py-2 pr-2">Grade</th>
                            <th className="py-2 text-right">Pos.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {profile.testResults.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 pr-2 font-medium">{r.test_title}</td>
                              <td className="py-2 pr-2 text-slate-500">{r.subject}</td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">
                                {r.obtained_marks}/{r.total_marks}
                              </td>
                              <td className="py-2 pr-2 text-right font-mono tabular-nums">{r.percentage}%</td>
                              <td className="py-2 pr-2 font-semibold">{r.grade}</td>
                              <td className="py-2 text-right font-mono tabular-nums">
                                #{r.class_position}/{r.total_appeared}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-64">
                  <h3 className="font-display font-bold text-sm text-[#0B1B3A] dark:text-white mb-2">
                    Academic Performance Analytics
                  </h3>
                  {profile.testResults.length === 0 ? (
                    <p className="text-xs text-slate-500 py-10 text-center">Performance chart appears after test marks are entered.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="85%">
                      <BarChart data={profile.testResults}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                        <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="percentage" fill="#0B1B3A" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Sections 5 & 9: Recent Attendance Log & Homework History */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <h3 className="font-display font-bold text-sm text-[#0B1B3A] dark:text-white mb-3">
                    Recent Attendance Log
                  </h3>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {profile.attendanceRecords.map((a) => (
                      <div key={a.id} className="py-2 flex items-center justify-between">
                        <span className="font-mono text-slate-600 dark:text-slate-300">{a.date}</span>
                        <span
                          className={`font-semibold ${
                            a.status === 'Present'
                              ? 'text-emerald-600'
                              : a.status === 'Absent'
                              ? 'text-red-600'
                              : a.status === 'Late'
                              ? 'text-amber-600'
                              : 'text-blue-600'
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <h3 className="font-display font-bold text-sm text-[#0B1B3A] dark:text-white mb-3">
                    Homework History
                  </h3>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs space-y-2">
                    {profile.homeworkHistory.length === 0 ? (
                      <p className="text-slate-500 py-4 text-center">No homework assigned yet.</p>
                    ) : (
                      profile.homeworkHistory.map((h) => (
                        <div key={h.id} className="pt-2">
                          <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                            <span>{h.title}</span>
                            <span className="font-mono text-slate-500">{h.due_date}</span>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {h.subject} · {h.description}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
