import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword } from './auth.ts';
import { getPktDateDaysAgo, getPktDayOfWeek } from './time.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'academy.db');

export function getDatabasePath(): string {
  return DB_PATH;
}

export function initDatabase(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS academic_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('principal','teacher','student','parent')),
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      sound_alerts INTEGER NOT NULL DEFAULT 1,
      push_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS principals (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      principal_code TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL DEFAULT 'Principal & Administrator',
      phone TEXT,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      teacher_code TEXT NOT NULL UNIQUE,
      subject_specialty TEXT NOT NULL,
      phone TEXT,
      qualification TEXT,
      joining_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      section TEXT NOT NULL DEFAULT 'A',
      room_number TEXT,
      teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      UNIQUE(code, class_id)
    );

    CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      parent_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      student_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      father_name TEXT NOT NULL,
      photo_url TEXT,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL CHECK(gender IN ('Male','Female','Other')),
      class_id INTEGER NOT NULL REFERENCES classes(id),
      roll_number TEXT NOT NULL,
      parent_user_id INTEGER REFERENCES users(id),
      parent_name TEXT NOT NULL,
      parent_mobile TEXT NOT NULL,
      admission_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','graduated','inactive')),
      UNIQUE(class_id, roll_number)
    );

    CREATE TABLE IF NOT EXISTS attendance_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      date TEXT NOT NULL,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      submitted_at TEXT NOT NULL,
      pkt_time_str TEXT NOT NULL,
      total_students INTEGER NOT NULL,
      present_count INTEGER NOT NULL,
      absent_count INTEGER NOT NULL,
      late_count INTEGER NOT NULL,
      leave_count INTEGER NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 1,
      UNIQUE(class_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES attendance_submissions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id),
      class_id INTEGER NOT NULL REFERENCES classes(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Leave')),
      marked_by INTEGER NOT NULL REFERENCES users(id),
      marked_at TEXT NOT NULL,
      UNIQUE(student_id, date)
    );

    CREATE TABLE IF NOT EXISTS teacher_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Leave')),
      check_in_time TEXT,
      notes TEXT,
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      UNIQUE(teacher_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance_correction_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER NOT NULL REFERENCES attendance(id),
      student_id INTEGER NOT NULL REFERENCES students(id),
      class_id INTEGER NOT NULL REFERENCES classes(id),
      date TEXT NOT NULL,
      requested_by_teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      old_status TEXT NOT NULL,
      requested_status TEXT NOT NULL CHECK(requested_status IN ('Present','Absent','Late','Leave')),
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      review_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_table TEXT NOT NULL,
      target_id TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS homework (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      assigned_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      test_type TEXT NOT NULL CHECK(test_type IN ('Daily','Weekly','Monthly','Examination')),
      test_date TEXT NOT NULL,
      total_marks REAL NOT NULL,
      syllabus TEXT NOT NULL,
      instructions TEXT,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id),
      obtained_marks REAL NOT NULL,
      total_marks REAL NOT NULL,
      percentage REAL NOT NULL,
      grade TEXT NOT NULL,
      remarks TEXT,
      recorded_by INTEGER NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(test_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_tab TEXT,
      link_meta_json TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      target_role TEXT NOT NULL DEFAULT 'all' CHECK(target_role IN ('all','teacher','student','parent')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','important')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      subject TEXT NOT NULL,
      teacher_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      month TEXT NOT NULL,
      year INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Paid','Pending','Overdue')),
      paid_at TEXT,
      receipt_no TEXT
    );

    CREATE TABLE IF NOT EXISTS school_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedInitialData(db);
  return db;
}

function seedInitialData(db: Database.Database): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) {
    return;
  }

  const MALE_AVATAR = '/src/assets/images/avatar_student_male_1795627463854.jpg';
  const FEMALE_AVATAR = '/src/assets/images/avatar_student_female_1795627464479.jpg';
  const TEACHER_AVATAR = '/src/assets/images/avatar_teacher_portrait_1795627465105.jpg';

  const tx = db.transaction(() => {
    // 1. Academic Sessions
    const sessionRes = db
      .prepare('INSERT INTO academic_sessions (name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)')
      .run('2026-2027', '2026-04-01', '2027-03-31', 1);
    const sessionId = Number(sessionRes.lastInsertRowid);
    db.prepare('INSERT INTO academic_sessions (name, start_date, end_date, is_active) VALUES (?, ?, ?, ?)').run(
      '2025-2026',
      '2025-04-01',
      '2026-03-31',
      0
    );

    // 2. School Settings
    const insertSetting = db.prepare('INSERT INTO school_settings (key, value) VALUES (?, ?)');
    insertSetting.run('academy_name', 'ABDALI EDUCATION ACADEMY');
    insertSetting.run('campus_address', 'Academic Boulevard, Islamabad');
    insertSetting.run('attendance_start_pkt', '08:00');
    insertSetting.run('attendance_end_pkt', '11:59');
    insertSetting.run('late_counts_as_present', '1');
    insertSetting.run('leave_excluded_from_denominator', '1');

    // 3. Principal (Default Demo: Ali / Ali with must_change_password = 1)
    const principalUserRes = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, full_name, is_active, must_change_password, avatar_url)
         VALUES (?, ?, 'principal', ?, 1, 1, ?)`
      )
      .run('Ali', hashPassword('Ali'), 'Principal Ali', TEACHER_AVATAR);
    const principalUserId = Number(principalUserRes.lastInsertRowid);
    db.prepare(
      'INSERT INTO principals (user_id, principal_code, designation, phone, email) VALUES (?, ?, ?, ?, ?)'
    ).run(principalUserId, 'PRI-001', 'Principal & Director', '+92-300-5550100', 'principal@abdalieducation.edu.pk');

    // 4. Teachers
    const teacherSpecs = [
      {
        username: 'teacher.fatima',
        fullName: 'Fatima Noor',
        code: 'TCH-2026-001',
        specialty: 'Mathematics & Science',
        phone: '+92-301-5551101',
        qual: 'M.Sc Mathematics',
        classCode: 'CLS-05',
        className: '5th',
        room: 'Room 201',
      },
      {
        username: 'teacher.bilal',
        fullName: 'Bilal Ahmed',
        code: 'TCH-2026-002',
        specialty: 'Physics & Computer Science',
        phone: '+92-302-5551102',
        qual: 'M.Phil Physics',
        classCode: 'CLS-08',
        className: '8th',
        room: 'Room 301',
      },
      {
        username: 'teacher.ayesha',
        fullName: 'Ayesha Tariq',
        code: 'TCH-2026-003',
        specialty: 'English & Social Studies',
        phone: '+92-303-5551103',
        qual: 'M.A English Literature',
        classCode: 'CLS-03',
        className: '3rd',
        room: 'Room 103',
      },
      {
        username: 'teacher.usman',
        fullName: 'Usman Raza',
        code: 'TCH-2026-004',
        specialty: 'General Education & Urdu',
        phone: '+92-304-5551104',
        qual: 'B.Ed (Hons)',
        classCode: 'CLS-01',
        className: '1st',
        room: 'Room 101',
      },
    ];

    const teacherHash = hashPassword('Teacher@123');
    const teacherRecords: Array<{ teacherId: number; userId: number; classId: number; fullName: string; className: string }> = [];

    for (const t of teacherSpecs) {
      const uRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, must_change_password, avatar_url)
           VALUES (?, ?, 'teacher', ?, 1, 0, ?)`
        )
        .run(t.username, teacherHash, t.fullName, TEACHER_AVATAR);
      const userId = Number(uRes.lastInsertRowid);

      const tRes = db
        .prepare(
          `INSERT INTO teachers (user_id, teacher_code, subject_specialty, phone, qualification, joining_date, status)
           VALUES (?, ?, ?, ?, ?, '2024-08-15', 'active')`
        )
        .run(userId, t.code, t.specialty, t.phone, t.qual);
      const teacherId = Number(tRes.lastInsertRowid);

      const cRes = db
        .prepare(
          `INSERT INTO classes (class_code, name, section, room_number, teacher_id, academic_session_id)
           VALUES (?, ?, 'A', ?, ?, ?)`
        )
        .run(t.classCode, t.className, t.room, teacherId, sessionId);
      const classId = Number(cRes.lastInsertRowid);

      teacherRecords.push({ teacherId, userId, classId, fullName: t.fullName, className: t.className });

      // Subjects for each class
      const subjects = ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'];
      subjects.forEach((subj, idx) => {
        db.prepare('INSERT INTO subjects (code, name, class_id) VALUES (?, ?, ?)').run(
          `${t.classCode}-SUB-${idx + 1}`,
          subj,
          classId
        );
      });

      // Timetable Mon-Fri
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const times = [
        ['08:00', '08:45'],
        ['08:45', '09:30'],
        ['09:45', '10:30'],
        ['10:30', '11:15'],
        ['11:15', '12:00'],
      ];
      days.forEach((day, dIdx) => {
        times.forEach(([start, end], pIdx) => {
          const subj = subjects[(dIdx + pIdx) % subjects.length];
          db.prepare(
            `INSERT INTO timetable (class_id, day_of_week, period_number, start_time, end_time, subject, teacher_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(classId, day, pIdx + 1, start, end, subj, t.fullName);
        });
      });
    }

    // 5. Students & Linked Parents
    const studentHash = hashPassword('Student@123');
    const parentHash = hashPassword('Parent@123');

    const studentSeeds = [
      // Class 5th (class index 0)
      {
        classIdx: 0,
        code: 'AEA-2026-0501',
        name: 'Ahmad Khan',
        father: 'Tariq Khan',
        dob: '2015-05-14',
        gender: 'Male',
        roll: '01',
        sUser: 'ahmad.khan',
        pUser: 'parent.tariq',
        pCode: 'PAR-2026-0501',
        pName: 'Tariq Khan',
        pMobile: '+92-311-5552001',
        absences: 0,
        lates: 1,
      },
      {
        classIdx: 0,
        code: 'AEA-2026-0502',
        name: 'Ali Raza',
        father: 'Salman Raza',
        dob: '2015-08-22',
        gender: 'Male',
        roll: '02',
        sUser: 'ali.raza',
        pUser: 'parent.salman',
        pCode: 'PAR-2026-0502',
        pName: 'Salman Raza',
        pMobile: '+92-311-5552002',
        absences: 1,
        lates: 0,
      },
      {
        classIdx: 0,
        code: 'AEA-2026-0503',
        name: 'Hamza Malik',
        father: 'Imran Malik',
        dob: '2015-03-10',
        gender: 'Male',
        roll: '03',
        sUser: 'hamza.malik',
        pUser: 'parent.imran',
        pCode: 'PAR-2026-0503',
        pName: 'Imran Malik',
        pMobile: '+92-311-5552003',
        absences: 2,
        lates: 1,
      },
      {
        classIdx: 0,
        code: 'AEA-2026-0504',
        name: 'Usman Tariq',
        father: 'Tariq Mahmood',
        dob: '2015-11-02',
        gender: 'Male',
        roll: '04',
        sUser: 'usman.tariq',
        pUser: 'parent.mahmood',
        pCode: 'PAR-2026-0504',
        pName: 'Tariq Mahmood',
        pMobile: '+92-311-5552004',
        absences: 3,
        lates: 0,
      },
      {
        classIdx: 0,
        code: 'AEA-2026-0505',
        name: 'Zainab Fatima',
        father: 'Kamran Siddiqui',
        dob: '2015-07-19',
        gender: 'Female',
        roll: '05',
        sUser: 'zainab.fatima',
        pUser: 'parent.kamran',
        pCode: 'PAR-2026-0505',
        pName: 'Kamran Siddiqui',
        pMobile: '+92-311-5552005',
        absences: 1,
        lates: 0,
      },
      // Class 8th (class index 1)
      {
        classIdx: 1,
        code: 'AEA-2026-0801',
        name: 'Saad Qureshi',
        father: 'Nadeem Qureshi',
        dob: '2012-02-18',
        gender: 'Male',
        roll: '01',
        sUser: 'saad.qureshi',
        pUser: 'parent.nadeem',
        pCode: 'PAR-2026-0801',
        pName: 'Nadeem Qureshi',
        pMobile: '+92-312-5553001',
        absences: 1,
        lates: 0,
      },
      {
        classIdx: 1,
        code: 'AEA-2026-0802',
        name: 'Hira Siddiqui',
        father: 'Farooq Siddiqui',
        dob: '2012-06-25',
        gender: 'Female',
        roll: '02',
        sUser: 'hira.siddiqui',
        pUser: 'parent.farooq',
        pCode: 'PAR-2026-0802',
        pName: 'Farooq Siddiqui',
        pMobile: '+92-312-5553002',
        absences: 0,
        lates: 1,
      },
      {
        classIdx: 1,
        code: 'AEA-2026-0803',
        name: 'Daniyal Shah',
        father: 'Asif Shah',
        dob: '2012-09-09',
        gender: 'Male',
        roll: '03',
        sUser: 'daniyal.shah',
        pUser: 'parent.asif',
        pCode: 'PAR-2026-0803',
        pName: 'Asif Shah',
        pMobile: '+92-312-5553003',
        absences: 2,
        lates: 1,
      },
      // Class 3rd (class index 2)
      {
        classIdx: 2,
        code: 'AEA-2026-0301',
        name: 'Maryam Bibi',
        father: 'Shahid Ali',
        dob: '2017-04-12',
        gender: 'Female',
        roll: '01',
        sUser: 'maryam.bibi',
        pUser: 'parent.shahid',
        pCode: 'PAR-2026-0301',
        pName: 'Shahid Ali',
        pMobile: '+92-313-5554001',
        absences: 1,
        lates: 0,
      },
      {
        classIdx: 2,
        code: 'AEA-2026-0302',
        name: 'Hassan Nawaz',
        father: 'Nawaz Iqbal',
        dob: '2017-10-03',
        gender: 'Male',
        roll: '02',
        sUser: 'hassan.nawaz',
        pUser: 'parent.nawaz',
        pCode: 'PAR-2026-0302',
        pName: 'Nawaz Iqbal',
        pMobile: '+92-313-5554002',
        absences: 2,
        lates: 0,
      },
      // Class 1st (class index 3)
      {
        classIdx: 3,
        code: 'AEA-2026-0101',
        name: 'Sara Javed',
        father: 'Javed Iqbal',
        dob: '2019-01-27',
        gender: 'Female',
        roll: '01',
        sUser: 'sara.javed',
        pUser: 'parent.javed',
        pCode: 'PAR-2026-0101',
        pName: 'Javed Iqbal',
        pMobile: '+92-314-5555001',
        absences: 0,
        lates: 0,
      },
    ];

    const createdStudents: Array<{
      studentId: number;
      userId: number;
      parentUserId: number;
      classId: number;
      classIdx: number;
      name: string;
      absences: number;
      lates: number;
    }> = [];

    for (const s of studentSeeds) {
      const cls = teacherRecords[s.classIdx];
      const photo = s.gender === 'Female' ? FEMALE_AVATAR : MALE_AVATAR;

      const pUserRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, must_change_password, avatar_url)
           VALUES (?, ?, 'parent', ?, 1, 0, ?)`
        )
        .run(s.pUser, parentHash, s.pName, TEACHER_AVATAR);
      const parentUserId = Number(pUserRes.lastInsertRowid);

      db.prepare('INSERT INTO parents (user_id, parent_code, full_name, mobile) VALUES (?, ?, ?, ?)').run(
        parentUserId,
        s.pCode,
        s.pName,
        s.pMobile
      );

      const sUserRes = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, full_name, is_active, must_change_password, avatar_url)
           VALUES (?, ?, 'student', ?, 1, 0, ?)`
        )
        .run(s.sUser, studentHash, s.name, photo);
      const studentUserId = Number(sUserRes.lastInsertRowid);

      const stRes = db
        .prepare(
          `INSERT INTO students (
            user_id, student_code, full_name, father_name, photo_url, dob, gender,
            class_id, roll_number, parent_user_id, parent_name, parent_mobile, admission_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-04-02', 'active')`
        )
        .run(
          studentUserId,
          s.code,
          s.name,
          s.father,
          photo,
          s.dob,
          s.gender,
          cls.classId,
          s.roll,
          parentUserId,
          s.pName,
          s.pMobile
        );
      const studentId = Number(stRes.lastInsertRowid);

      createdStudents.push({
        studentId,
        userId: studentUserId,
        parentUserId,
        classId: cls.classId,
        classIdx: s.classIdx,
        name: s.name,
        absences: s.absences,
        lates: s.lates,
      });

      // Fees record
      db.prepare(
        `INSERT INTO fees (student_id, month, year, amount, status, paid_at, receipt_no)
         VALUES (?, 'November', 2026, 8500, ?, ?, ?)`
      ).run(
        studentId,
        s.absences > 2 ? 'Pending' : 'Paid',
        s.absences > 2 ? null : '2026-11-05',
        s.absences > 2 ? null : `AEA-RCP-${studentId}11`
      );
    }

    // 6. Historical Attendance (last 20 school days excluding Sundays, starting from yesterday)
    const schoolDays: string[] = [];
    for (let d = 1; d <= 26 && schoolDays.length < 20; d++) {
      const dateStr = getPktDateDaysAgo(d);
      if (getPktDayOfWeek(dateStr) !== 0) {
        schoolDays.push(dateStr);
      }
    }

    schoolDays.forEach((dateStr, dayIdx) => {
      teacherRecords.forEach((tr, tIdx) => {
        // Teacher attendance
        const tStatus = tIdx === 3 && dayIdx === 2 ? 'Leave' : 'Present';
        db.prepare(
          `INSERT INTO teacher_attendance (teacher_id, date, status, check_in_time, notes, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(tr.teacherId, dateStr, tStatus, tStatus === 'Present' ? '07:50 AM' : null, null, principalUserId);

        // Class students
        const classStudents = createdStudents.filter((st) => st.classId === tr.classId);
        let pCount = 0;
        let aCount = 0;
        let lCount = 0;
        let lvCount = 0;

        const statuses: Array<{ studentId: number; status: string }> = classStudents.map((st, sIdx) => {
          let status = 'Present';
          if (dayIdx < st.absences && (dayIdx + sIdx) % 3 === 0) {
            status = 'Absent';
          } else if (dayIdx === 4 && st.absences > 0) {
            status = 'Absent';
          } else if (dayIdx === 9 && st.absences > 1) {
            status = 'Absent';
          } else if (dayIdx === 14 && st.absences > 2) {
            status = 'Absent';
          } else if (dayIdx === 6 && st.lates > 0) {
            status = 'Late';
          } else if (dayIdx === 11 && sIdx === 2 && st.absences > 0) {
            status = 'Leave';
          }

          if (status === 'Present') pCount++;
          else if (status === 'Absent') aCount++;
          else if (status === 'Late') lCount++;
          else lvCount++;

          return { studentId: st.studentId, status };
        });

        const subRes = db
          .prepare(
            `INSERT INTO attendance_submissions (
              class_id, date, teacher_id, submitted_at, pkt_time_str,
              total_students, present_count, absent_count, late_count, leave_count, is_locked
            ) VALUES (?, ?, ?, ?, '08:42:15', ?, ?, ?, ?, ?, 1)`
          )
          .run(tr.classId, dateStr, tr.teacherId, `${dateStr} 08:42:15`, classStudents.length, pCount, aCount, lCount, lvCount);
        const subId = Number(subRes.lastInsertRowid);

        for (const item of statuses) {
          db.prepare(
            `INSERT INTO attendance (submission_id, student_id, class_id, date, status, marked_by, marked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(subId, item.studentId, tr.classId, dateStr, item.status, tr.userId, `${dateStr} 08:42:15`);
        }
      });
    });

    // 7. Homework
    const todayStr = getPktDateDaysAgo(0);
    const tomorrowStr = getPktDateDaysAgo(-1);
    const twoDaysLater = getPktDateDaysAgo(-2);
    const threeDaysAgo = getPktDateDaysAgo(3);

    db.prepare(
      `INSERT INTO homework (class_id, teacher_id, subject, title, description, assigned_date, due_date, status, published_at)
       VALUES (?, ?, 'Mathematics', 'Fractions & Decimals Practice Set 4', 'Solve Exercise 4.2 Questions 1 to 10 in your Mathematics notebook and show complete working steps.', ?, ?, 'published', ?)`
    ).run(teacherRecords[0].classId, teacherRecords[0].teacherId, todayStr, twoDaysLater, `${todayStr} 09:15:00`);

    db.prepare(
      `INSERT INTO homework (class_id, teacher_id, subject, title, description, assigned_date, due_date, status, published_at)
       VALUES (?, ?, 'Science', 'Photosynthesis Diagram & Notes', 'Draw a neat labeled diagram of leaf cross-section and summarize light and dark reactions.', ?, ?, 'published', ?)`
    ).run(teacherRecords[0].classId, teacherRecords[0].teacherId, threeDaysAgo, tomorrowStr, `${threeDaysAgo} 10:00:00`);

    db.prepare(
      `INSERT INTO homework (class_id, teacher_id, subject, title, description, assigned_date, due_date, status, published_at)
       VALUES (?, ?, 'Physics', 'Newton Laws Numerical Problems', 'Complete Chapter 3 End-of-Chapter numericals 3.1 through 3.6.', ?, ?, 'published', ?)`
    ).run(teacherRecords[1].classId, teacherRecords[1].teacherId, todayStr, twoDaysLater, `${todayStr} 09:30:00`);

    // 8. Tests & Results
    const gradedTestRes = db
      .prepare(
        `INSERT INTO tests (class_id, teacher_id, title, subject, test_type, test_date, total_marks, syllabus, instructions, status)
         VALUES (?, ?, 'Monthly Mathematics Assessment', 'Mathematics', 'Monthly', ?, 50, 'Chapters 1–3: Whole Numbers, Factors & Fractions', 'Calculators are not permitted. Show all steps.', 'published')`
      )
      .run(teacherRecords[0].classId, teacherRecords[0].teacherId, getPktDateDaysAgo(5));
    const gradedTestId = Number(gradedTestRes.lastInsertRowid);

    const upcomingTestRes = db
      .prepare(
        `INSERT INTO tests (class_id, teacher_id, title, subject, test_type, test_date, total_marks, syllabus, instructions, status)
         VALUES (?, ?, 'Weekly Science Quiz', 'Science', 'Weekly', ?, 25, 'Chapter 3: Plant Systems & Respiration', 'Please prepare Chapter 3 thoroughly.', 'published')`
      )
      .run(teacherRecords[0].classId, teacherRecords[0].teacherId, twoDaysLater);
    void upcomingTestRes;

    const class5Students = createdStudents.filter((st) => st.classIdx === 0);
    const sampleScores = [48, 45, 42, 39, 46];
    class5Students.forEach((st, idx) => {
      const obtained = sampleScores[idx] ?? 40;
      const pct = Number(((obtained / 50) * 100).toFixed(1));
      const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : 'D';
      db.prepare(
        `INSERT INTO test_results (test_id, student_id, obtained_marks, total_marks, percentage, grade, remarks, recorded_by)
         VALUES (?, ?, ?, 50, ?, ?, ?, ?)`
      ).run(gradedTestId, st.studentId, obtained, pct, grade, pct >= 90 ? 'Outstanding performance' : 'Good progress', teacherRecords[0].userId);
    });

    // 9. Announcements & Holidays
    db.prepare(
      `INSERT INTO announcements (title, content, target_role, priority, created_by)
       VALUES (?, ?, 'all', 'important', ?)`
    ).run(
      'Winter Academic Schedule & Morning Assembly',
      'All classes commence promptly at 08:00 AM PKT. Teachers must finalize daily attendance before 11:59 AM PKT.',
      principalUserId
    );
    db.prepare(
      `INSERT INTO announcements (title, content, target_role, priority, created_by)
       VALUES (?, ?, 'parent', 'normal', ?)`
    ).run(
      'Parent-Teacher Conference Notice',
      'Monthly progress reviews for Classes 1st through 8th will be held on the last Saturday of this month from 09:00 AM to 01:00 PM.',
      principalUserId
    );

    db.prepare('INSERT INTO holidays (date, title, description) VALUES (?, ?, ?)').run(
      '2026-12-25',
      'Quaid-e-Azam Day',
      'National public holiday — Academy closed.'
    );
    db.prepare('INSERT INTO holidays (date, title, description) VALUES (?, ?, ?)').run(
      '2027-02-05',
      'Kashmir Solidarity Day',
      'National public holiday — Academy closed.'
    );

    // 10. Initial Notifications for Principal, Teachers, Students, Parents
    db.prepare(
      `INSERT INTO notifications (recipient_user_id, type, title, message, link_tab)
       VALUES (?, 'security', 'Security Action Required', 'You are signed in with the initial demo Principal password. Update your password in Account Security.', 'settings')`
    ).run(principalUserId);

    for (const st of class5Students) {
      db.prepare(
        `INSERT INTO notifications (recipient_user_id, type, title, message, link_tab)
         VALUES (?, 'homework', 'New Mathematics Homework', 'New Mathematics Homework has been assigned to Class 5th.', 'homework')`
      ).run(st.userId);
      db.prepare(
        `INSERT INTO notifications (recipient_user_id, type, title, message, link_tab)
         VALUES (?, 'homework', 'New Mathematics Homework', 'New Mathematics Homework has been assigned to Class 5th.', 'homework')`
      ).run(st.parentUserId);
    }
  });

  tx();
}
