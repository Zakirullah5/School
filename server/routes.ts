import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Express, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import type Database from 'better-sqlite3';
import {
  clearSessionCookie,
  hashPassword,
  requireAuth,
  requireRole,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  type AuthenticatedRequest,
  type UserRole,
} from './auth.ts';
import { getPktTimeInfo } from './time.ts';
import { createAndPushNotification, pushEventToUser } from './ws.ts';
import {
  computeStudentAttendanceStats,
  getClassRankings,
  getStudentFullProfile,
  summarizeAttendanceRows,
} from './analytics.ts';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx']);
const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF, DOC, DOCX.'));
      return;
    }
    cb(null, true);
  },
});

function writeAuditLog(
  db: Database.Database,
  actor: { userId: number; fullName: string; role: string },
  actionType: string,
  targetTable: string,
  targetId: string | number,
  oldValue: unknown,
  newValue: unknown,
  reason?: string
) {
  db.prepare(
    `INSERT INTO audit_logs (actor_user_id, actor_name, actor_role, action_type, target_table, target_id, old_value, new_value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actor.userId,
    actor.fullName,
    actor.role,
    actionType,
    targetTable,
    String(targetId),
    oldValue !== undefined && oldValue !== null ? JSON.stringify(oldValue) : null,
    newValue !== undefined && newValue !== null ? JSON.stringify(newValue) : null,
    reason || null
  );
}

function calcGrade(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
}

export function registerRoutes(app: Express, db: Database.Database): void {
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);

  // Safe file serving for uploaded student photos & homework files
  app.get('/uploads/:filename', (req, res) => {
    const rawName = path.basename(String(req.params.filename || ''));
    const resolved = path.resolve(UPLOAD_DIR, rawName);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.sendFile(resolved);
  });

  // Health & authoritative PKT clock
  app.get('/api/health', (_req, res) => {
    const pkt = getPktTimeInfo();
    const settingsRows = db.prepare('SELECT key, value FROM school_settings').all() as Array<{ key: string; value: string }>;
    const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));
    res.json({ ok: true, pkt, settings });
  });

  // ── AUTHENTICATION ───────────────────────────────────────────────────────────
  app.post('/api/auth/login', loginLimiter, (req, res) => {
    const { username, password, portalRole } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      res.status(400).json({ error: 'Username/ID and password are required.' });
      return;
    }

    const validRoles: UserRole[] = ['principal', 'teacher', 'student', 'parent'];
    if (portalRole && !validRoles.includes(portalRole)) {
      res.status(400).json({ error: 'Invalid login portal.' });
      return;
    }

    const cleanInput = username.trim();
    // Allow login by username OR student_code OR teacher_code OR parent_code OR principal_code
    let user = db
      .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
      .get(cleanInput) as Record<string, any> | undefined;

    if (!user) {
      user = db
        .prepare(
          `SELECT u.* FROM users u
           LEFT JOIN students s ON s.user_id = u.id
           LEFT JOIN teachers t ON t.user_id = u.id
           LEFT JOIN parents p ON p.user_id = u.id
           LEFT JOIN principals pr ON pr.user_id = u.id
           WHERE LOWER(s.student_code) = LOWER(?)
              OR LOWER(t.teacher_code) = LOWER(?)
              OR LOWER(p.parent_code) = LOWER(?)
              OR LOWER(pr.principal_code) = LOWER(?)`
        )
        .get(cleanInput, cleanInput, cleanInput, cleanInput) as Record<string, any> | undefined;
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials. Please check your ID/username and password.' });
      return;
    }

    if (portalRole && user.role !== portalRole) {
      res.status(403).json({
        error: `This account belongs to the ${user.role.toUpperCase()} portal. Please sign in through the ${user.role} login portal.`,
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'This account has been deactivated by the Principal.' });
      return;
    }

    if (user.role === 'teacher') {
      const teacherRow = db.prepare('SELECT status FROM teachers WHERE user_id = ?').get(user.id) as { status: string } | undefined;
      if (teacherRow && teacherRow.status !== 'active') {
        res.status(403).json({ error: 'Teacher account is currently inactive.' });
        return;
      }
    }

    const token = signSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    setSessionCookie(req, res, token);
    writeAuditLog(db, { userId: user.id, fullName: user.full_name, role: user.role }, 'LOGIN', 'users', user.id, null, { portalRole: user.role });

    res.json({
      token,
      user: buildUserSessionProfile(db, user),
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth!.userId) as Record<string, any> | undefined;
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'Session invalid or deactivated.' });
      return;
    }
    const pkt = getPktTimeInfo();
    const unreadRow = db
      .prepare('SELECT COUNT(*) as count FROM notifications WHERE recipient_user_id = ? AND is_read = 0')
      .get(user.id) as { count: number };

    res.json({
      user: buildUserSessionProfile(db, user),
      pkt,
      unreadNotifications: unreadRow.count,
    });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.auth!.userId) as Record<string, any> | undefined;
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (newPassword === 'Ali' && user.role === 'principal') {
      res.status(400).json({ error: 'Please choose a strong new password different from the default demo password.' });
      return;
    }

    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(
      hashPassword(newPassword),
      user.id
    );
    writeAuditLog(
      db,
      { userId: user.id, fullName: user.full_name, role: user.role },
      'PASSWORD_CHANGED',
      'users',
      user.id,
      null,
      { changed: true }
    );
    res.json({ ok: true, message: 'Password updated securely.' });
  });

  app.put('/api/auth/preferences', requireAuth, (req: AuthenticatedRequest, res) => {
    const { soundAlerts, pushEnabled } = req.body || {};
    db.prepare('UPDATE users SET sound_alerts = ?, push_enabled = ? WHERE id = ?').run(
      soundAlerts ? 1 : 0,
      pushEnabled ? 1 : 0,
      req.auth!.userId
    );
    res.json({ ok: true });
  });

  // File Upload endpoint (Principal & Teacher)
  app.post(
    '/api/upload',
    requireAuth,
    requireRole('principal', 'teacher'),
    (req: AuthenticatedRequest, res: Response) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err) {
          const msg = err instanceof Error ? err.message : 'File upload failed';
          res.status(400).json({ error: msg });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: 'No file attached.' });
          return;
        }
        res.json({
          url: `/uploads/${req.file.filename}`,
          originalName: req.file.originalname,
          size: req.file.size,
        });
      });
    }
  );

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────────
  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const list = db
      .prepare('SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY id DESC LIMIT 100')
      .all(req.auth!.userId);
    res.json({ notifications: list });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?').run(
      Number(req.params.id),
      req.auth!.userId
    );
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?').run(req.auth!.userId);
    res.json({ ok: true });
  });

  // ── SHARED CALENDAR / ANNOUNCEMENTS / TIMETABLE ──────────────────────────────
  app.get('/api/announcements', requireAuth, (req: AuthenticatedRequest, res) => {
    const role = req.auth!.role;
    const rows =
      role === 'principal'
        ? db
            .prepare(
              `SELECT a.*, u.full_name as author_name FROM announcements a
               JOIN users u ON u.id = a.created_by ORDER BY a.id DESC`
            )
            .all()
        : db
            .prepare(
              `SELECT a.*, u.full_name as author_name FROM announcements a
               JOIN users u ON u.id = a.created_by
               WHERE a.target_role IN ('all', ?) ORDER BY a.id DESC`
            )
            .all(role);
    res.json({ announcements: rows });
  });

  app.get('/api/holidays', requireAuth, (_req, res) => {
    const holidays = db.prepare('SELECT * FROM holidays ORDER BY date ASC').all();
    res.json({ holidays });
  });

  app.get('/api/timetable', requireAuth, (req: AuthenticatedRequest, res) => {
    const role = req.auth!.role;
    const requestedClassId = req.query.classId ? Number(req.query.classId) : undefined;
    let classId = requestedClassId;

    if (role === 'teacher') {
      const teacher = db.prepare('SELECT id FROM teachers WHERE user_id = ?').get(req.auth!.userId) as { id: number } | undefined;
      const cls = teacher
        ? (db.prepare('SELECT id FROM classes WHERE teacher_id = ?').get(teacher.id) as { id: number } | undefined)
        : undefined;
      classId = cls?.id;
    } else if (role === 'student') {
      const st = db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(req.auth!.userId) as { class_id: number } | undefined;
      classId = st?.class_id;
    } else if (role === 'parent') {
      const st = db.prepare('SELECT class_id FROM students WHERE parent_user_id = ?').get(req.auth!.userId) as { class_id: number } | undefined;
      classId = st?.class_id;
    }

    const rows = classId
      ? db
          .prepare(
            `SELECT tt.*, c.name as class_name FROM timetable tt
             JOIN classes c ON c.id = tt.class_id
             WHERE tt.class_id = ? ORDER BY tt.id ASC`
          )
          .all(classId)
      : db
          .prepare(
            `SELECT tt.*, c.name as class_name FROM timetable tt
             JOIN classes c ON c.id = tt.class_id ORDER BY c.id ASC, tt.id ASC`
          )
          .all();

    res.json({ timetable: rows });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PRINCIPAL ROUTES
  // ═════════════════════════════════════════════════════════════════════════════
  app.get('/api/principal/overview', requireAuth, requireRole('principal'), (_req, res) => {
    const pkt = getPktTimeInfo();
    const today = pkt.date;

    const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM students WHERE status = 'active'").get() as { c: number }).c;
    const totalTeachers = (db.prepare("SELECT COUNT(*) as c FROM teachers WHERE status = 'active'").get() as { c: number }).c;
    const totalClasses = (db.prepare('SELECT COUNT(*) as c FROM classes').get() as { c: number }).c;

    const todayAttendance = db
      .prepare('SELECT status, COUNT(*) as c FROM attendance WHERE date = ? GROUP BY status')
      .all(today) as Array<{ status: string; c: number }>;
    const todayMap = new Map(todayAttendance.map((r) => [r.status, r.c]));
    const todayPresent = (todayMap.get('Present') || 0) + (todayMap.get('Late') || 0);
    const todayAbsent = todayMap.get('Absent') || 0;

    const allAttendanceRows = db.prepare('SELECT status FROM attendance').all() as Array<{ status: string }>;
    const overallAttendance = summarizeAttendanceRows(db, allAttendanceRows);

    const tAttendance = db
      .prepare('SELECT status, COUNT(*) as c FROM teacher_attendance WHERE date = ? GROUP BY status')
      .all(today) as Array<{ status: string; c: number }>;
    const tMap = new Map(tAttendance.map((r) => [r.status, r.c]));
    const teachersPresentToday = (tMap.get('Present') || 0) + (tMap.get('Late') || 0);
    const teachersAbsentToday = (tMap.get('Absent') || 0) + (tMap.get('Leave') || 0);

    const submittedClassRows = db
      .prepare('SELECT class_id FROM attendance_submissions WHERE date = ?')
      .all(today) as Array<{ class_id: number }>;
    const submittedSet = new Set(submittedClassRows.map((r) => r.class_id));

    const classesWithStatus = db
      .prepare(
        `SELECT c.id, c.class_code, c.name, c.section, u.full_name as teacher_name,
                (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') as student_count
         FROM classes c
         LEFT JOIN teachers t ON t.id = c.teacher_id
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY c.id ASC`
      )
      .all() as Array<Record<string, any>>;

    const pendingSubmissions = classesWithStatus.filter((c) => !submittedSet.has(c.id));

    // Monthly attendance overview (daily trend for last 14 recorded school days)
    const dailySeriesRaw = db
      .prepare(
        `SELECT date,
                SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) as leave_count,
                COUNT(*) as total
         FROM attendance
         GROUP BY date
         ORDER BY date DESC
         LIMIT 14`
      )
      .all() as Array<{ date: string; present: number; absent: number; leave_count: number; total: number }>;

    const monthlyOverview = dailySeriesRaw.reverse().map((d) => ({
      date: d.date,
      label: d.date.slice(5),
      present: d.present,
      absent: d.absent,
      leave: d.leave_count,
      rate: d.total > 0 ? Number(((d.present / (d.present + d.absent || 1)) * 100).toFixed(1)) : 0,
    }));

    // Class-wise attendance summary
    const classComparison = classesWithStatus.map((c) => {
      const cRows = db.prepare('SELECT status FROM attendance WHERE class_id = ?').all(c.id) as Array<{ status: string }>;
      const stats = summarizeAttendanceRows(db, cRows);
      return {
        id: c.id,
        class_code: c.class_code,
        name: c.name,
        teacher_name: c.teacher_name || 'Unassigned',
        student_count: c.student_count,
        submittedToday: submittedSet.has(c.id),
        percentage: stats.percentage,
      };
    });

    const pendingCorrectionsCount = (
      db.prepare("SELECT COUNT(*) as c FROM attendance_correction_requests WHERE status = 'pending'").get() as { c: number }
    ).c;

    res.json({
      pkt,
      kpis: {
        totalStudents,
        totalTeachers,
        totalClasses,
        todayPresent,
        todayAbsent,
        overallAttendancePct: overallAttendance.percentage,
        teachersPresentToday,
        teachersAbsentToday,
        pendingSubmissionsCount: pendingSubmissions.length,
        pendingCorrectionsCount,
      },
      pendingSubmissions,
      monthlyOverview,
      classComparison,
    });
  });

  // Classes Management
  app.get('/api/principal/classes', requireAuth, requireRole('principal'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*, u.full_name as teacher_name, t.teacher_code,
                (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.status = 'active') as student_count
         FROM classes c
         LEFT JOIN teachers t ON t.id = c.teacher_id
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY c.id ASC`
      )
      .all() as Array<Record<string, any>>;

    const enriched = rows.map((c) => {
      const attRows = db.prepare('SELECT status FROM attendance WHERE class_id = ?').all(c.id) as Array<{ status: string }>;
      const stats = summarizeAttendanceRows(db, attRows);
      const testAgg = db
        .prepare(
          `SELECT COALESCE(AVG(tr.percentage), 0) as avg_score
           FROM test_results tr
           JOIN students s ON s.id = tr.student_id
           WHERE s.class_id = ?`
        )
        .get(c.id) as { avg_score: number };
      return {
        ...c,
        attendancePercentage: stats.percentage,
        academicAverage: Number((testAgg.avg_score || 0).toFixed(1)),
      };
    });

    res.json({ classes: enriched });
  });

  app.post('/api/principal/classes', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const { classCode, name, section, roomNumber, teacherId } = req.body || {};
    if (typeof classCode !== 'string' || typeof name !== 'string' || !classCode.trim() || !name.trim()) {
      res.status(400).json({ error: 'Unique Class ID and Class Name are required.' });
      return;
    }

    const dup = db.prepare('SELECT id FROM classes WHERE LOWER(class_code) = LOWER(?)').get(classCode.trim());
    if (dup) {
      res.status(409).json({ error: `Class ID "${classCode.trim()}" already exists.` });
      return;
    }

    const activeSession = db.prepare('SELECT id FROM academic_sessions WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined;
    const result = db
      .prepare(
        `INSERT INTO classes (class_code, name, section, room_number, teacher_id, academic_session_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        classCode.trim().toUpperCase(),
        name.trim(),
        (section || 'A').trim(),
        roomNumber ? String(roomNumber).trim() : null,
        teacherId ? Number(teacherId) : null,
        activeSession?.id || null
      );

    const newId = Number(result.lastInsertRowid);
    writeAuditLog(
      db,
      { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
      'CLASS_CREATED',
      'classes',
      newId,
      null,
      { classCode: classCode.trim().toUpperCase(), name: name.trim(), teacherId }
    );
    res.status(201).json({ id: newId });
  });

  app.put('/api/principal/classes/:id', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const classId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as Record<string, any> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Class not found.' });
      return;
    }
    const { name, section, roomNumber, teacherId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Class name is required.' });
      return;
    }
    db.prepare('UPDATE classes SET name = ?, section = ?, room_number = ?, teacher_id = ? WHERE id = ?').run(
      name.trim(),
      (section || existing.section).trim(),
      roomNumber !== undefined ? String(roomNumber).trim() : existing.room_number,
      teacherId !== undefined ? (teacherId ? Number(teacherId) : null) : existing.teacher_id,
      classId
    );
    writeAuditLog(
      db,
      { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
      'CLASS_UPDATED',
      'classes',
      classId,
      { name: existing.name, teacher_id: existing.teacher_id },
      { name: name.trim(), teacher_id: teacherId }
    );
    res.json({ ok: true });
  });

  // Subjects Management
  app.get('/api/principal/subjects', requireAuth, requireRole('principal'), (_req, res) => {
    const subjects = db
      .prepare(
        `SELECT sub.*, c.name as class_name, c.class_code
         FROM subjects sub JOIN classes c ON c.id = sub.class_id ORDER BY c.id ASC, sub.name ASC`
      )
      .all();
    res.json({ subjects });
  });

  app.post('/api/principal/subjects', requireAuth, requireRole('principal'), (req, res) => {
    const { code, name, classId } = req.body || {};
    if (!code?.trim() || !name?.trim() || !classId) {
      res.status(400).json({ error: 'Subject code, name, and class are required.' });
      return;
    }
    try {
      const r = db
        .prepare('INSERT INTO subjects (code, name, class_id) VALUES (?, ?, ?)')
        .run(code.trim().toUpperCase(), name.trim(), Number(classId));
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch {
      res.status(409).json({ error: 'Subject code already exists for this class.' });
    }
  });

  app.delete('/api/principal/subjects/:id', requireAuth, requireRole('principal'), (req, res) => {
    db.prepare('DELETE FROM subjects WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Teacher Management (ONLY Principal)
  app.get('/api/principal/teachers', requireAuth, requireRole('principal'), (_req, res) => {
    const pkt = getPktTimeInfo();
    const teachers = db
      .prepare(
        `SELECT t.*, u.username, u.full_name, u.is_active, u.avatar_url,
                GROUP_CONCAT(c.name || ' (' || c.class_code || ')', ', ') as assigned_classes,
                (SELECT COUNT(*) FROM attendance_submissions sub WHERE sub.teacher_id = t.id) as submission_count,
                (SELECT status FROM teacher_attendance ta WHERE ta.teacher_id = t.id AND ta.date = ?) as today_status
         FROM teachers t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN classes c ON c.teacher_id = t.id
         GROUP BY t.id
         ORDER BY t.id ASC`
      )
      .all(pkt.date);
    res.json({ teachers });
  });

  app.post('/api/principal/teachers', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const { fullName, username, password, subjectSpecialty, phone, qualification, classId } = req.body || {};
    if (!fullName?.trim() || !username?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Full name, username, and password (min 6 chars) are required.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
    if (existingUser) {
      res.status(409).json({ error: `Username "${username.trim()}" is already taken.` });
      return;
    }

    const countRow = db.prepare('SELECT COUNT(*) as c FROM teachers').get() as { c: number };
    const teacherCode = `TCH-2026-${String(countRow.c + 1).padStart(3, '0')}`;
    const today = getPktTimeInfo().date;

    const tx = db.transaction(() => {
      const uRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, avatar_url)
           VALUES (?, ?, 'teacher', ?, 1, '/src/assets/images/avatar_teacher_portrait_1795627465105.jpg')`
        )
        .run(username.trim(), hashPassword(password), fullName.trim());
      const userId = Number(uRes.lastInsertRowid);

      const tRes = db
        .prepare(
          `INSERT INTO teachers (user_id, teacher_code, subject_specialty, phone, qualification, joining_date, status)
           VALUES (?, ?, ?, ?, ?, ?, 'active')`
        )
        .run(
          userId,
          teacherCode,
          (subjectSpecialty || 'General').trim(),
          phone ? String(phone).trim() : null,
          qualification ? String(qualification).trim() : null,
          today
        );
      const teacherId = Number(tRes.lastInsertRowid);

      if (classId) {
        db.prepare('UPDATE classes SET teacher_id = ? WHERE id = ?').run(teacherId, Number(classId));
      }

      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
        'TEACHER_CREATED',
        'teachers',
        teacherId,
        null,
        { teacherCode, username: username.trim(), fullName: fullName.trim() }
      );
      return { teacherId, teacherCode };
    });

    const created = tx();
    res.status(201).json(created);
  });

  app.put('/api/principal/teachers/:id', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const teacherId = Number(req.params.id);
    const teacher = db
      .prepare('SELECT t.*, u.full_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.id = ?')
      .get(teacherId) as Record<string, any> | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    const { fullName, subjectSpecialty, phone, qualification, classId } = req.body || {};
    db.transaction(() => {
      if (fullName?.trim()) {
        db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(fullName.trim(), teacher.user_id);
      }
      db.prepare('UPDATE teachers SET subject_specialty = ?, phone = ?, qualification = ? WHERE id = ?').run(
        (subjectSpecialty || teacher.subject_specialty).trim(),
        phone !== undefined ? phone : teacher.phone,
        qualification !== undefined ? qualification : teacher.qualification,
        teacherId
      );
      if (classId !== undefined) {
        db.prepare('UPDATE classes SET teacher_id = NULL WHERE teacher_id = ?').run(teacherId);
        if (classId) {
          db.prepare('UPDATE classes SET teacher_id = ? WHERE id = ?').run(teacherId, Number(classId));
        }
      }
      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
        'TEACHER_UPDATED',
        'teachers',
        teacherId,
        { fullName: teacher.full_name, subjectSpecialty: teacher.subject_specialty },
        { fullName, subjectSpecialty, classId }
      );
    })();
    res.json({ ok: true });
  });

  app.post('/api/principal/teachers/:id/reset-password', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const teacherId = Number(req.params.id);
    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const teacher = db.prepare('SELECT user_id FROM teachers WHERE id = ?').get(teacherId) as { user_id: number } | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(
      hashPassword(newPassword),
      teacher.user_id
    );
    writeAuditLog(
      db,
      { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
      'TEACHER_PASSWORD_RESET',
      'teachers',
      teacherId,
      null,
      { reset: true }
    );
    res.json({ ok: true });
  });

  app.post('/api/principal/teachers/:id/toggle-status', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const teacherId = Number(req.params.id);
    const teacher = db.prepare('SELECT user_id, status FROM teachers WHERE id = ?').get(teacherId) as
      | { user_id: number; status: string }
      | undefined;
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }
    const nextStatus = teacher.status === 'active' ? 'inactive' : 'active';
    const nextActive = nextStatus === 'active' ? 1 : 0;
    db.prepare('UPDATE teachers SET status = ? WHERE id = ?').run(nextStatus, teacherId);
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextActive, teacher.user_id);
    writeAuditLog(
      db,
      { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
      'TEACHER_STATUS_CHANGED',
      'teachers',
      teacherId,
      { status: teacher.status },
      { status: nextStatus }
    );
    res.json({ ok: true, status: nextStatus });
  });

  // Teacher Attendance Management
  app.get('/api/principal/teacher-attendance', requireAuth, requireRole('principal'), (req, res) => {
    const date = String(req.query.date || getPktTimeInfo().date);
    const rows = db
      .prepare(
        `SELECT t.id as teacher_id, t.teacher_code, u.full_name, t.subject_specialty,
                ta.status, ta.check_in_time, ta.notes
         FROM teachers t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN teacher_attendance ta ON ta.teacher_id = t.id AND ta.date = ?
         WHERE t.status = 'active'
         ORDER BY t.id ASC`
      )
      .all(date);
    res.json({ date, records: rows });
  });

  app.post('/api/principal/teacher-attendance', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const { date, records } = req.body || {};
    if (!date || !Array.isArray(records)) {
      res.status(400).json({ error: 'Date and teacher records are required.' });
      return;
    }
    const stmt = db.prepare(
      `INSERT INTO teacher_attendance (teacher_id, date, status, check_in_time, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(teacher_id, date) DO UPDATE SET status = excluded.status, check_in_time = excluded.check_in_time, notes = excluded.notes`
    );
    db.transaction(() => {
      for (const r of records) {
        stmt.run(Number(r.teacherId), date, r.status, r.checkInTime || null, r.notes || null, req.auth!.userId);
      }
    })();
    res.json({ ok: true });
  });

  // Principal Attendance Monitoring
  app.get('/api/principal/attendance', requireAuth, requireRole('principal'), (req, res) => {
    const pkt = getPktTimeInfo();
    const date = req.query.date ? String(req.query.date) : pkt.date;
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const month = req.query.month ? String(req.query.month) : undefined; // YYYY-MM
    const year = req.query.year ? String(req.query.year) : undefined; // YYYY
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    let subSql = `
      SELECT sub.*, c.name as class_name, c.class_code, u.full_name as teacher_name
      FROM attendance_submissions sub
      JOIN classes c ON c.id = sub.class_id
      JOIN teachers t ON t.id = sub.teacher_id
      JOIN users u ON u.id = t.user_id
      WHERE 1=1
    `;
    const subParams: Array<string | number> = [];
    if (classId) {
      subSql += ' AND sub.class_id = ?';
      subParams.push(classId);
    }
    if (month) {
      subSql += ' AND sub.date LIKE ?';
      subParams.push(`${month}%`);
    } else if (year) {
      subSql += ' AND sub.date LIKE ?';
      subParams.push(`${year}%`);
    } else if (date) {
      subSql += ' AND sub.date = ?';
      subParams.push(date);
    }
    subSql += ' ORDER BY sub.date DESC, c.id ASC';
    const submissions = db.prepare(subSql).all(...subParams);

    let regSql = `
      SELECT a.id, a.date, a.status, a.marked_at,
             s.id as student_id, s.student_code, s.full_name, s.roll_number, s.photo_url, s.parent_mobile,
             c.id as class_id, c.name as class_name, c.class_code
      FROM attendance a
      JOIN students s ON s.id = a.student_id
      JOIN classes c ON c.id = a.class_id
      WHERE 1=1
    `;
    const regParams: Array<string | number> = [];
    if (classId) {
      regSql += ' AND a.class_id = ?';
      regParams.push(classId);
    }
    if (month) {
      regSql += ' AND a.date LIKE ?';
      regParams.push(`${month}%`);
    } else if (year) {
      regSql += ' AND a.date LIKE ?';
      regParams.push(`${year}%`);
    } else if (date) {
      regSql += ' AND a.date = ?';
      regParams.push(date);
    }
    regSql += ' ORDER BY a.date DESC, c.id ASC, CAST(s.roll_number AS INTEGER) ASC';
    let records = db.prepare(regSql).all(...regParams) as Array<Record<string, any>>;

    if (search) {
      records = records.filter(
        (r) =>
          String(r.full_name).toLowerCase().includes(search) ||
          String(r.student_code).toLowerCase().includes(search) ||
          String(r.roll_number).toLowerCase().includes(search)
      );
    }

    const absentStudents = records.filter((r) => r.status === 'Absent');
    const summary = summarizeAttendanceRows(
      db,
      records.map((r) => ({ status: String(r.status) }))
    );

    res.json({ pkt, submissions, records, absentStudents, summary });
  });

  // Attendance Correction Requests & Audit Logs
  app.get('/api/principal/correction-requests', requireAuth, requireRole('principal'), (_req, res) => {
    const requests = db
      .prepare(
        `SELECT cr.*, s.full_name as student_name, s.student_code, s.roll_number,
                c.name as class_name, u.full_name as teacher_name,
                ru.full_name as reviewer_name
         FROM attendance_correction_requests cr
         JOIN students s ON s.id = cr.student_id
         JOIN classes c ON c.id = cr.class_id
         JOIN teachers t ON t.id = cr.requested_by_teacher_id
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users ru ON ru.id = cr.reviewed_by
         ORDER BY CASE WHEN cr.status = 'pending' THEN 0 ELSE 1 END, cr.id DESC`
      )
      .all();
    res.json({ requests });
  });

  app.post(
    '/api/principal/correction-requests/:id/review',
    requireAuth,
    requireRole('principal'),
    (req: AuthenticatedRequest, res) => {
      const reqId = Number(req.params.id);
      const { decision, reviewNotes } = req.body || {};
      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({ error: 'Decision must be approved or rejected.' });
        return;
      }

      const cr = db
        .prepare(
          `SELECT cr.*, s.full_name as student_name, s.user_id as student_user_id, s.parent_user_id,
                  c.name as class_name, t.user_id as teacher_user_id
           FROM attendance_correction_requests cr
           JOIN students s ON s.id = cr.student_id
           JOIN classes c ON c.id = cr.class_id
           JOIN teachers t ON t.id = cr.requested_by_teacher_id
           WHERE cr.id = ?`
        )
        .get(reqId) as Record<string, any> | undefined;

      if (!cr) {
        res.status(404).json({ error: 'Correction request not found.' });
        return;
      }
      if (cr.status !== 'pending') {
        res.status(400).json({ error: 'Correction request has already been reviewed.' });
        return;
      }

      const nowStr = getPktTimeInfo();
      const reviewedAt = `${nowStr.date} ${nowStr.time} PKT`;

      db.transaction(() => {
        db.prepare(
          `UPDATE attendance_correction_requests
           SET status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?
           WHERE id = ?`
        ).run(decision, req.auth!.userId, reviewedAt, reviewNotes || null, reqId);

        if (decision === 'approved') {
          db.prepare('UPDATE attendance SET status = ? WHERE id = ?').run(cr.requested_status, cr.attendance_id);

          // Recalculate submission counts for that class/date
          const counts = db
            .prepare(
              `SELECT
                 COUNT(*) as total,
                 SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as p,
                 SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as a,
                 SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as l,
                 SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) as lv
               FROM attendance WHERE class_id = ? AND date = ?`
            )
            .get(cr.class_id, cr.date) as { total: number; p: number; a: number; l: number; lv: number };

          db.prepare(
            `UPDATE attendance_submissions
             SET total_students = ?, present_count = ?, absent_count = ?, late_count = ?, leave_count = ?
             WHERE class_id = ? AND date = ?`
          ).run(counts.total, counts.p, counts.a, counts.l, counts.lv, cr.class_id, cr.date);
        }

        writeAuditLog(
          db,
          { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
          decision === 'approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
          'attendance',
          cr.attendance_id,
          { student: cr.student_name, date: cr.date, status: cr.old_status },
          { student: cr.student_name, date: cr.date, status: decision === 'approved' ? cr.requested_status : cr.old_status },
          cr.reason + (reviewNotes ? ` | Principal note: ${reviewNotes}` : '')
        );
      })();

      // Real-time notifications
      createAndPushNotification(db, {
        recipientUserId: cr.teacher_user_id,
        type: 'correction_reviewed',
        title: `Attendance Correction ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your correction request for ${cr.student_name} (${cr.date}: ${cr.old_status} → ${cr.requested_status}) was ${decision}.`,
        linkTab: 'attendance',
      });

      if (decision === 'approved' && cr.parent_user_id) {
        createAndPushNotification(db, {
          recipientUserId: cr.parent_user_id,
          type: 'attendance_updated',
          title: 'Attendance Record Updated',
          message: `Principal approved an attendance update for ${cr.student_name} on ${cr.date}: now marked ${cr.requested_status}.`,
          linkTab: 'attendance',
        });
        pushEventToUser(cr.parent_user_id, 'attendance:updated', { studentId: cr.student_id, date: cr.date, status: cr.requested_status });
      }

      res.json({ ok: true });
    }
  );

  app.get('/api/principal/audit-logs', requireAuth, requireRole('principal'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
    res.json({ logs });
  });

  // Principal Student Directory, Profile & Promotion
  app.get('/api/principal/students', requireAuth, requireRole('principal'), (req, res) => {
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    let sql = `
      SELECT s.*, c.name as class_name, c.class_code, u.username as student_username, pu.username as parent_username
      FROM students s
      JOIN classes c ON c.id = s.class_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN users pu ON pu.id = s.parent_user_id
      WHERE 1=1
    `;
    const params: Array<number> = [];
    if (classId) {
      sql += ' AND s.class_id = ?';
      params.push(classId);
    }
    sql += ' ORDER BY c.id ASC, CAST(s.roll_number AS INTEGER) ASC';
    let students = db.prepare(sql).all(...params) as Array<Record<string, any>>;

    if (search) {
      students = students.filter(
        (s) =>
          String(s.full_name).toLowerCase().includes(search) ||
          String(s.student_code).toLowerCase().includes(search) ||
          String(s.roll_number).toLowerCase().includes(search)
      );
    }

    const enriched = students.map((s) => {
      const stats = computeStudentAttendanceStats(db, s.id);
      return { ...s, attendancePercentage: stats.percentage };
    });

    res.json({ students: enriched });
  });

  app.get('/api/principal/students/:id', requireAuth, requireRole('principal'), (req, res) => {
    const profile = getStudentFullProfile(db, Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    res.json(profile);
  });

  app.post('/api/principal/students/promote', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const { studentIds, targetClassId } = req.body || {};
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !targetClassId) {
      res.status(400).json({ error: 'Select students and a target class.' });
      return;
    }
    const targetClass = db.prepare('SELECT * FROM classes WHERE id = ?').get(Number(targetClassId)) as Record<string, any> | undefined;
    if (!targetClass) {
      res.status(404).json({ error: 'Target class not found.' });
      return;
    }

    db.transaction(() => {
      for (const sid of studentIds) {
        const st = db.prepare('SELECT id, class_id, full_name FROM students WHERE id = ?').get(Number(sid)) as
          | { id: number; class_id: number; full_name: string }
          | undefined;
        if (!st) continue;
        // Generate next available roll number in target class
        const maxRollRow = db
          .prepare('SELECT MAX(CAST(roll_number AS INTEGER)) as maxRoll FROM students WHERE class_id = ?')
          .get(targetClass.id) as { maxRoll: number | null };
        const nextRoll = String((maxRollRow.maxRoll || 0) + 1).padStart(2, '0');
        db.prepare('UPDATE students SET class_id = ?, roll_number = ? WHERE id = ?').run(
          targetClass.id,
          nextRoll,
          st.id
        );
        writeAuditLog(
          db,
          { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
          'STUDENT_PROMOTED',
          'students',
          st.id,
          { class_id: st.class_id },
          { class_id: targetClass.id, class_name: targetClass.name, roll_number: nextRoll }
        );
      }
    })();

    res.json({ ok: true });
  });

  // Principal Advanced Analytics
  app.get('/api/principal/analytics', requireAuth, requireRole('principal'), (req, res) => {
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const month = req.query.month ? String(req.query.month) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;
    const subject = req.query.subject ? String(req.query.subject) : undefined;

    let attWhere = 'WHERE 1=1';
    const attParams: Array<string | number> = [];
    if (classId) {
      attWhere += ' AND class_id = ?';
      attParams.push(classId);
    }
    if (month) {
      attWhere += ' AND date LIKE ?';
      attParams.push(`${month}%`);
    } else if (year) {
      attWhere += ' AND date LIKE ?';
      attParams.push(`${year}%`);
    }

    const dailyChart = db
      .prepare(
        `SELECT date,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late,
                SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) as leave_count
         FROM attendance ${attWhere}
         GROUP BY date ORDER BY date ASC LIMIT 30`
      )
      .all(...attParams);

    const monthlyChart = db
      .prepare(
        `SELECT substr(date, 1, 7) as month,
                SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                COUNT(*) as total
         FROM attendance ${attWhere}
         GROUP BY substr(date, 1, 7) ORDER BY month ASC`
      )
      .all(...attParams);

    const yearlyChart = db
      .prepare(
        `SELECT substr(date, 1, 4) as year,
                SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
                COUNT(*) as total
         FROM attendance ${attWhere}
         GROUP BY substr(date, 1, 4) ORDER BY year ASC`
      )
      .all(...attParams);

    const classWise = db
      .prepare(
        `SELECT c.id, c.name, c.class_code,
                SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent,
                COUNT(a.id) as total
         FROM classes c
         LEFT JOIN attendance a ON a.class_id = c.id
         GROUP BY c.id ORDER BY c.id ASC`
      )
      .all() as Array<Record<string, any>>;

    const classComparison = classWise.map((c) => ({
      name: `Class ${c.name}`,
      class_code: c.class_code,
      percentage: c.total > 0 ? Number(((c.present / (c.present + c.absent || 1)) * 100).toFixed(1)) : 0,
      present: c.present || 0,
      absent: c.absent || 0,
    }));

    const teacherAttendanceStats = db
      .prepare(
        `SELECT u.full_name as teacher_name, t.teacher_code,
                SUM(CASE WHEN ta.status IN ('Present','Late') THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN ta.status IN ('Absent','Leave') THEN 1 ELSE 0 END) as absent,
                COUNT(ta.id) as total
         FROM teachers t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN teacher_attendance ta ON ta.teacher_id = t.id
         GROUP BY t.id`
      )
      .all();

    let testSql = `
      SELECT t.id, t.title, t.subject, t.test_date, c.name as class_name,
             ROUND(AVG(tr.percentage), 1) as avg_percentage,
             MAX(tr.percentage) as top_percentage,
             COUNT(tr.id) as graded_count
      FROM tests t
      JOIN classes c ON c.id = t.class_id
      LEFT JOIN test_results tr ON tr.test_id = t.id
      WHERE 1=1
    `;
    const testParams: Array<string | number> = [];
    if (classId) {
      testSql += ' AND t.class_id = ?';
      testParams.push(classId);
    }
    if (subject) {
      testSql += ' AND t.subject = ?';
      testParams.push(subject);
    }
    testSql += ' GROUP BY t.id ORDER BY t.test_date DESC';
    const testPerformance = db.prepare(testSql).all(...testParams);

    const homeworkStats = db
      .prepare(
        `SELECT c.name as class_name, h.subject, COUNT(*) as assigned_count
         FROM homework h
         JOIN classes c ON c.id = h.class_id
         WHERE h.status = 'published'
         GROUP BY c.id, h.subject`
      )
      .all();

    const rankings = getClassRankings(db, classId);

    res.json({
      dailyChart,
      monthlyChart,
      yearlyChart,
      classComparison,
      teacherAttendanceStats,
      testPerformance,
      homeworkStats,
      rankings,
    });
  });

  // Announcements, Holidays, Timetable, Fees, Sessions, Settings, Backup
  app.post('/api/principal/announcements', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const { title, content, targetRole, priority } = req.body || {};
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Announcement title and message are required.' });
      return;
    }
    const target = ['all', 'teacher', 'student', 'parent'].includes(targetRole) ? targetRole : 'all';
    const prio = priority === 'important' ? 'important' : 'normal';

    const r = db
      .prepare('INSERT INTO announcements (title, content, target_role, priority, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(title.trim(), content.trim(), target, prio, req.auth!.userId);

    // Real-time notify targeted users
    const users =
      target === 'all'
        ? (db.prepare("SELECT id FROM users WHERE is_active = 1 AND role != 'principal'").all() as Array<{ id: number }>)
        : (db.prepare('SELECT id FROM users WHERE is_active = 1 AND role = ?').all(target) as Array<{ id: number }>);

    for (const u of users) {
      createAndPushNotification(db, {
        recipientUserId: u.id,
        type: 'announcement',
        title: prio === 'important' ? `Important: ${title.trim()}` : title.trim(),
        message: content.trim(),
        linkTab: 'overview',
      });
    }

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.post('/api/principal/holidays', requireAuth, requireRole('principal'), (req, res) => {
    const { date, title, description } = req.body || {};
    if (!date || !title?.trim()) {
      res.status(400).json({ error: 'Holiday date and title are required.' });
      return;
    }
    try {
      const r = db
        .prepare('INSERT INTO holidays (date, title, description) VALUES (?, ?, ?)')
        .run(date, title.trim(), description?.trim() || null);
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch {
      res.status(409).json({ error: 'A holiday already exists on that date.' });
    }
  });

  app.delete('/api/principal/holidays/:id', requireAuth, requireRole('principal'), (req, res) => {
    db.prepare('DELETE FROM holidays WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post('/api/principal/timetable', requireAuth, requireRole('principal'), (req, res) => {
    const { classId, dayOfWeek, periodNumber, startTime, endTime, subject, teacherName } = req.body || {};
    if (!classId || !dayOfWeek || !periodNumber || !startTime || !endTime || !subject) {
      res.status(400).json({ error: 'All timetable slot fields are required.' });
      return;
    }
    const r = db
      .prepare(
        `INSERT INTO timetable (class_id, day_of_week, period_number, start_time, end_time, subject, teacher_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(Number(classId), dayOfWeek, Number(periodNumber), startTime, endTime, subject.trim(), (teacherName || 'Faculty').trim());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.get('/api/principal/fees', requireAuth, requireRole('principal'), (_req, res) => {
    const fees = db
      .prepare(
        `SELECT f.*, s.full_name as student_name, s.student_code, c.name as class_name
         FROM fees f
         JOIN students s ON s.id = f.student_id
         JOIN classes c ON c.id = s.class_id
         ORDER BY f.id DESC`
      )
      .all();
    res.json({ fees });
  });

  app.post('/api/principal/fees/:id/mark-paid', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const feeId = Number(req.params.id);
    const today = getPktTimeInfo().date;
    const receipt = `AEA-RCP-${Date.now().toString().slice(-6)}`;
    db.prepare("UPDATE fees SET status = 'Paid', paid_at = ?, receipt_no = ? WHERE id = ?").run(today, receipt, feeId);
    writeAuditLog(
      db,
      { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
      'FEE_MARKED_PAID',
      'fees',
      feeId,
      { status: 'Pending' },
      { status: 'Paid', receipt }
    );
    res.json({ ok: true, receipt });
  });

  app.get('/api/principal/sessions', requireAuth, requireRole('principal'), (_req, res) => {
    const sessions = db.prepare('SELECT * FROM academic_sessions ORDER BY id DESC').all();
    res.json({ sessions });
  });

  app.post('/api/principal/sessions', requireAuth, requireRole('principal'), (req, res) => {
    const { name, startDate, endDate } = req.body || {};
    if (!name?.trim() || !startDate || !endDate) {
      res.status(400).json({ error: 'Session name, start date, and end date are required.' });
      return;
    }
    const r = db
      .prepare('INSERT INTO academic_sessions (name, start_date, end_date, is_active) VALUES (?, ?, ?, 0)')
      .run(name.trim(), startDate, endDate);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.post('/api/principal/sessions/:id/activate', requireAuth, requireRole('principal'), (req, res) => {
    const id = Number(req.params.id);
    db.transaction(() => {
      db.prepare('UPDATE academic_sessions SET is_active = 0').run();
      db.prepare('UPDATE academic_sessions SET is_active = 1 WHERE id = ?').run(id);
    })();
    res.json({ ok: true });
  });

  app.get('/api/principal/settings', requireAuth, requireRole('principal'), (_req, res) => {
    const rows = db.prepare('SELECT key, value FROM school_settings').all() as Array<{ key: string; value: string }>;
    res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  });

  app.put('/api/principal/settings', requireAuth, requireRole('principal'), (req: AuthenticatedRequest, res) => {
    const allowedKeys = new Set([
      'academy_name',
      'campus_address',
      'late_counts_as_present',
      'leave_excluded_from_denominator',
    ]);
    const updates = req.body || {};
    const stmt = db.prepare('INSERT INTO school_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    db.transaction(() => {
      for (const [k, v] of Object.entries(updates)) {
        if (allowedKeys.has(k) && typeof v === 'string') {
          stmt.run(k, v.trim());
        }
      }
      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
        'SETTINGS_UPDATED',
        'school_settings',
        'global',
        null,
        updates
      );
    })();
    res.json({ ok: true });
  });

  app.get('/api/principal/backup', requireAuth, requireRole('principal'), async (req: AuthenticatedRequest, res) => {
    const backupDir = path.resolve(process.cwd(), 'data');
    const tempFile = path.join(backupDir, `backup-${Date.now()}.db`);
    try {
      await db.backup(tempFile);
      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: req.auth!.username, role: req.auth!.role },
        'DATABASE_BACKUP_EXPORTED',
        'system',
        'academy.db',
        null,
        { exportedAt: getPktTimeInfo().date }
      );
      res.download(tempFile, `abdali-academy-backup-${getPktTimeInfo().date}.db`, () => {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      });
    } catch {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      res.status(500).json({ error: 'Database backup failed.' });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // TEACHER ROUTES
  // ═════════════════════════════════════════════════════════════════════════════
  function getTeacherScope(userId: number) {
    const teacher = db
      .prepare('SELECT t.*, u.full_name, u.username FROM teachers t JOIN users u ON u.id = t.user_id WHERE t.user_id = ?')
      .get(userId) as Record<string, any> | undefined;
    if (!teacher) return null;
    const classes = db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY id ASC').all(teacher.id) as Array<Record<string, any>>;
    return { teacher, classes, classIds: classes.map((c) => Number(c.id)) };
  }

  app.get('/api/teacher/overview', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope) {
      res.status(404).json({ error: 'Teacher profile not found.' });
      return;
    }
    const pkt = getPktTimeInfo();
    const assignedClass = scope.classes[0] || null;
    const classIds = scope.classIds;

    let totalStudents = 0;
    let presentToday = 0;
    let absentToday = 0;
    let lateToday = 0;
    let leaveToday = 0;
    let submittedToday = false;
    let classAvgPct = 0;
    let homeworkCount = 0;
    let upcomingTests: unknown[] = [];

    if (assignedClass && classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      totalStudents = (
        db.prepare(`SELECT COUNT(*) as c FROM students WHERE class_id IN (${placeholders}) AND status = 'active'`).get(...classIds) as {
          c: number;
        }
      ).c;

      const todayRows = db
        .prepare(`SELECT status FROM attendance WHERE class_id = ? AND date = ?`)
        .all(assignedClass.id, pkt.date) as Array<{ status: string }>;
      for (const r of todayRows) {
        if (r.status === 'Present') presentToday++;
        else if (r.status === 'Absent') absentToday++;
        else if (r.status === 'Late') lateToday++;
        else if (r.status === 'Leave') leaveToday++;
      }

      const sub = db
        .prepare('SELECT id FROM attendance_submissions WHERE class_id = ? AND date = ?')
        .get(assignedClass.id, pkt.date);
      submittedToday = Boolean(sub);

      const allClassAtt = db
        .prepare(`SELECT status FROM attendance WHERE class_id = ?`)
        .all(assignedClass.id) as Array<{ status: string }>;
      classAvgPct = summarizeAttendanceRows(db, allClassAtt).percentage;

      homeworkCount = (
        db.prepare("SELECT COUNT(*) as c FROM homework WHERE class_id = ? AND status = 'published'").get(assignedClass.id) as { c: number }
      ).c;

      upcomingTests = db
        .prepare("SELECT * FROM tests WHERE class_id = ? AND test_date >= ? ORDER BY test_date ASC LIMIT 5")
        .all(assignedClass.id, pkt.date);
    }

    res.json({
      pkt,
      teacher: scope.teacher,
      assignedClass,
      assignedClasses: scope.classes,
      stats: {
        totalStudents,
        presentToday,
        absentToday,
        lateToday,
        leaveToday,
        submittedToday,
        classAttendanceAverage: classAvgPct,
        homeworkCount,
      },
      upcomingTests,
    });
  });

  // Teacher Student Registration & Directory
  app.get('/api/teacher/students', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.json({ students: [] });
      return;
    }
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const placeholders = scope.classIds.map(() => '?').join(',');
    let students = db
      .prepare(
        `SELECT s.*, c.name as class_name, c.class_code, u.username as student_username, pu.username as parent_username
         FROM students s
         JOIN classes c ON c.id = s.class_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN users pu ON pu.id = s.parent_user_id
         WHERE s.class_id IN (${placeholders}) AND s.status = 'active'
         ORDER BY CAST(s.roll_number AS INTEGER) ASC`
      )
      .all(...scope.classIds) as Array<Record<string, any>>;

    if (search) {
      students = students.filter(
        (s) =>
          String(s.full_name).toLowerCase().includes(search) ||
          String(s.student_code).toLowerCase().includes(search) ||
          String(s.roll_number).toLowerCase().includes(search)
      );
    }

    const enriched = students.map((s) => ({
      ...s,
      attendancePercentage: computeStudentAttendanceStats(db, s.id).percentage,
    }));
    res.json({ students: enriched });
  });

  app.post('/api/teacher/students', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.status(403).json({ error: 'No class assigned to your teacher account yet.' });
      return;
    }

    const {
      fullName,
      fatherName,
      photoUrl,
      dob,
      gender,
      classId,
      rollNumber,
      parentName,
      parentMobile,
      studentUsername,
      studentPassword,
      parentUsername,
      parentPassword,
    } = req.body || {};

    const targetClassId = classId ? Number(classId) : scope.classIds[0];
    if (!scope.classIds.includes(targetClassId)) {
      res.status(403).json({ error: 'You can only register students in your assigned class.' });
      return;
    }

    if (
      !fullName?.trim() ||
      !fatherName?.trim() ||
      !dob ||
      !gender ||
      !rollNumber?.trim() ||
      !parentName?.trim() ||
      !parentMobile?.trim() ||
      !studentUsername?.trim() ||
      !studentPassword ||
      !parentUsername?.trim() ||
      !parentPassword
    ) {
      res.status(400).json({ error: 'All student and parent registration fields are required.' });
      return;
    }

    if (studentUsername.trim().toLowerCase() === parentUsername.trim().toLowerCase()) {
      res.status(400).json({ error: 'Student username and Parent username must be different.' });
      return;
    }

    const dupS = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(studentUsername.trim());
    if (dupS) {
      res.status(409).json({ error: `Student username "${studentUsername.trim()}" already exists.` });
      return;
    }
    const dupP = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(parentUsername.trim());
    if (dupP) {
      res.status(409).json({ error: `Parent username "${parentUsername.trim()}" already exists.` });
      return;
    }
    const dupRoll = db
      .prepare('SELECT id FROM students WHERE class_id = ? AND roll_number = ?')
      .get(targetClassId, rollNumber.trim());
    if (dupRoll) {
      res.status(409).json({ error: `Roll number "${rollNumber.trim()}" is already assigned in this class.` });
      return;
    }

    const seq = (db.prepare('SELECT MAX(id) as m FROM students').get() as { m: number | null }).m || 0;
    const studentCode = `AEA-2026-${String(1000 + seq + 1)}`;
    const parentCode = `PAR-2026-${String(1000 + seq + 1)}`;
    const defaultPhoto =
      gender === 'Female'
        ? '/src/assets/images/avatar_student_female_1795627464479.jpg'
        : '/src/assets/images/avatar_student_male_1795627463854.jpg';
    const finalPhoto = photoUrl?.trim() || defaultPhoto;
    const today = getPktTimeInfo().date;

    const tx = db.transaction(() => {
      const pUserRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, avatar_url)
           VALUES (?, ?, 'parent', ?, 1, '/src/assets/images/avatar_teacher_portrait_1795627465105.jpg')`
        )
        .run(parentUsername.trim(), hashPassword(parentPassword), parentName.trim());
      const parentUserId = Number(pUserRes.lastInsertRowid);

      db.prepare('INSERT INTO parents (user_id, parent_code, full_name, mobile) VALUES (?, ?, ?, ?)').run(
        parentUserId,
        parentCode,
        parentName.trim(),
        parentMobile.trim()
      );

      const sUserRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, avatar_url)
           VALUES (?, ?, 'student', ?, 1, ?)`
        )
        .run(studentUsername.trim(), hashPassword(studentPassword), fullName.trim(), finalPhoto);
      const studentUserId = Number(sUserRes.lastInsertRowid);

      const stRes = db
        .prepare(
          `INSERT INTO students (
            user_id, student_code, full_name, father_name, photo_url, dob, gender,
            class_id, roll_number, parent_user_id, parent_name, parent_mobile, admission_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
        )
        .run(
          studentUserId,
          studentCode,
          fullName.trim(),
          fatherName.trim(),
          finalPhoto,
          dob,
          gender,
          targetClassId,
          rollNumber.trim(),
          parentUserId,
          parentName.trim(),
          parentMobile.trim(),
          today
        );
      const studentId = Number(stRes.lastInsertRowid);

      db.prepare(
        `INSERT INTO fees (student_id, month, year, amount, status) VALUES (?, 'November', 2026, 8500, 'Pending')`
      ).run(studentId);

      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: scope.teacher.full_name, role: 'teacher' },
        'STUDENT_REGISTERED',
        'students',
        studentId,
        null,
        { studentCode, fullName: fullName.trim(), classId: targetClassId, rollNumber: rollNumber.trim() }
      );

      return { studentId, studentCode, parentCode };
    });

    const created = tx();
    res.status(201).json(created);
  });

  app.put('/api/teacher/students/:id', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    const studentId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as Record<string, any> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    if (!scope || !scope.classIds.includes(Number(existing.class_id))) {
      res.status(403).json({ error: 'You can only edit students in your assigned class.' });
      return;
    }

    // Student ID (student_code) is STRICTLY IMMUTABLE and never updated
    const { fullName, fatherName, dob, gender, rollNumber, parentName, parentMobile, photoUrl } = req.body || {};
    if (!fullName?.trim() || !fatherName?.trim()) {
      res.status(400).json({ error: 'Student full name and father name are required.' });
      return;
    }

    db.transaction(() => {
      db.prepare(
        `UPDATE students
         SET full_name = ?, father_name = ?, dob = ?, gender = ?, roll_number = ?,
             parent_name = ?, parent_mobile = ?, photo_url = ?
         WHERE id = ?`
      ).run(
        fullName.trim(),
        fatherName.trim(),
        dob || existing.dob,
        gender || existing.gender,
        rollNumber ? String(rollNumber).trim() : existing.roll_number,
        parentName ? String(parentName).trim() : existing.parent_name,
        parentMobile ? String(parentMobile).trim() : existing.parent_mobile,
        photoUrl ? String(photoUrl).trim() : existing.photo_url,
        studentId
      );

      db.prepare('UPDATE users SET full_name = ?, avatar_url = ? WHERE id = ?').run(
        fullName.trim(),
        photoUrl ? String(photoUrl).trim() : existing.photo_url,
        existing.user_id
      );

      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: scope.teacher.full_name, role: 'teacher' },
        'STUDENT_UPDATED',
        'students',
        studentId,
        { full_name: existing.full_name, roll_number: existing.roll_number },
        { full_name: fullName.trim(), roll_number: rollNumber || existing.roll_number }
      );
    })();

    res.json({ ok: true });
  });

  // Explicit block on permanent deletion by teachers
  app.delete('/api/teacher/students/:id', requireAuth, requireRole('teacher'), (_req, res) => {
    res.status(403).json({ error: 'Teachers are not permitted to permanently delete student records.' });
  });

  app.get('/api/teacher/students/:id', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    const profile = getStudentFullProfile(db, Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    if (!scope || !scope.classIds.includes(Number(profile.student.class_id))) {
      res.status(403).json({ error: 'Access denied: student belongs to another class.' });
      return;
    }
    res.json(profile);
  });

  app.get('/api/teacher/rankings', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.json({ attendanceRanking: [], academicRanking: [] });
      return;
    }
    const classId = scope.classIds[0];
    res.json(getClassRankings(db, classId));
  });

  // Teacher Attendance Submission (PKT 08:00–11:59 Server-Enforced & Immutable)
  app.get('/api/teacher/attendance', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classes.length === 0) {
      res.status(404).json({ error: 'No class assigned.' });
      return;
    }
    const pkt = getPktTimeInfo();
    const classId = scope.classes[0].id;
    const date = req.query.date ? String(req.query.date) : pkt.date;

    const submission = db
      .prepare('SELECT * FROM attendance_submissions WHERE class_id = ? AND date = ?')
      .get(classId, date) as Record<string, any> | undefined;

    const students = db
      .prepare(
        `SELECT s.id as student_id, s.student_code, s.full_name, s.roll_number, s.photo_url,
                a.id as attendance_id, a.status, a.marked_at
         FROM students s
         LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
         WHERE s.class_id = ? AND s.status = 'active'
         ORDER BY CAST(s.roll_number AS INTEGER) ASC`
      )
      .all(date, classId);

    res.json({
      pkt,
      classInfo: scope.classes[0],
      date,
      isToday: date === pkt.date,
      submission: submission || null,
      students,
    });
  });

  app.post('/api/teacher/attendance', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classes.length === 0) {
      res.status(403).json({ error: 'No class assigned to your account.' });
      return;
    }

    const pkt = getPktTimeInfo();
    // STRICT SERVER-SIDE PKT TIME CHECK (08:00 AM - 11:59 AM Pakistan Standard Time)
    if (!pkt.isAttendanceWindowOpen) {
      res.status(403).json({
        error: `Attendance submission blocked by server clock (${pkt.time} PKT). ${pkt.windowMessage}`,
        pkt,
      });
      return;
    }

    const classInfo = scope.classes[0];
    const existingSub = db
      .prepare('SELECT id FROM attendance_submissions WHERE class_id = ? AND date = ?')
      .get(classInfo.id, pkt.date);
    if (existingSub) {
      res.status(409).json({
        error: 'Attendance for today has already been submitted and locked. Submit a correction request to the Principal if an adjustment is needed.',
      });
      return;
    }

    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'Attendance entries are required.' });
      return;
    }

    const classStudents = db
      .prepare("SELECT id, user_id, parent_user_id, full_name FROM students WHERE class_id = ? AND status = 'active'")
      .all(classInfo.id) as Array<{ id: number; user_id: number; parent_user_id: number | null; full_name: string }>;
    const studentMap = new Map(classStudents.map((s) => [s.id, s]));

    const validStatuses = new Set(['Present', 'Absent', 'Late', 'Leave']);
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let leaveCount = 0;

    const cleanEntries: Array<{ studentId: number; status: string }> = [];
    for (const item of entries) {
      const sid = Number(item.studentId);
      const st = studentMap.get(sid);
      if (!st) {
        res.status(403).json({ error: 'Unauthorized student ID in attendance submission.' });
        return;
      }
      if (!validStatuses.has(item.status)) {
        res.status(400).json({ error: 'Invalid attendance status.' });
        return;
      }
      if (item.status === 'Present') presentCount++;
      else if (item.status === 'Absent') absentCount++;
      else if (item.status === 'Late') lateCount++;
      else if (item.status === 'Leave') leaveCount++;
      cleanEntries.push({ studentId: sid, status: item.status });
    }

    const submittedAt = `${pkt.date} ${pkt.time}`;

    const submissionId = db.transaction(() => {
      const subRes = db
        .prepare(
          `INSERT INTO attendance_submissions (
            class_id, date, teacher_id, submitted_at, pkt_time_str,
            total_students, present_count, absent_count, late_count, leave_count, is_locked
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .run(
          classInfo.id,
          pkt.date,
          scope.teacher.id,
          submittedAt,
          pkt.time,
          cleanEntries.length,
          presentCount,
          absentCount,
          lateCount,
          leaveCount
        );
      const subId = Number(subRes.lastInsertRowid);

      const insertRow = db.prepare(
        `INSERT INTO attendance (submission_id, student_id, class_id, date, status, marked_by, marked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of cleanEntries) {
        insertRow.run(subId, entry.studentId, classInfo.id, pkt.date, entry.status, req.auth!.userId, submittedAt);
      }

      writeAuditLog(
        db,
        { userId: req.auth!.userId, fullName: scope.teacher.full_name, role: 'teacher' },
        'ATTENDANCE_SUBMITTED',
        'attendance_submissions',
        subId,
        null,
        {
          className: classInfo.name,
          date: pkt.date,
          pktTime: pkt.time,
          presentCount,
          absentCount,
          lateCount,
          leaveCount,
        }
      );

      return subId;
    })();

    // Real-time notification to Principal(s)
    const principals = db.prepare("SELECT id FROM users WHERE role = 'principal' AND is_active = 1").all() as Array<{ id: number }>;
    for (const p of principals) {
      createAndPushNotification(db, {
        recipientUserId: p.id,
        type: 'attendance_submitted',
        title: `Class ${classInfo.name} attendance has been submitted successfully.`,
        message: `Teacher: ${scope.teacher.full_name} · Time: ${pkt.time} PKT · Total: ${cleanEntries.length} (Present: ${presentCount}, Absent: ${absentCount}, Late: ${lateCount}, Leave: ${leaveCount})`,
        linkTab: 'attendance',
        linkMeta: { classId: classInfo.id, date: pkt.date },
      });
    }

    // Real-time notifications to Parents and Students
    for (const entry of cleanEntries) {
      const st = studentMap.get(entry.studentId)!;
      const statusUpper = entry.status.toUpperCase();
      if (st.parent_user_id) {
        createAndPushNotification(db, {
          recipientUserId: st.parent_user_id,
          type: entry.status === 'Absent' ? 'student_absent' : 'student_present',
          title: `Daily Attendance: ${st.full_name}`,
          message: `Your child ${st.full_name} is ${statusUpper} today (${pkt.date}).`,
          linkTab: 'overview',
          linkMeta: { studentId: st.id, date: pkt.date, status: entry.status },
        });
        pushEventToUser(st.parent_user_id, 'attendance:updated', {
          studentId: st.id,
          date: pkt.date,
          status: entry.status,
        });
      }

      createAndPushNotification(db, {
        recipientUserId: st.user_id,
        type: 'attendance_marked',
        title: 'Today’s Attendance Marked',
        message: `You have been marked ${statusUpper} for ${pkt.date}.`,
        linkTab: 'attendance',
      });
      pushEventToUser(st.user_id, 'attendance:updated', { date: pkt.date, status: entry.status });
    }

    res.status(201).json({ ok: true, submissionId, pkt });
  });

  // Teacher Correction Requests
  app.get('/api/teacher/correction-requests', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope) {
      res.json({ requests: [] });
      return;
    }
    const requests = db
      .prepare(
        `SELECT cr.*, s.full_name as student_name, s.student_code, c.name as class_name
         FROM attendance_correction_requests cr
         JOIN students s ON s.id = cr.student_id
         JOIN classes c ON c.id = cr.class_id
         WHERE cr.requested_by_teacher_id = ?
         ORDER BY cr.id DESC`
      )
      .all(scope.teacher.id);
    res.json({ requests });
  });

  app.post('/api/teacher/correction-requests', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope) {
      res.status(403).json({ error: 'Teacher profile not found.' });
      return;
    }
    const { attendanceId, requestedStatus, reason } = req.body || {};
    if (!attendanceId || !requestedStatus || !reason?.trim()) {
      res.status(400).json({ error: 'Attendance record, requested status, and reason are required.' });
      return;
    }

    const att = db
      .prepare('SELECT a.*, s.full_name as student_name, c.name as class_name FROM attendance a JOIN students s ON s.id = a.student_id JOIN classes c ON c.id = a.class_id WHERE a.id = ?')
      .get(Number(attendanceId)) as Record<string, any> | undefined;

    if (!att || !scope.classIds.includes(Number(att.class_id))) {
      res.status(403).json({ error: 'You can only request corrections for your assigned class.' });
      return;
    }
    if (att.status === requestedStatus) {
      res.status(400).json({ error: 'Requested status matches the current status.' });
      return;
    }

    const r = db
      .prepare(
        `INSERT INTO attendance_correction_requests (
          attendance_id, student_id, class_id, date, requested_by_teacher_id, old_status, requested_status, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(att.id, att.student_id, att.class_id, att.date, scope.teacher.id, att.status, requestedStatus, reason.trim());

    const principals = db.prepare("SELECT id FROM users WHERE role = 'principal' AND is_active = 1").all() as Array<{ id: number }>;
    for (const p of principals) {
      createAndPushNotification(db, {
        recipientUserId: p.id,
        type: 'correction_request',
        title: `Attendance Correction Request — Class ${att.class_name}`,
        message: `${scope.teacher.full_name} requested changing ${att.student_name} (${att.date}) from ${att.status} to ${requestedStatus}. Reason: ${reason.trim()}`,
        linkTab: 'corrections',
      });
    }

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // Teacher Homework Management
  app.get('/api/teacher/homework', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.json({ homework: [] });
      return;
    }
    const placeholders = scope.classIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT h.*, c.name as class_name FROM homework h
         JOIN classes c ON c.id = h.class_id
         WHERE h.class_id IN (${placeholders})
         ORDER BY h.id DESC`
      )
      .all(...scope.classIds);
    res.json({ homework: rows });
  });

  app.post('/api/teacher/homework', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.status(403).json({ error: 'No class assigned.' });
      return;
    }
    const { subject, title, description, assignedDate, dueDate, attachmentUrl, attachmentName, status } = req.body || {};
    if (!subject?.trim() || !title?.trim() || !description?.trim() || !dueDate) {
      res.status(400).json({ error: 'Subject, title, description, and due date are required.' });
      return;
    }
    const classInfo = scope.classes[0];
    const pkt = getPktTimeInfo();
    const hwStatus = status === 'draft' ? 'draft' : 'published';
    const publishedAt = hwStatus === 'published' ? `${pkt.date} ${pkt.time}` : null;

    const r = db
      .prepare(
        `INSERT INTO homework (
          class_id, teacher_id, subject, title, description, assigned_date, due_date,
          attachment_url, attachment_name, status, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        classInfo.id,
        scope.teacher.id,
        subject.trim(),
        title.trim(),
        description.trim(),
        assignedDate || pkt.date,
        dueDate,
        attachmentUrl || null,
        attachmentName || null,
        hwStatus,
        publishedAt
      );

    if (hwStatus === 'published') {
      notifyClassStudentsAndParents(db, classInfo.id, {
        type: 'homework',
        title: `New ${subject.trim()} Homework`,
        message: `New ${subject.trim()} Homework has been assigned to Class ${classInfo.name}: "${title.trim()}" (Due: ${dueDate}).`,
        linkTab: 'homework',
      });
    }

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.put('/api/teacher/homework/:id', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    const hwId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM homework WHERE id = ?').get(hwId) as Record<string, any> | undefined;
    if (!existing || !scope || !scope.classIds.includes(Number(existing.class_id))) {
      res.status(403).json({ error: 'Homework record not found in your class.' });
      return;
    }
    if (existing.status === 'published') {
      res.status(400).json({ error: 'Homework is already published. Only drafts can be edited before publishing.' });
      return;
    }

    const { subject, title, description, dueDate, attachmentUrl, attachmentName, status } = req.body || {};
    const nextStatus = status === 'published' ? 'published' : 'draft';
    const pkt = getPktTimeInfo();
    const publishedAt = nextStatus === 'published' ? `${pkt.date} ${pkt.time}` : null;

    db.prepare(
      `UPDATE homework
       SET subject = ?, title = ?, description = ?, due_date = ?, attachment_url = ?, attachment_name = ?, status = ?, published_at = ?
       WHERE id = ?`
    ).run(
      (subject || existing.subject).trim(),
      (title || existing.title).trim(),
      (description || existing.description).trim(),
      dueDate || existing.due_date,
      attachmentUrl !== undefined ? attachmentUrl : existing.attachment_url,
      attachmentName !== undefined ? attachmentName : existing.attachment_name,
      nextStatus,
      publishedAt,
      hwId
    );

    if (nextStatus === 'published') {
      const classInfo = scope.classes.find((c) => c.id === existing.class_id);
      notifyClassStudentsAndParents(db, existing.class_id, {
        type: 'homework',
        title: `New ${(subject || existing.subject).trim()} Homework`,
        message: `New ${(subject || existing.subject).trim()} Homework has been assigned to Class ${classInfo?.name || ''}: "${(title || existing.title).trim()}".`,
        linkTab: 'homework',
      });
    }

    res.json({ ok: true });
  });

  // Teacher Tests & Marks Management
  app.get('/api/teacher/tests', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classIds.length === 0) {
      res.json({ tests: [] });
      return;
    }
    const placeholders = scope.classIds.map(() => '?').join(',');
    const tests = db
      .prepare(
        `SELECT t.*, c.name as class_name,
                (SELECT COUNT(*) FROM test_results tr WHERE tr.test_id = t.id) as graded_count
         FROM tests t
         JOIN classes c ON c.id = t.class_id
         WHERE t.class_id IN (${placeholders})
         ORDER BY t.test_date DESC, t.id DESC`
      )
      .all(...scope.classIds) as Array<Record<string, any>>;

    const enriched = tests.map((t) => {
      const results = db
        .prepare(
          `SELECT tr.*, s.full_name as student_name, s.student_code, s.roll_number,
                  (SELECT COUNT(*) + 1 FROM test_results tr2 WHERE tr2.test_id = tr.test_id AND tr2.obtained_marks > tr.obtained_marks) as class_position
           FROM test_results tr
           JOIN students s ON s.id = tr.student_id
           WHERE tr.test_id = ?
           ORDER BY tr.obtained_marks DESC`
        )
        .all(t.id);
      return { ...t, results };
    });

    res.json({ tests: enriched });
  });

  app.post('/api/teacher/tests', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    if (!scope || scope.classes.length === 0) {
      res.status(403).json({ error: 'No class assigned.' });
      return;
    }
    const { title, subject, testType, testDate, totalMarks, syllabus, instructions } = req.body || {};
    if (!title?.trim() || !subject?.trim() || !testDate || !totalMarks || !syllabus?.trim()) {
      res.status(400).json({ error: 'Test title, subject, date, total marks, and syllabus are required.' });
      return;
    }
    const classInfo = scope.classes[0];
    const r = db
      .prepare(
        `INSERT INTO tests (class_id, teacher_id, title, subject, test_type, test_date, total_marks, syllabus, instructions, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`
      )
      .run(
        classInfo.id,
        scope.teacher.id,
        title.trim(),
        subject.trim(),
        ['Daily', 'Weekly', 'Monthly', 'Examination'].includes(testType) ? testType : 'Weekly',
        testDate,
        Number(totalMarks),
        syllabus.trim(),
        instructions?.trim() || null
      );

    notifyClassStudentsAndParents(db, classInfo.id, {
      type: 'test_announced',
      title: `Upcoming ${subject.trim()} Test`,
      message: `Reminder: ${subject.trim()} Test (${title.trim()}) on ${testDate} for Class ${classInfo.name}. Syllabus: ${syllabus.trim()}`,
      linkTab: 'tests',
    });

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.post('/api/teacher/tests/:id/marks', requireAuth, requireRole('teacher'), (req: AuthenticatedRequest, res) => {
    const scope = getTeacherScope(req.auth!.userId);
    const testId = Number(req.params.id);
    const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId) as Record<string, any> | undefined;
    if (!test || !scope || !scope.classIds.includes(Number(test.class_id))) {
      res.status(403).json({ error: 'Test not found in your assigned class.' });
      return;
    }
    const { marks } = req.body || {};
    if (!Array.isArray(marks) || marks.length === 0) {
      res.status(400).json({ error: 'Student marks array is required.' });
      return;
    }

    const totalMarks = Number(test.total_marks);
    const stmt = db.prepare(
      `INSERT INTO test_results (test_id, student_id, obtained_marks, total_marks, percentage, grade, remarks, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(test_id, student_id) DO UPDATE SET
         obtained_marks = excluded.obtained_marks,
         percentage = excluded.percentage,
         grade = excluded.grade,
         remarks = excluded.remarks,
         updated_at = datetime('now')`
    );

    db.transaction(() => {
      for (const m of marks) {
        const obtained = Math.max(0, Math.min(totalMarks, Number(m.obtainedMarks)));
        const pct = totalMarks > 0 ? Number(((obtained / totalMarks) * 100).toFixed(1)) : 0;
        const grade = calcGrade(pct);
        stmt.run(testId, Number(m.studentId), obtained, totalMarks, pct, grade, m.remarks || null, req.auth!.userId);
      }
    })();

    notifyClassStudentsAndParents(db, test.class_id, {
      type: 'test_result',
      title: `${test.subject} Test Results Published`,
      message: `Results for "${test.title}" (${test.subject}) have been published. View your marks, grade, and class position.`,
      linkTab: 'tests',
    });

    res.json({ ok: true });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // STUDENT PORTAL ROUTES (Strict Self-Only Isolation)
  // ═════════════════════════════════════════════════════════════════════════════
  app.get('/api/student/dashboard', requireAuth, requireRole('student'), (req: AuthenticatedRequest, res) => {
    const stRow = db.prepare('SELECT id, class_id FROM students WHERE user_id = ?').get(req.auth!.userId) as
      | { id: number; class_id: number }
      | undefined;
    if (!stRow) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }
    const profile = getStudentFullProfile(db, stRow.id);
    const pkt = getPktTimeInfo();
    const upcomingTests = db
      .prepare("SELECT * FROM tests WHERE class_id = ? AND test_date >= ? ORDER BY test_date ASC")
      .all(stRow.class_id, pkt.date);
    const todayAttendance = db
      .prepare('SELECT status, marked_at FROM attendance WHERE student_id = ? AND date = ?')
      .get(stRow.id, pkt.date) as { status: string; marked_at: string } | undefined;

    res.json({
      pkt,
      todayAttendance: todayAttendance || null,
      upcomingTests,
      ...profile,
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PARENT PORTAL ROUTES (Strict Linked-Children Isolation)
  // ═════════════════════════════════════════════════════════════════════════════
  app.get('/api/parent/dashboard', requireAuth, requireRole('parent'), (req: AuthenticatedRequest, res) => {
    const pkt = getPktTimeInfo();
    const childrenRows = db
      .prepare("SELECT id, class_id FROM students WHERE parent_user_id = ? AND status = 'active'")
      .all(req.auth!.userId) as Array<{ id: number; class_id: number }>;

    if (childrenRows.length === 0) {
      res.status(404).json({ error: 'No linked student found for this parent account.' });
      return;
    }

    const children = childrenRows.map((c) => {
      const profile = getStudentFullProfile(db, c.id)!;
      const todayAttendance = db
        .prepare('SELECT status, marked_at FROM attendance WHERE student_id = ? AND date = ?')
        .get(c.id, pkt.date) as { status: string; marked_at: string } | undefined;
      const upcomingTests = db
        .prepare('SELECT * FROM tests WHERE class_id = ? AND test_date >= ? ORDER BY test_date ASC')
        .all(c.class_id, pkt.date);
      return {
        ...profile,
        todayAttendance: todayAttendance || null,
        upcomingTests,
      };
    });

    res.json({ pkt, children });
  });
}

function notifyClassStudentsAndParents(
  db: Database.Database,
  classId: number,
  notif: { type: string; title: string; message: string; linkTab?: string }
) {
  const students = db
    .prepare("SELECT user_id, parent_user_id FROM students WHERE class_id = ? AND status = 'active'")
    .all(classId) as Array<{ user_id: number; parent_user_id: number | null }>;

  const notified = new Set<number>();
  for (const s of students) {
    if (!notified.has(s.user_id)) {
      notified.add(s.user_id);
      createAndPushNotification(db, { recipientUserId: s.user_id, ...notif });
    }
    if (s.parent_user_id && !notified.has(s.parent_user_id)) {
      notified.add(s.parent_user_id);
      createAndPushNotification(db, { recipientUserId: s.parent_user_id, ...notif });
    }
  }
}

function buildUserSessionProfile(db: Database.Database, user: Record<string, any>) {
  const base = {
    id: user.id,
    username: user.username,
    role: user.role as UserRole,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    mustChangePassword: Boolean(user.must_change_password),
    soundAlerts: Boolean(user.sound_alerts),
    pushEnabled: Boolean(user.push_enabled),
  };

  if (user.role === 'principal') {
    const p = db.prepare('SELECT * FROM principals WHERE user_id = ?').get(user.id) as Record<string, any> | undefined;
    return { ...base, code: p?.principal_code || 'PRI-001', designation: p?.designation || 'Principal' };
  }
  if (user.role === 'teacher') {
    const t = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(user.id) as Record<string, any> | undefined;
    const cls = t ? (db.prepare('SELECT id, class_code, name FROM classes WHERE teacher_id = ? LIMIT 1').get(t.id) as Record<string, any> | undefined) : undefined;
    return {
      ...base,
      teacherId: t?.id,
      code: t?.teacher_code,
      subjectSpecialty: t?.subject_specialty,
      assignedClass: cls || null,
    };
  }
  if (user.role === 'student') {
    const s = db
      .prepare('SELECT s.*, c.name as class_name, c.class_code FROM students s JOIN classes c ON c.id = s.class_id WHERE s.user_id = ?')
      .get(user.id) as Record<string, any> | undefined;
    return {
      ...base,
      studentId: s?.id,
      code: s?.student_code,
      className: s?.class_name,
      rollNumber: s?.roll_number,
    };
  }
  const par = db.prepare('SELECT * FROM parents WHERE user_id = ?').get(user.id) as Record<string, any> | undefined;
  return {
    ...base,
    code: par?.parent_code || 'PAR',
  };
}
