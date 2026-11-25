import type Database from 'better-sqlite3';

export interface AttendanceStats {
  totalDays: number;
  countedDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  percentage: number;
}

export function getAttendancePolicy(db: Database.Database): {
  lateCountsAsPresent: boolean;
  leaveExcluded: boolean;
} {
  const rows = db
    .prepare("SELECT key, value FROM school_settings WHERE key IN ('late_counts_as_present', 'leave_excluded_from_denominator')")
    .all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    lateCountsAsPresent: map.get('late_counts_as_present') !== '0',
    leaveExcluded: map.get('leave_excluded_from_denominator') !== '0',
  };
}

export function computeStudentAttendanceStats(db: Database.Database, studentId: number, monthPrefix?: string, yearPrefix?: string): AttendanceStats {
  let sql = 'SELECT status FROM attendance WHERE student_id = ?';
  const params: Array<string | number> = [studentId];

  if (monthPrefix) {
    sql += ' AND date LIKE ?';
    params.push(`${monthPrefix}%`);
  } else if (yearPrefix) {
    sql += ' AND date LIKE ?';
    params.push(`${yearPrefix}%`);
  }

  const rows = db.prepare(sql).all(...params) as Array<{ status: string }>;
  return summarizeAttendanceRows(db, rows);
}

export function summarizeAttendanceRows(db: Database.Database, rows: Array<{ status: string }>): AttendanceStats {
  const policy = getAttendancePolicy(db);
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let leaveDays = 0;

  for (const r of rows) {
    if (r.status === 'Present') presentDays++;
    else if (r.status === 'Absent') absentDays++;
    else if (r.status === 'Late') lateDays++;
    else if (r.status === 'Leave') leaveDays++;
  }

  const totalDays = rows.length;
  const countedDays = policy.leaveExcluded ? presentDays + absentDays + lateDays : totalDays;
  const effectivePresent = policy.lateCountsAsPresent ? presentDays + lateDays : presentDays;
  const percentage = countedDays > 0 ? Number(((effectivePresent / countedDays) * 100).toFixed(1)) : 0;

  return {
    totalDays,
    countedDays,
    presentDays,
    absentDays,
    lateDays,
    leaveDays,
    percentage,
  };
}

export function getStudentMonthlySeries(db: Database.Database, studentId: number) {
  const rows = db
    .prepare(
      `SELECT substr(date, 1, 7) as month, status
       FROM attendance
       WHERE student_id = ?
       ORDER BY month ASC`
    )
    .all(studentId) as Array<{ month: string; status: string }>;

  const byMonth = new Map<string, Array<{ status: string }>>();
  for (const row of rows) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month)!.push({ status: row.status });
  }

  return Array.from(byMonth.entries()).map(([month, items]) => {
    const stats = summarizeAttendanceRows(db, items);
    return {
      month,
      ...stats,
    };
  });
}

export function getStudentFullProfile(db: Database.Database, studentId: number) {
  const student = db
    .prepare(
      `SELECT s.*, u.username as student_username, u.is_active as user_active,
              c.name as class_name, c.class_code, c.section, c.room_number,
              pu.username as parent_username,
              tu.full_name as class_teacher_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN users pu ON pu.id = s.parent_user_id
       LEFT JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN users tu ON tu.id = t.user_id
       WHERE s.id = ?`
    )
    .get(studentId) as Record<string, unknown> | undefined;

  if (!student) return null;

  const overallStats = computeStudentAttendanceStats(db, studentId);
  const currentMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).slice(0, 7);
  const currentYear = currentMonth.slice(0, 4);

  const monthlyStats = computeStudentAttendanceStats(db, studentId, currentMonth);
  const yearlyStats = computeStudentAttendanceStats(db, studentId, undefined, currentYear);
  const monthlySeries = getStudentMonthlySeries(db, studentId);

  const attendanceRecords = db
    .prepare(
      `SELECT a.id, a.date, a.status, a.marked_at
       FROM attendance a
       WHERE a.student_id = ?
       ORDER BY a.date DESC
       LIMIT 60`
    )
    .all(studentId);

  const homeworkHistory = db
    .prepare(
      `SELECT h.*, u.full_name as teacher_name
       FROM homework h
       JOIN teachers t ON t.id = h.teacher_id
       JOIN users u ON u.id = t.user_id
       WHERE h.class_id = ? AND h.status = 'published'
       ORDER BY h.assigned_date DESC`
    )
    .all(student.class_id);

  const testResults = db
    .prepare(
      `SELECT tr.*, t.title as test_title, t.subject, t.test_type, t.test_date,
              (SELECT COUNT(*) + 1 FROM test_results tr2 WHERE tr2.test_id = tr.test_id AND tr2.obtained_marks > tr.obtained_marks) as class_position,
              (SELECT COUNT(*) FROM test_results tr3 WHERE tr3.test_id = tr.test_id) as total_appeared
       FROM test_results tr
       JOIN tests t ON t.id = tr.test_id
       WHERE tr.student_id = ?
       ORDER BY t.test_date DESC`
    )
    .all(studentId);

  const fees = db
    .prepare('SELECT * FROM fees WHERE student_id = ? ORDER BY year DESC, id DESC')
    .all(studentId);

  return {
    student,
    attendanceAnalytics: {
      overall: overallStats,
      monthly: monthlyStats,
      yearly: yearlyStats,
      monthlySeries,
    },
    attendanceRecords,
    homeworkHistory,
    testResults,
    fees,
  };
}

export function getClassRankings(db: Database.Database, classId?: number) {
  let studentSql = `
    SELECT s.id, s.student_code, s.full_name, s.photo_url, s.roll_number, s.class_id, c.name as class_name
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE s.status = 'active'
  `;
  const params: Array<number> = [];
  if (classId) {
    studentSql += ' AND s.class_id = ?';
    params.push(classId);
  }
  const students = db.prepare(studentSql).all(...params) as Array<{
    id: number;
    student_code: string;
    full_name: string;
    photo_url: string | null;
    roll_number: string;
    class_id: number;
    class_name: string;
  }>;

  const attendanceRanking = students
    .map((s) => {
      const stats = computeStudentAttendanceStats(db, s.id);
      return {
        ...s,
        attendancePercentage: stats.percentage,
        presentDays: stats.presentDays,
        lateDays: stats.lateDays,
        absentDays: stats.absentDays,
        countedDays: stats.countedDays,
      };
    })
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage || a.full_name.localeCompare(b.full_name))
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  const academicRanking = students
    .map((s) => {
      const agg = db
        .prepare(
          `SELECT COALESCE(SUM(obtained_marks), 0) as obtained, COALESCE(SUM(total_marks), 0) as total, COUNT(*) as testCount
           FROM test_results WHERE student_id = ?`
        )
        .get(s.id) as { obtained: number; total: number; testCount: number };
      const avgPct = agg.total > 0 ? Number(((agg.obtained / agg.total) * 100).toFixed(1)) : 0;
      return {
        ...s,
        academicPercentage: avgPct,
        obtainedMarks: agg.obtained,
        totalMarks: agg.total,
        testCount: agg.testCount,
      };
    })
    .sort((a, b) => b.academicPercentage - a.academicPercentage || a.full_name.localeCompare(b.full_name))
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  return { attendanceRanking, academicRanking };
}
