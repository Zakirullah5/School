import type { PktTimeInfo, UserRole } from '../types';

const IDB_NAME = 'abdali_academy_static_db';
const IDB_STORE = 'state';
const IDB_KEY = 'academy_v1';

type StaticListener = (event: string, payload: unknown) => void;
const staticListeners = new Set<StaticListener>();

export function subscribeStaticEvents(fn: StaticListener): () => void {
  staticListeners.add(fn);
  return () => staticListeners.delete(fn);
}

function emitStaticEvent(event: string, payload: unknown) {
  for (const fn of staticListeners) {
    fn(event, payload);
  }
}

function getPktNow(now = new Date()): PktTimeInfo {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const rawHour = Number(map.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(map.minute);
  const second = Number(map.second);
  const date = `${map.year}-${map.month}-${map.day}`;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const totalMinutes = hour * 60 + minute;
  const isAttendanceWindowOpen = totalMinutes >= 8 * 60 && totalMinutes <= 11 * 60 + 59;
  const windowStatus =
    totalMinutes < 8 * 60 ? 'before_open' : totalMinutes > 11 * 60 + 59 ? 'locked_after' : 'open';
  const windowMessage =
    windowStatus === 'before_open'
      ? 'Attendance submission opens at 08:00 AM PKT.'
      : windowStatus === 'locked_after'
      ? 'Attendance submission locked after 11:59 AM PKT.'
      : 'Attendance submission window is open (08:00 AM – 11:59 AM PKT).';

  return {
    date,
    time,
    hour,
    minute,
    second,
    isAttendanceWindowOpen,
    windowStatus,
    windowMessage,
    serverTimestampMs: now.getTime(),
  };
}

function pktDaysAgo(daysAgo: number): string {
  return getPktNow(new Date(Date.now() - daysAgo * 86400 * 1000)).date;
}

function pktDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

interface StaticDB {
  nextId: number;
  settings: Record<string, string>;
  sessions: any[];
  users: any[];
  principals: any[];
  teachers: any[];
  classes: any[];
  subjects: any[];
  parents: any[];
  students: any[];
  attendance_submissions: any[];
  attendance: any[];
  teacher_attendance: any[];
  correction_requests: any[];
  audit_logs: any[];
  homework: any[];
  tests: any[];
  test_results: any[];
  notifications: any[];
  announcements: any[];
  holidays: any[];
  timetable: any[];
  fees: any[];
}

function createInitialStaticDB(): StaticDB {
  let id = 1;
  const next = () => id++;
  const MALE = './src/assets/images/avatar_student_male_1795627463854.jpg';
  const FEMALE = './src/assets/images/avatar_student_female_1795627464479.jpg';
  const TEACHER_AV = './src/assets/images/avatar_teacher_portrait_1795627465105.jpg';

  const db: StaticDB = {
    nextId: 1000,
    settings: {
      academy_name: 'ABDALI EDUCATION ACADEMY',
      campus_address: 'Academic Boulevard, Islamabad',
      attendance_start_pkt: '08:00',
      attendance_end_pkt: '11:59',
      late_counts_as_present: '1',
      leave_excluded_from_denominator: '1',
    },
    sessions: [
      { id: 1, name: '2026-2027', start_date: '2026-04-01', end_date: '2027-03-31', is_active: 1 },
      { id: 2, name: '2025-2026', start_date: '2025-04-01', end_date: '2026-03-31', is_active: 0 },
    ],
    users: [],
    principals: [],
    teachers: [],
    classes: [],
    subjects: [],
    parents: [],
    students: [],
    attendance_submissions: [],
    attendance: [],
    teacher_attendance: [],
    correction_requests: [],
    audit_logs: [],
    homework: [],
    tests: [],
    test_results: [],
    notifications: [],
    announcements: [],
    holidays: [
      { id: 1, date: '2026-12-25', title: 'Quaid-e-Azam Day', description: 'National public holiday — Academy closed.' },
      { id: 2, date: '2027-02-05', title: 'Kashmir Solidarity Day', description: 'National public holiday — Academy closed.' },
    ],
    timetable: [],
    fees: [],
  };

  // Principal
  const pUserId = next();
  db.users.push({
    id: pUserId,
    username: 'Ali',
    password: 'Ali',
    role: 'principal',
    full_name: 'Principal Ali',
    is_active: 1,
    must_change_password: 1,
    avatar_url: TEACHER_AV,
    sound_alerts: 1,
    push_enabled: 0,
  });
  db.principals.push({ user_id: pUserId, principal_code: 'PRI-001', designation: 'Principal & Director' });

  const teacherSpecs = [
    { username: 'teacher.fatima', full_name: 'Fatima Noor', code: 'TCH-2026-001', specialty: 'Mathematics & Science', phone: '+92-301-5551101', qual: 'M.Sc Mathematics', classCode: 'CLS-05', className: '5th', room: 'Room 201' },
    { username: 'teacher.bilal', full_name: 'Bilal Ahmed', code: 'TCH-2026-002', specialty: 'Physics & Computer Science', phone: '+92-302-5551102', qual: 'M.Phil Physics', classCode: 'CLS-08', className: '8th', room: 'Room 301' },
    { username: 'teacher.ayesha', full_name: 'Ayesha Tariq', code: 'TCH-2026-003', specialty: 'English & Social Studies', phone: '+92-303-5551103', qual: 'M.A English Literature', classCode: 'CLS-03', className: '3rd', room: 'Room 103' },
    { username: 'teacher.usman', full_name: 'Usman Raza', code: 'TCH-2026-004', specialty: 'General Education & Urdu', phone: '+92-304-5551104', qual: 'B.Ed (Hons)', classCode: 'CLS-01', className: '1st', room: 'Room 101' },
  ];

  const tRecords: Array<{ teacherId: number; userId: number; classId: number; fullName: string }> = [];
  teacherSpecs.forEach((t) => {
    const uId = next();
    db.users.push({
      id: uId,
      username: t.username,
      password: 'Teacher@123',
      role: 'teacher',
      full_name: t.full_name,
      is_active: 1,
      must_change_password: 0,
      avatar_url: TEACHER_AV,
      sound_alerts: 1,
      push_enabled: 0,
    });
    const tId = next();
    db.teachers.push({
      id: tId,
      user_id: uId,
      teacher_code: t.code,
      subject_specialty: t.specialty,
      phone: t.phone,
      qualification: t.qual,
      joining_date: '2024-08-15',
      status: 'active',
    });
    const cId = next();
    db.classes.push({
      id: cId,
      class_code: t.classCode,
      name: t.className,
      section: 'A',
      room_number: t.room,
      teacher_id: tId,
      academic_session_id: 1,
    });
    tRecords.push({ teacherId: tId, userId: uId, classId: cId, fullName: t.full_name });

    ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'].forEach((subj, idx) => {
      db.subjects.push({ id: next(), code: `${t.classCode}-SUB-${idx + 1}`, name: subj, class_id: cId });
    });
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach((day, dIdx) => {
      const slots = [
        ['08:00', '08:45'],
        ['08:45', '09:30'],
        ['09:45', '10:30'],
      ];
      const subjects = ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'];
      slots.forEach(([start_time, end_time], pIdx) => {
        db.timetable.push({
          id: next(),
          class_id: cId,
          day_of_week: day,
          period_number: pIdx + 1,
          start_time,
          end_time,
          subject: subjects[(dIdx + pIdx) % subjects.length],
          teacher_name: t.full_name,
        });
      });
    });
  });

  const studentSeeds = [
    { classIdx: 0, code: 'AEA-2026-0501', name: 'Ahmad Khan', father: 'Tariq Khan', dob: '2015-05-14', gender: 'Male', roll: '01', sUser: 'ahmad.khan', pUser: 'parent.tariq', pCode: 'PAR-2026-0501', pName: 'Tariq Khan', pMobile: '+92-311-5552001', absences: 0 },
    { classIdx: 0, code: 'AEA-2026-0502', name: 'Ali Raza', father: 'Salman Raza', dob: '2015-08-22', gender: 'Male', roll: '02', sUser: 'ali.raza', pUser: 'parent.salman', pCode: 'PAR-2026-0502', pName: 'Salman Raza', pMobile: '+92-311-5552002', absences: 1 },
    { classIdx: 0, code: 'AEA-2026-0503', name: 'Hamza Malik', father: 'Imran Malik', dob: '2015-03-10', gender: 'Male', roll: '03', sUser: 'hamza.malik', pUser: 'parent.imran', pCode: 'PAR-2026-0503', pName: 'Imran Malik', pMobile: '+92-311-5552003', absences: 2 },
    { classIdx: 0, code: 'AEA-2026-0504', name: 'Usman Tariq', father: 'Tariq Mahmood', dob: '2015-11-02', gender: 'Male', roll: '04', sUser: 'usman.tariq', pUser: 'parent.mahmood', pCode: 'PAR-2026-0504', pName: 'Tariq Mahmood', pMobile: '+92-311-5552004', absences: 3 },
    { classIdx: 0, code: 'AEA-2026-0505', name: 'Zainab Fatima', father: 'Kamran Siddiqui', dob: '2015-07-19', gender: 'Female', roll: '05', sUser: 'zainab.fatima', pUser: 'parent.kamran', pCode: 'PAR-2026-0505', pName: 'Kamran Siddiqui', pMobile: '+92-311-5552005', absences: 1 },
    { classIdx: 1, code: 'AEA-2026-0801', name: 'Saad Qureshi', father: 'Nadeem Qureshi', dob: '2012-02-18', gender: 'Male', roll: '01', sUser: 'saad.qureshi', pUser: 'parent.nadeem', pCode: 'PAR-2026-0801', pName: 'Nadeem Qureshi', pMobile: '+92-312-5553001', absences: 1 },
    { classIdx: 1, code: 'AEA-2026-0802', name: 'Hira Siddiqui', father: 'Farooq Siddiqui', dob: '2012-06-25', gender: 'Female', roll: '02', sUser: 'hira.siddiqui', pUser: 'parent.farooq', pCode: 'PAR-2026-0802', pName: 'Farooq Siddiqui', pMobile: '+92-312-5553002', absences: 0 },
    { classIdx: 2, code: 'AEA-2026-0301', name: 'Maryam Bibi', father: 'Shahid Ali', dob: '2017-04-12', gender: 'Female', roll: '01', sUser: 'maryam.bibi', pUser: 'parent.shahid', pCode: 'PAR-2026-0301', pName: 'Shahid Ali', pMobile: '+92-313-5554001', absences: 1 },
    { classIdx: 3, code: 'AEA-2026-0101', name: 'Sara Javed', father: 'Javed Iqbal', dob: '2019-01-27', gender: 'Female', roll: '01', sUser: 'sara.javed', pUser: 'parent.javed', pCode: 'PAR-2026-0101', pName: 'Javed Iqbal', pMobile: '+92-314-5555001', absences: 0 },
  ];

  const createdStudents: any[] = [];
  studentSeeds.forEach((s) => {
    const cls = tRecords[s.classIdx];
    const photo = s.gender === 'Female' ? FEMALE : MALE;
    const puId = next();
    db.users.push({
      id: puId,
      username: s.pUser,
      password: 'Parent@123',
      role: 'parent',
      full_name: s.pName,
      is_active: 1,
      must_change_password: 0,
      avatar_url: TEACHER_AV,
      sound_alerts: 1,
      push_enabled: 0,
    });
    db.parents.push({ id: next(), user_id: puId, parent_code: s.pCode, full_name: s.pName, mobile: s.pMobile });

    const suId = next();
    db.users.push({
      id: suId,
      username: s.sUser,
      password: 'Student@123',
      role: 'student',
      full_name: s.name,
      is_active: 1,
      must_change_password: 0,
      avatar_url: photo,
      sound_alerts: 1,
      push_enabled: 0,
    });

    const stId = next();
    const stObj = {
      id: stId,
      user_id: suId,
      student_code: s.code,
      full_name: s.name,
      father_name: s.father,
      photo_url: photo,
      dob: s.dob,
      gender: s.gender,
      class_id: cls.classId,
      roll_number: s.roll,
      parent_user_id: puId,
      parent_name: s.pName,
      parent_mobile: s.pMobile,
      admission_date: '2026-04-02',
      status: 'active',
    };
    db.students.push(stObj);
    createdStudents.push({ ...stObj, absences: s.absences, classIdx: s.classIdx });

    db.fees.push({
      id: next(),
      student_id: stId,
      month: 'November',
      year: 2026,
      amount: 8500,
      status: s.absences > 2 ? 'Pending' : 'Paid',
      paid_at: s.absences > 2 ? null : '2026-11-05',
      receipt_no: s.absences > 2 ? null : `AEA-RCP-${stId}11`,
    });
  });

  // Historical attendance (15 school days)
  const schoolDays: string[] = [];
  for (let d = 1; d <= 20 && schoolDays.length < 15; d++) {
    const dt = pktDaysAgo(d);
    if (pktDayOfWeek(dt) !== 0) schoolDays.push(dt);
  }
  schoolDays.forEach((dateStr, dayIdx) => {
    tRecords.forEach((tr) => {
      db.teacher_attendance.push({
        id: next(),
        teacher_id: tr.teacherId,
        date: dateStr,
        status: 'Present',
        check_in_time: '07:50 AM',
      });
      const clsStudents = createdStudents.filter((st) => st.class_id === tr.classId);
      let p = 0, a = 0, l = 0, lv = 0;
      const subId = next();
      clsStudents.forEach((st) => {
        let status = 'Present';
        if (dayIdx === 3 && st.absences > 0) status = 'Absent';
        else if (dayIdx === 7 && st.absences > 1) status = 'Absent';
        else if (dayIdx === 11 && st.absences > 2) status = 'Absent';
        if (status === 'Present') p++;
        else if (status === 'Absent') a++;
        else if (status === 'Late') l++;
        else lv++;
        db.attendance.push({
          id: next(),
          submission_id: subId,
          student_id: st.id,
          class_id: tr.classId,
          date: dateStr,
          status,
          marked_by: tr.userId,
          marked_at: `${dateStr} 08:42:15`,
        });
      });
      db.attendance_submissions.push({
        id: subId,
        class_id: tr.classId,
        date: dateStr,
        teacher_id: tr.teacherId,
        submitted_at: `${dateStr} 08:42:15`,
        pkt_time_str: '08:42:15',
        total_students: clsStudents.length,
        present_count: p,
        absent_count: a,
        late_count: l,
        leave_count: lv,
        is_locked: 1,
      });
    });
  });

  const today = pktDaysAgo(0);
  const twoDaysLater = pktDaysAgo(-2);
  db.homework.push({
    id: next(),
    class_id: tRecords[0].classId,
    teacher_id: tRecords[0].teacherId,
    subject: 'Mathematics',
    title: 'Fractions & Decimals Practice Set 4',
    description: 'Solve Exercise 4.2 Questions 1 to 10 in your Mathematics notebook.',
    assigned_date: today,
    due_date: twoDaysLater,
    attachment_url: null,
    attachment_name: null,
    status: 'published',
    published_at: `${today} 09:15:00`,
  });

  const test1Id = next();
  db.tests.push({
    id: test1Id,
    class_id: tRecords[0].classId,
    teacher_id: tRecords[0].teacherId,
    title: 'Monthly Mathematics Assessment',
    subject: 'Mathematics',
    test_type: 'Monthly',
    test_date: pktDaysAgo(5),
    total_marks: 50,
    syllabus: 'Chapters 1–3: Whole Numbers, Factors & Fractions',
    instructions: 'Show all calculation steps.',
    status: 'published',
  });
  db.tests.push({
    id: next(),
    class_id: tRecords[0].classId,
    teacher_id: tRecords[0].teacherId,
    title: 'Weekly Science Quiz',
    subject: 'Science',
    test_type: 'Weekly',
    test_date: twoDaysLater,
    total_marks: 25,
    syllabus: 'Chapter 3: Plant Systems & Respiration',
    instructions: 'Prepare Chapter 3 thoroughly.',
    status: 'published',
  });

  const c5Students = createdStudents.filter((s) => s.classIdx === 0);
  const scores = [48, 45, 42, 39, 46];
  c5Students.forEach((st, idx) => {
    const obtained = scores[idx] ?? 40;
    const pct = Number(((obtained / 50) * 100).toFixed(1));
    const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : 'C';
    db.test_results.push({
      id: next(),
      test_id: test1Id,
      student_id: st.id,
      obtained_marks: obtained,
      total_marks: 50,
      percentage: pct,
      grade,
      remarks: pct >= 90 ? 'Outstanding performance' : 'Good progress',
      recorded_by: tRecords[0].userId,
    });
  });

  db.announcements.push({
    id: next(),
    title: 'Winter Academic Schedule & Morning Assembly',
    content: 'All classes commence promptly at 08:00 AM PKT. Teachers must finalize daily attendance before 11:59 AM PKT.',
    target_role: 'all',
    priority: 'important',
    created_by: pUserId,
    created_at: `${today} 08:00:00`,
  });

  db.notifications.push({
    id: next(),
    recipient_user_id: pUserId,
    type: 'security',
    title: 'Security Action Required',
    message: 'You are signed in with the initial demo Principal password. Update your password in Account Security.',
    link_tab: 'settings',
    is_read: 0,
    created_at: `${today} 08:00:00`,
  });

  db.nextId = id + 10;
  return db;
}

function openIDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('IndexedDB open timeout'));
      }
    }, 1500);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve(req.result);
        }
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(req.error);
        }
      };
      req.onblocked = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('IndexedDB blocked'));
        }
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      }
    }
  });
}

let cachedDb: StaticDB | null = null;
let currentStaticUserId: number | null = null;

async function getDB(): Promise<StaticDB> {
  if (cachedDb) return cachedDb;
  try {
    const idb = await openIDB();
    const loaded = await new Promise<StaticDB | undefined>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result as StaticDB | undefined);
      req.onerror = () => resolve(undefined);
    });
    if (loaded && Array.isArray(loaded.users) && loaded.users.length > 0) {
      cachedDb = loaded;
      return cachedDb;
    }
  } catch {
    // Fallback to in-memory if IndexedDB is blocked
  }
  cachedDb = createInitialStaticDB();
  await saveDB(cachedDb);
  return cachedDb;
}

async function saveDB(db: StaticDB): Promise<void> {
  cachedDb = db;
  try {
    const idb = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(db, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB write error
  }
}

function summarizeAtt(db: StaticDB, rows: Array<{ status: string }>) {
  const lateAsPresent = db.settings.late_counts_as_present !== '0';
  const leaveExcluded = db.settings.leave_excluded_from_denominator !== '0';
  let presentDays = 0, absentDays = 0, lateDays = 0, leaveDays = 0;
  for (const r of rows) {
    if (r.status === 'Present') presentDays++;
    else if (r.status === 'Absent') absentDays++;
    else if (r.status === 'Late') lateDays++;
    else if (r.status === 'Leave') leaveDays++;
  }
  const totalDays = rows.length;
  const countedDays = leaveExcluded ? presentDays + absentDays + lateDays : totalDays;
  const effectivePresent = lateAsPresent ? presentDays + lateDays : presentDays;
  const percentage = countedDays > 0 ? Number(((effectivePresent / countedDays) * 100).toFixed(1)) : 0;
  return { totalDays, countedDays, presentDays, absentDays, lateDays, leaveDays, percentage };
}

function buildUserProfile(db: StaticDB, u: any) {
  const base = {
    id: u.id,
    username: u.username,
    role: u.role as UserRole,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    mustChangePassword: Boolean(u.must_change_password),
    soundAlerts: Boolean(u.sound_alerts),
    pushEnabled: Boolean(u.push_enabled),
  };
  if (u.role === 'principal') {
    const p = db.principals.find((x) => x.user_id === u.id);
    return { ...base, code: p?.principal_code || 'PRI-001', designation: p?.designation || 'Principal' };
  }
  if (u.role === 'teacher') {
    const t = db.teachers.find((x) => x.user_id === u.id);
    const cls = t ? db.classes.find((c) => c.teacher_id === t.id) : null;
    return { ...base, teacherId: t?.id, code: t?.teacher_code, subjectSpecialty: t?.subject_specialty, assignedClass: cls || null };
  }
  if (u.role === 'student') {
    const s = db.students.find((x) => x.user_id === u.id);
    const cls = s ? db.classes.find((c) => c.id === s.class_id) : null;
    return { ...base, studentId: s?.id, code: s?.student_code, className: cls?.name, rollNumber: s?.roll_number };
  }
  const par = db.parents.find((x) => x.user_id === u.id);
  return { ...base, code: par?.parent_code || 'PAR' };
}

function buildStudentFullProfile(db: StaticDB, studentId: number) {
  const s = db.students.find((x) => x.id === studentId);
  if (!s) return null;
  const u = db.users.find((x) => x.id === s.user_id);
  const pu = db.users.find((x) => x.id === s.parent_user_id);
  const cls = db.classes.find((x) => x.id === s.class_id);
  const teacher = cls?.teacher_id ? db.teachers.find((t) => t.id === cls.teacher_id) : null;
  const teacherUser = teacher ? db.users.find((x) => x.id === teacher.user_id) : null;

  const attRows = db.attendance.filter((a) => a.student_id === studentId).sort((a, b) => b.date.localeCompare(a.date));
  const pkt = getPktNow();
  const curMonth = pkt.date.slice(0, 7);
  const curYear = pkt.date.slice(0, 4);

  const byMonth = new Map<string, any[]>();
  for (const r of attRows) {
    const m = r.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r);
  }
  const monthlySeries = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, items]) => ({ month, ...summarizeAtt(db, items) }));

  const homeworkHistory = db.homework
    .filter((h) => h.class_id === s.class_id && h.status === 'published')
    .sort((a, b) => b.assigned_date.localeCompare(a.assigned_date));

  const testResults = db.test_results
    .filter((tr) => tr.student_id === studentId)
    .map((tr) => {
      const test = db.tests.find((t) => t.id === tr.test_id);
      const allForTest = db.test_results.filter((x) => x.test_id === tr.test_id);
      const pos = allForTest.filter((x) => x.obtained_marks > tr.obtained_marks).length + 1;
      return {
        ...tr,
        test_title: test?.title || 'Test',
        subject: test?.subject || '',
        test_type: test?.test_type || '',
        test_date: test?.test_date || '',
        class_position: pos,
        total_appeared: allForTest.length,
      };
    });

  return {
    student: {
      ...s,
      student_username: u?.username,
      parent_username: pu?.username,
      class_name: cls?.name || '',
      class_code: cls?.class_code || '',
      section: cls?.section || 'A',
      room_number: cls?.room_number || '',
      class_teacher_name: teacherUser?.full_name || 'Assigned Faculty',
    },
    attendanceAnalytics: {
      overall: summarizeAtt(db, attRows),
      monthly: summarizeAtt(db, attRows.filter((a) => a.date.startsWith(curMonth))),
      yearly: summarizeAtt(db, attRows.filter((a) => a.date.startsWith(curYear))),
      monthlySeries,
    },
    attendanceRecords: attRows.slice(0, 60),
    homeworkHistory,
    testResults,
    fees: db.fees.filter((f) => f.student_id === studentId),
  };
}

function getRankings(db: StaticDB, classId?: number) {
  const sts = db.students.filter((s) => s.status === 'active' && (!classId || s.class_id === classId));
  const attendanceRanking = sts
    .map((s) => {
      const cls = db.classes.find((c) => c.id === s.class_id);
      const stats = summarizeAtt(db, db.attendance.filter((a) => a.student_id === s.id));
      return { ...s, class_name: cls?.name || '', attendancePercentage: stats.percentage };
    })
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const academicRanking = sts
    .map((s) => {
      const cls = db.classes.find((c) => c.id === s.class_id);
      const trs = db.test_results.filter((tr) => tr.student_id === s.id);
      const obt = trs.reduce((acc, x) => acc + x.obtained_marks, 0);
      const tot = trs.reduce((acc, x) => acc + x.total_marks, 0);
      const pct = tot > 0 ? Number(((obt / tot) * 100).toFixed(1)) : 0;
      return { ...s, class_name: cls?.name || '', academicPercentage: pct, testCount: trs.length };
    })
    .sort((a, b) => b.academicPercentage - a.academicPercentage)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { attendanceRanking, academicRanking };
}

function pushNotif(db: StaticDB, recipientUserId: number, type: string, title: string, message: string, linkTab?: string) {
  const pkt = getPktNow();
  const n = {
    id: db.nextId++,
    recipient_user_id: recipientUserId,
    type,
    title,
    message,
    link_tab: linkTab || null,
    is_read: 0,
    created_at: `${pkt.date} ${pkt.time}`,
  };
  db.notifications.unshift(n);
  if (recipientUserId === currentStaticUserId) {
    emitStaticEvent('notification:new', n);
  }
}

function addAudit(db: StaticDB, actor: any, actionType: string, targetTable: string, targetId: string | number, oldVal: unknown, newVal: unknown, reason?: string) {
  const pkt = getPktNow();
  db.audit_logs.unshift({
    id: db.nextId++,
    actor_user_id: actor.id,
    actor_name: actor.full_name,
    actor_role: actor.role,
    action_type: actionType,
    target_table: targetTable,
    target_id: String(targetId),
    old_value: oldVal ? JSON.stringify(oldVal) : null,
    new_value: newVal ? JSON.stringify(newVal) : null,
    reason: reason || null,
    created_at: `${pkt.date} ${pkt.time}`,
  });
}

export async function handleStaticApiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const db = await getDB();
  const pkt = getPktNow();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const authHeader =
    options.headers instanceof Headers
      ? options.headers.get('Authorization')
      : (options.headers as Record<string, string> | undefined)?.Authorization;
  if (authHeader?.startsWith('Bearer static:')) {
    currentStaticUserId = Number(authHeader.slice(14));
  }

  const requireUser = () => {
    const u = db.users.find((x) => x.id === currentStaticUserId);
    if (!u || !u.is_active) throw new Error('Authentication required. Please sign in.');
    return u;
  };

  // Health
  if (pathname === '/api/health') {
    return { ok: true, pkt, settings: db.settings } as T;
  }

  // Auth
  if (pathname === '/api/auth/login' && method === 'POST') {
    const clean = String(body.username || '').trim().toLowerCase();
    const u = db.users.find((x) => {
      if (x.username.toLowerCase() === clean) return true;
      const s = db.students.find((st) => st.user_id === x.id && st.student_code.toLowerCase() === clean);
      const t = db.teachers.find((tc) => tc.user_id === x.id && tc.teacher_code.toLowerCase() === clean);
      const p = db.parents.find((pa) => pa.user_id === x.id && pa.parent_code.toLowerCase() === clean);
      return Boolean(s || t || p);
    });
    if (!u || u.password !== body.password) {
      throw new Error('Invalid credentials. Please check your ID/username and password.');
    }
    if (body.portalRole && u.role !== body.portalRole) {
      throw new Error(`This account belongs to the ${u.role.toUpperCase()} portal.`);
    }
    if (!u.is_active) throw new Error('This account has been deactivated by the Principal.');
    currentStaticUserId = u.id;
    addAudit(db, u, 'LOGIN', 'users', u.id, null, { portalRole: u.role });
    await saveDB(db);
    return { token: `static:${u.id}`, user: buildUserProfile(db, u) } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    currentStaticUserId = null;
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/me') {
    const u = requireUser();
    return {
      user: buildUserProfile(db, u),
      pkt,
      unreadNotifications: db.notifications.filter((n) => n.recipient_user_id === u.id && !n.is_read).length,
    } as T;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const u = requireUser();
    if (u.password !== body.currentPassword) throw new Error('Current password is incorrect.');
    if (!body.newPassword || body.newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
    u.password = body.newPassword;
    u.must_change_password = 0;
    addAudit(db, u, 'PASSWORD_CHANGED', 'users', u.id, null, { changed: true });
    await saveDB(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/preferences' && method === 'PUT') {
    const u = requireUser();
    u.sound_alerts = body.soundAlerts ? 1 : 0;
    u.push_enabled = body.pushEnabled ? 1 : 0;
    await saveDB(db);
    return { ok: true } as T;
  }

  // Notifications
  if (pathname === '/api/notifications') {
    const u = requireUser();
    return { notifications: db.notifications.filter((n) => n.recipient_user_id === u.id) } as T;
  }
  if (pathname.match(/^\/api\/notifications\/\d+\/read$/) && method === 'POST') {
    const u = requireUser();
    const id = Number(pathname.split('/')[3]);
    const n = db.notifications.find((x) => x.id === id && x.recipient_user_id === u.id);
    if (n) n.is_read = 1;
    await saveDB(db);
    return { ok: true } as T;
  }
  if (pathname === '/api/notifications/read-all' && method === 'POST') {
    const u = requireUser();
    db.notifications.filter((n) => n.recipient_user_id === u.id).forEach((n) => (n.is_read = 1));
    await saveDB(db);
    return { ok: true } as T;
  }

  // Shared
  if (pathname === '/api/announcements') {
    const u = requireUser();
    const list =
      u.role === 'principal'
        ? db.announcements
        : db.announcements.filter((a) => a.target_role === 'all' || a.target_role === u.role);
    return { announcements: list } as T;
  }
  if (pathname === '/api/holidays') return { holidays: db.holidays } as T;
  if (pathname === '/api/timetable') {
    const u = requireUser();
    let cid: number | undefined;
    if (u.role === 'teacher') {
      const t = db.teachers.find((x) => x.user_id === u.id);
      cid = db.classes.find((c) => c.teacher_id === t?.id)?.id;
    } else if (u.role === 'student') {
      cid = db.students.find((s) => s.user_id === u.id)?.class_id;
    } else if (u.role === 'parent') {
      cid = db.students.find((s) => s.parent_user_id === u.id)?.class_id;
    }
    const rows = (cid ? db.timetable.filter((x) => x.class_id === cid) : db.timetable).map((slot) => ({
      ...slot,
      class_name: db.classes.find((c) => c.id === slot.class_id)?.name || '',
    }));
    return { timetable: rows } as T;
  }

  // Principal routes
  if (pathname.startsWith('/api/principal/')) {
    const u = requireUser();
    if (u.role !== 'principal') throw new Error('Access denied for your account role.');

    if (pathname === '/api/principal/overview') {
      const todayAtt = db.attendance.filter((a) => a.date === pkt.date);
      const todayPresent = todayAtt.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      const todayAbsent = todayAtt.filter((a) => a.status === 'Absent').length;
      const overall = summarizeAtt(db, db.attendance);
      const tAtt = db.teacher_attendance.filter((a) => a.date === pkt.date);
      const submittedSet = new Set(db.attendance_submissions.filter((s) => s.date === pkt.date).map((s) => s.class_id));
      const pendingSubmissions = db.classes
        .filter((c) => !submittedSet.has(c.id))
        .map((c) => {
          const t = db.teachers.find((x) => x.id === c.teacher_id);
          const tu = t ? db.users.find((x) => x.id === t.user_id) : null;
          return {
            ...c,
            teacher_name: tu?.full_name || 'Unassigned',
            student_count: db.students.filter((s) => s.class_id === c.id && s.status === 'active').length,
          };
        });

      const dateSet = Array.from(new Set(db.attendance.map((a) => a.date))).sort().slice(-14);
      const monthlyOverview = dateSet.map((d) => {
        const rows = db.attendance.filter((a) => a.date === d);
        const st = summarizeAtt(db, rows);
        return { date: d, label: d.slice(5), present: st.presentDays + st.lateDays, absent: st.absentDays, rate: st.percentage };
      });
      const classComparison = db.classes.map((c) => ({
        id: c.id,
        class_code: c.class_code,
        name: c.name,
        percentage: summarizeAtt(db, db.attendance.filter((a) => a.class_id === c.id)).percentage,
      }));

      return {
        pkt,
        kpis: {
          totalStudents: db.students.filter((s) => s.status === 'active').length,
          totalTeachers: db.teachers.filter((t) => t.status === 'active').length,
          totalClasses: db.classes.length,
          todayPresent,
          todayAbsent,
          overallAttendancePct: overall.percentage,
          teachersPresentToday: tAtt.filter((a) => a.status === 'Present' || a.status === 'Late').length,
          teachersAbsentToday: tAtt.filter((a) => a.status === 'Absent' || a.status === 'Leave').length,
          pendingSubmissionsCount: pendingSubmissions.length,
          pendingCorrectionsCount: db.correction_requests.filter((c) => c.status === 'pending').length,
        },
        pendingSubmissions,
        monthlyOverview,
        classComparison,
      } as T;
    }

    if (pathname === '/api/principal/classes' && method === 'GET') {
      const classes = db.classes.map((c) => {
        const t = db.teachers.find((x) => x.id === c.teacher_id);
        const tu = t ? db.users.find((x) => x.id === t.user_id) : null;
        const stIds = new Set(db.students.filter((s) => s.class_id === c.id && s.status === 'active').map((s) => s.id));
        const trs = db.test_results.filter((r) => stIds.has(r.student_id));
        const avgScore = trs.length ? Number((trs.reduce((a, b) => a + b.percentage, 0) / trs.length).toFixed(1)) : 0;
        return {
          ...c,
          teacher_name: tu?.full_name || 'Unassigned',
          student_count: stIds.size,
          attendancePercentage: summarizeAtt(db, db.attendance.filter((a) => a.class_id === c.id)).percentage,
          academicAverage: avgScore,
        };
      });
      return { classes } as T;
    }

    if (pathname === '/api/principal/classes' && method === 'POST') {
      const code = String(body.classCode || '').trim().toUpperCase();
      if (db.classes.some((c) => c.class_code.toLowerCase() === code.toLowerCase())) {
        throw new Error(`Class ID "${code}" already exists.`);
      }
      const id = db.nextId++;
      db.classes.push({
        id,
        class_code: code,
        name: String(body.name).trim(),
        section: String(body.section || 'A').trim(),
        room_number: body.roomNumber || null,
        teacher_id: body.teacherId ? Number(body.teacherId) : null,
        academic_session_id: 1,
      });
      await saveDB(db);
      return { id } as T;
    }

    if (pathname.match(/^\/api\/principal\/classes\/\d+$/) && method === 'PUT') {
      const id = Number(pathname.split('/')[4]);
      const c = db.classes.find((x) => x.id === id);
      if (!c) throw new Error('Class not found.');
      c.name = body.name.trim();
      c.section = (body.section || c.section).trim();
      c.room_number = body.roomNumber ?? c.room_number;
      c.teacher_id = body.teacherId ? Number(body.teacherId) : null;
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/subjects' && method === 'GET') {
      return {
        subjects: db.subjects.map((sub) => ({
          ...sub,
          class_name: db.classes.find((c) => c.id === sub.class_id)?.name || '',
        })),
      } as T;
    }
    if (pathname === '/api/principal/subjects' && method === 'POST') {
      const id = db.nextId++;
      db.subjects.push({ id, code: body.code.toUpperCase(), name: body.name, class_id: Number(body.classId) });
      await saveDB(db);
      return { id } as T;
    }
    if (pathname.match(/^\/api\/principal\/subjects\/\d+$/) && method === 'DELETE') {
      const id = Number(pathname.split('/')[4]);
      db.subjects = db.subjects.filter((s) => s.id !== id);
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/teachers' && method === 'GET') {
      return {
        teachers: db.teachers.map((t) => {
          const tu = db.users.find((x) => x.id === t.user_id);
          const assigned = db.classes.filter((c) => c.teacher_id === t.id).map((c) => `${c.name} (${c.class_code})`).join(', ');
          return {
            ...t,
            username: tu?.username,
            full_name: tu?.full_name,
            is_active: tu?.is_active,
            assigned_classes: assigned,
            submission_count: db.attendance_submissions.filter((s) => s.teacher_id === t.id).length,
          };
        }),
      } as T;
    }

    if (pathname === '/api/principal/teachers' && method === 'POST') {
      if (db.users.some((x) => x.username.toLowerCase() === body.username.trim().toLowerCase())) {
        throw new Error(`Username "${body.username}" is already taken.`);
      }
      const userId = db.nextId++;
      const teacherId = db.nextId++;
      const teacherCode = `TCH-2026-${String(db.teachers.length + 1).padStart(3, '0')}`;
      db.users.push({
        id: userId,
        username: body.username.trim(),
        password: body.password,
        role: 'teacher',
        full_name: body.fullName.trim(),
        is_active: 1,
        must_change_password: 0,
        avatar_url: './src/assets/images/avatar_teacher_portrait_1795627465105.jpg',
        sound_alerts: 1,
        push_enabled: 0,
      });
      db.teachers.push({
        id: teacherId,
        user_id: userId,
        teacher_code: teacherCode,
        subject_specialty: body.subjectSpecialty || 'General',
        phone: body.phone || null,
        qualification: body.qualification || null,
        joining_date: pkt.date,
        status: 'active',
      });
      if (body.classId) {
        const cls = db.classes.find((c) => c.id === Number(body.classId));
        if (cls) cls.teacher_id = teacherId;
      }
      await saveDB(db);
      return { teacherId, teacherCode } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/\d+$/) && method === 'PUT') {
      const id = Number(pathname.split('/')[4]);
      const t = db.teachers.find((x) => x.id === id);
      if (!t) throw new Error('Teacher not found.');
      const tu = db.users.find((x) => x.id === t.user_id);
      if (tu && body.fullName) tu.full_name = body.fullName;
      t.subject_specialty = body.subjectSpecialty || t.subject_specialty;
      t.phone = body.phone ?? t.phone;
      t.qualification = body.qualification ?? t.qualification;
      if (body.classId !== undefined) {
        db.classes.forEach((c) => {
          if (c.teacher_id === id) c.teacher_id = null;
        });
        if (body.classId) {
          const cls = db.classes.find((c) => c.id === Number(body.classId));
          if (cls) cls.teacher_id = id;
        }
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/\d+\/reset-password$/) && method === 'POST') {
      const id = Number(pathname.split('/')[4]);
      const t = db.teachers.find((x) => x.id === id);
      const tu = t ? db.users.find((x) => x.id === t.user_id) : null;
      if (tu) {
        tu.password = body.newPassword;
        tu.must_change_password = 1;
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/\d+\/toggle-status$/) && method === 'POST') {
      const id = Number(pathname.split('/')[4]);
      const t = db.teachers.find((x) => x.id === id);
      if (t) {
        t.status = t.status === 'active' ? 'inactive' : 'active';
        const tu = db.users.find((x) => x.id === t.user_id);
        if (tu) tu.is_active = t.status === 'active' ? 1 : 0;
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/teacher-attendance' && method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || pkt.date;
      return {
        date,
        records: db.teachers
          .filter((t) => t.status === 'active')
          .map((t) => {
            const tu = db.users.find((x) => x.id === t.user_id);
            const rec = db.teacher_attendance.find((a) => a.teacher_id === t.id && a.date === date);
            return {
              teacher_id: t.id,
              teacher_code: t.teacher_code,
              full_name: tu?.full_name,
              subject_specialty: t.subject_specialty,
              status: rec?.status || null,
              check_in_time: rec?.check_in_time || null,
            };
          }),
      } as T;
    }

    if (pathname === '/api/principal/teacher-attendance' && method === 'POST') {
      for (const r of body.records || []) {
        const existing = db.teacher_attendance.find((a) => a.teacher_id === Number(r.teacherId) && a.date === body.date);
        if (existing) existing.status = r.status;
        else db.teacher_attendance.push({ id: db.nextId++, teacher_id: Number(r.teacherId), date: body.date, status: r.status, check_in_time: r.checkInTime || null });
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/attendance') {
      const date = parsedUrl.searchParams.get('date');
      const month = parsedUrl.searchParams.get('month');
      const year = parsedUrl.searchParams.get('year');
      const classId = parsedUrl.searchParams.get('classId') ? Number(parsedUrl.searchParams.get('classId')) : undefined;
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();

      const records = db.attendance
        .filter((a) => {
          if (classId && a.class_id !== classId) return false;
          if (month && !a.date.startsWith(month)) return false;
          if (year && !a.date.startsWith(year)) return false;
          if (date && !month && !year && a.date !== date) return false;
          return true;
        })
        .map((a) => {
          const st = db.students.find((s) => s.id === a.student_id);
          const cls = db.classes.find((c) => c.id === a.class_id);
          return {
            ...a,
            student_code: st?.student_code || '',
            full_name: st?.full_name || '',
            roll_number: st?.roll_number || '',
            parent_mobile: st?.parent_mobile || '',
            class_name: cls?.name || '',
          };
        })
        .filter((r) => !search || r.full_name.toLowerCase().includes(search) || r.student_code.toLowerCase().includes(search) || r.roll_number.toLowerCase().includes(search));

      return { pkt, records, absentStudents: records.filter((r) => r.status === 'Absent'), summary: summarizeAtt(db, records) } as T;
    }

    if (pathname === '/api/principal/correction-requests') {
      return {
        requests: db.correction_requests.map((cr) => {
          const st = db.students.find((s) => s.id === cr.student_id);
          const cls = db.classes.find((c) => c.id === cr.class_id);
          const t = db.teachers.find((x) => x.id === cr.requested_by_teacher_id);
          const tu = t ? db.users.find((x) => x.id === t.user_id) : null;
          return { ...cr, student_name: st?.full_name, student_code: st?.student_code, class_name: cls?.name, teacher_name: tu?.full_name };
        }),
      } as T;
    }

    if (pathname.match(/^\/api\/principal\/correction-requests\/\d+\/review$/) && method === 'POST') {
      const id = Number(pathname.split('/')[4]);
      const cr = db.correction_requests.find((x) => x.id === id);
      if (!cr || cr.status !== 'pending') throw new Error('Correction request already processed.');
      cr.status = body.decision;
      cr.reviewed_by = u.id;
      cr.reviewed_at = `${pkt.date} ${pkt.time} PKT`;
      if (body.decision === 'approved') {
        const att = db.attendance.find((a) => a.id === cr.attendance_id);
        if (att) att.status = cr.requested_status;
      }
      const st = db.students.find((s) => s.id === cr.student_id);
      addAudit(db, u, body.decision === 'approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED', 'attendance', cr.attendance_id, { status: cr.old_status }, { status: body.decision === 'approved' ? cr.requested_status : cr.old_status }, cr.reason);
      const t = db.teachers.find((x) => x.id === cr.requested_by_teacher_id);
      if (t) pushNotif(db, t.user_id, 'correction_reviewed', `Correction ${body.decision}`, `${st?.full_name}: ${cr.old_status} → ${cr.requested_status}`, 'attendance');
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/audit-logs') return { logs: db.audit_logs } as T;

    if (pathname === '/api/principal/students' && method === 'GET') {
      const classId = parsedUrl.searchParams.get('classId') ? Number(parsedUrl.searchParams.get('classId')) : undefined;
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();
      const students = db.students
        .filter((s) => (!classId || s.class_id === classId) && (!search || s.full_name.toLowerCase().includes(search) || s.student_code.toLowerCase().includes(search) || s.roll_number.toLowerCase().includes(search)))
        .map((s) => ({
          ...s,
          class_name: db.classes.find((c) => c.id === s.class_id)?.name || '',
          attendancePercentage: summarizeAtt(db, db.attendance.filter((a) => a.student_id === s.id)).percentage,
        }));
      return { students } as T;
    }

    if (pathname.match(/^\/api\/principal\/students\/\d+$/) && method === 'GET') {
      const id = Number(pathname.split('/')[4]);
      const profile = buildStudentFullProfile(db, id);
      if (!profile) throw new Error('Student not found.');
      return profile as T;
    }

    if (pathname === '/api/principal/students/promote' && method === 'POST') {
      const targetId = Number(body.targetClassId);
      for (const sid of body.studentIds || []) {
        const st = db.students.find((s) => s.id === Number(sid));
        if (st) st.class_id = targetId;
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/analytics') {
      const classId = parsedUrl.searchParams.get('classId') ? Number(parsedUrl.searchParams.get('classId')) : undefined;
      const dates = Array.from(new Set(db.attendance.map((a) => a.date))).sort();
      const dailyChart = dates.map((d) => {
        const rows = db.attendance.filter((a) => a.date === d && (!classId || a.class_id === classId));
        return {
          date: d,
          present: rows.filter((r) => r.status === 'Present').length,
          absent: rows.filter((r) => r.status === 'Absent').length,
        };
      });
      const testPerformance = db.tests
        .filter((t) => !classId || t.class_id === classId)
        .map((t) => {
          const res = db.test_results.filter((r) => r.test_id === t.id);
          const avg = res.length ? Number((res.reduce((a, b) => a + b.percentage, 0) / res.length).toFixed(1)) : 0;
          return { ...t, avg_percentage: avg };
        });
      return { dailyChart, testPerformance, rankings: getRankings(db, classId) } as T;
    }

    if (pathname === '/api/principal/announcements' && method === 'POST') {
      const id = db.nextId++;
      db.announcements.unshift({ id, title: body.title, content: body.content, target_role: body.targetRole || 'all', priority: body.priority || 'normal', created_by: u.id, created_at: `${pkt.date} ${pkt.time}` });
      db.users.filter((x) => x.role !== 'principal' && (body.targetRole === 'all' || x.role === body.targetRole)).forEach((x) => pushNotif(db, x.id, 'announcement', body.title, body.content, 'overview'));
      await saveDB(db);
      return { id } as T;
    }

    if (pathname === '/api/principal/holidays' && method === 'POST') {
      const id = db.nextId++;
      db.holidays.push({ id, date: body.date, title: body.title, description: body.description || '' });
      await saveDB(db);
      return { id } as T;
    }
    if (pathname.match(/^\/api\/principal\/holidays\/\d+$/) && method === 'DELETE') {
      const id = Number(pathname.split('/')[4]);
      db.holidays = db.holidays.filter((h) => h.id !== id);
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/fees') {
      return {
        fees: db.fees.map((f) => {
          const st = db.students.find((s) => s.id === f.student_id);
          const cls = st ? db.classes.find((c) => c.id === st.class_id) : null;
          return { ...f, student_name: st?.full_name || '', student_code: st?.student_code || '', class_name: cls?.name || '' };
        }),
      } as T;
    }
    if (pathname.match(/^\/api\/principal\/fees\/\d+\/mark-paid$/) && method === 'POST') {
      const id = Number(pathname.split('/')[4]);
      const f = db.fees.find((x) => x.id === id);
      if (f) {
        f.status = 'Paid';
        f.paid_at = pkt.date;
        f.receipt_no = `AEA-RCP-${id}`;
      }
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/sessions' && method === 'GET') return { sessions: db.sessions } as T;
    if (pathname === '/api/principal/sessions' && method === 'POST') {
      const id = db.nextId++;
      db.sessions.unshift({ id, name: body.name, start_date: body.startDate, end_date: body.endDate, is_active: 0 });
      await saveDB(db);
      return { id } as T;
    }
    if (pathname.match(/^\/api\/principal\/sessions\/\d+\/activate$/) && method === 'POST') {
      const id = Number(pathname.split('/')[4]);
      db.sessions.forEach((s) => (s.is_active = s.id === id ? 1 : 0));
      await saveDB(db);
      return { ok: true } as T;
    }
    if (pathname === '/api/principal/settings' && method === 'GET') return { settings: db.settings } as T;
    if (pathname === '/api/principal/settings' && method === 'PUT') {
      db.settings = { ...db.settings, ...body };
      await saveDB(db);
      return { ok: true } as T;
    }
    if (pathname === '/api/principal/backup' && method === 'GET') {
      const sanitizedUsers = db.users.map(({ password: _p, ...rest }) => rest);
      return {
        exportedAt: `${pkt.date} ${pkt.time} PKT`,
        academy: db.settings.academy_name,
        data: { ...db, users: sanitizedUsers },
      } as T;
    }
  }

  // Teacher routes
  if (pathname.startsWith('/api/teacher/')) {
    const u = requireUser();
    if (u.role !== 'teacher') throw new Error('Access denied for your account role.');
    const teacher = db.teachers.find((t) => t.user_id === u.id);
    const assignedClass = teacher ? db.classes.find((c) => c.teacher_id === teacher.id) : null;
    if (!teacher || !assignedClass) throw new Error('No class assigned.');

    if (pathname === '/api/teacher/overview') {
      const classStudents = db.students.filter((s) => s.class_id === assignedClass.id && s.status === 'active');
      const todayRows = db.attendance.filter((a) => a.class_id === assignedClass.id && a.date === pkt.date);
      const classAll = db.attendance.filter((a) => a.class_id === assignedClass.id);
      return {
        pkt,
        teacher: { ...teacher, full_name: u.full_name },
        assignedClass,
        stats: {
          totalStudents: classStudents.length,
          presentToday: todayRows.filter((r) => r.status === 'Present').length,
          absentToday: todayRows.filter((r) => r.status === 'Absent').length,
          classAttendanceAverage: summarizeAtt(db, classAll).percentage,
          homeworkCount: db.homework.filter((h) => h.class_id === assignedClass.id && h.status === 'published').length,
        },
        upcomingTests: db.tests.filter((t) => t.class_id === assignedClass.id && t.test_date >= pkt.date),
      } as T;
    }

    if (pathname === '/api/teacher/students' && method === 'GET') {
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();
      const sts = db.students
        .filter((s) => s.class_id === assignedClass.id && s.status === 'active')
        .filter((s) => !search || s.full_name.toLowerCase().includes(search) || s.student_code.toLowerCase().includes(search) || s.roll_number.toLowerCase().includes(search))
        .map((s) => ({
          ...s,
          class_name: assignedClass.name,
          attendancePercentage: summarizeAtt(db, db.attendance.filter((a) => a.student_id === s.id)).percentage,
        }));
      return { students: sts } as T;
    }

    if (pathname === '/api/teacher/students' && method === 'POST') {
      if (db.users.some((x) => x.username.toLowerCase() === body.studentUsername.trim().toLowerCase())) throw new Error('Student username already exists.');
      if (db.users.some((x) => x.username.toLowerCase() === body.parentUsername.trim().toLowerCase())) throw new Error('Parent username already exists.');
      const seq = db.students.length + 1;
      const studentCode = `AEA-2026-${String(1000 + seq)}`;
      const parentCode = `PAR-2026-${String(1000 + seq)}`;
      const puId = db.nextId++;
      const suId = db.nextId++;
      const stId = db.nextId++;
      const photo = body.photoUrl || (body.gender === 'Female' ? './src/assets/images/avatar_student_female_1795627464479.jpg' : './src/assets/images/avatar_student_male_1795627463854.jpg');
      db.users.push({ id: puId, username: body.parentUsername.trim(), password: body.parentPassword, role: 'parent', full_name: body.parentName.trim(), is_active: 1, must_change_password: 0, avatar_url: './src/assets/images/avatar_teacher_portrait_1795627465105.jpg', sound_alerts: 1, push_enabled: 0 });
      db.parents.push({ id: db.nextId++, user_id: puId, parent_code: parentCode, full_name: body.parentName.trim(), mobile: body.parentMobile.trim() });
      db.users.push({ id: suId, username: body.studentUsername.trim(), password: body.studentPassword, role: 'student', full_name: body.fullName.trim(), is_active: 1, must_change_password: 0, avatar_url: photo, sound_alerts: 1, push_enabled: 0 });
      db.students.push({
        id: stId,
        user_id: suId,
        student_code: studentCode,
        full_name: body.fullName.trim(),
        father_name: body.fatherName.trim(),
        photo_url: photo,
        dob: body.dob,
        gender: body.gender,
        class_id: assignedClass.id,
        roll_number: body.rollNumber.trim(),
        parent_user_id: puId,
        parent_name: body.parentName.trim(),
        parent_mobile: body.parentMobile.trim(),
        admission_date: pkt.date,
        status: 'active',
      });
      await saveDB(db);
      return { studentId: stId, studentCode, parentCode } as T;
    }

    if (pathname.match(/^\/api\/teacher\/students\/\d+$/) && method === 'PUT') {
      const id = Number(pathname.split('/')[4]);
      const st = db.students.find((s) => s.id === id && s.class_id === assignedClass.id);
      if (!st) throw new Error('Student not found in your assigned class.');
      st.full_name = body.fullName.trim();
      st.father_name = body.fatherName.trim();
      st.dob = body.dob || st.dob;
      st.gender = body.gender || st.gender;
      st.roll_number = body.rollNumber || st.roll_number;
      st.parent_name = body.parentName || st.parent_name;
      st.parent_mobile = body.parentMobile || st.parent_mobile;
      if (body.photoUrl) st.photo_url = body.photoUrl;
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/teacher\/students\/\d+$/) && method === 'DELETE') {
      throw new Error('Teachers are not permitted to permanently delete student records.');
    }

    if (pathname.match(/^\/api\/teacher\/students\/\d+$/) && method === 'GET') {
      const id = Number(pathname.split('/')[4]);
      const st = db.students.find((s) => s.id === id && s.class_id === assignedClass.id);
      if (!st) throw new Error('Access denied: student belongs to another class.');
      return buildStudentFullProfile(db, id) as T;
    }

    if (pathname === '/api/teacher/rankings') return getRankings(db, assignedClass.id) as T;

    if (pathname === '/api/teacher/attendance' && method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || pkt.date;
      const submission = db.attendance_submissions.find((s) => s.class_id === assignedClass.id && s.date === date) || null;
      const students = db.students
        .filter((s) => s.class_id === assignedClass.id && s.status === 'active')
        .map((s) => {
          const a = db.attendance.find((x) => x.student_id === s.id && x.date === date);
          return {
            student_id: s.id,
            student_code: s.student_code,
            full_name: s.full_name,
            roll_number: s.roll_number,
            photo_url: s.photo_url,
            attendance_id: a?.id || null,
            status: a?.status || null,
            marked_at: a?.marked_at || null,
          };
        });
      return { pkt, classInfo: assignedClass, date, isToday: date === pkt.date, submission, students } as T;
    }

    if (pathname === '/api/teacher/attendance' && method === 'POST') {
      if (!pkt.isAttendanceWindowOpen) {
        throw new Error(`Attendance submission blocked by PKT clock (${pkt.time} PKT). ${pkt.windowMessage}`);
      }
      if (db.attendance_submissions.some((s) => s.class_id === assignedClass.id && s.date === pkt.date)) {
        throw new Error('Attendance for today has already been submitted and locked.');
      }
      const subId = db.nextId++;
      let p = 0, a = 0, l = 0, lv = 0;
      for (const entry of body.entries || []) {
        if (entry.status === 'Present') p++;
        else if (entry.status === 'Absent') a++;
        else if (entry.status === 'Late') l++;
        else lv++;
        db.attendance.push({
          id: db.nextId++,
          submission_id: subId,
          student_id: Number(entry.studentId),
          class_id: assignedClass.id,
          date: pkt.date,
          status: entry.status,
          marked_by: u.id,
          marked_at: `${pkt.date} ${pkt.time}`,
        });
      }
      db.attendance_submissions.push({
        id: subId,
        class_id: assignedClass.id,
        date: pkt.date,
        teacher_id: teacher.id,
        submitted_at: `${pkt.date} ${pkt.time}`,
        pkt_time_str: pkt.time,
        total_students: (body.entries || []).length,
        present_count: p,
        absent_count: a,
        late_count: l,
        leave_count: lv,
        is_locked: 1,
      });
      await saveDB(db);
      return { ok: true, submissionId: subId, pkt } as T;
    }

    if (pathname === '/api/teacher/correction-requests' && method === 'GET') {
      return {
        requests: db.correction_requests
          .filter((c) => c.requested_by_teacher_id === teacher.id)
          .map((c) => ({ ...c, student_name: db.students.find((s) => s.id === c.student_id)?.full_name })),
      } as T;
    }
    if (pathname === '/api/teacher/correction-requests' && method === 'POST') {
      const att = db.attendance.find((a) => a.id === Number(body.attendanceId) && a.class_id === assignedClass.id);
      if (!att) throw new Error('Attendance record not found in your assigned class.');
      const id = db.nextId++;
      db.correction_requests.unshift({
        id,
        attendance_id: att.id,
        student_id: att.student_id,
        class_id: att.class_id,
        date: att.date,
        requested_by_teacher_id: teacher.id,
        old_status: att.status,
        requested_status: body.requestedStatus,
        reason: body.reason,
        status: 'pending',
      });
      await saveDB(db);
      return { id } as T;
    }

    if (pathname === '/api/teacher/homework' && method === 'GET') {
      return { homework: db.homework.filter((h) => h.class_id === assignedClass.id) } as T;
    }
    if (pathname === '/api/teacher/homework' && method === 'POST') {
      const id = db.nextId++;
      db.homework.unshift({
        id,
        class_id: assignedClass.id,
        teacher_id: teacher.id,
        subject: body.subject,
        title: body.title,
        description: body.description,
        assigned_date: pkt.date,
        due_date: body.dueDate,
        attachment_url: body.attachmentUrl || null,
        attachment_name: body.attachmentName || null,
        status: body.status === 'draft' ? 'draft' : 'published',
        published_at: body.status === 'draft' ? null : `${pkt.date} ${pkt.time}`,
      });
      await saveDB(db);
      return { id } as T;
    }
    if (pathname.match(/^\/api\/teacher\/homework\/\d+$/) && method === 'PUT') {
      const id = Number(pathname.split('/')[4]);
      const hw = db.homework.find((h) => h.id === id && h.class_id === assignedClass.id);
      if (!hw || hw.status === 'published') throw new Error('Only draft homework can be edited.');
      Object.assign(hw, { ...body, status: body.status === 'published' ? 'published' : 'draft' });
      await saveDB(db);
      return { ok: true } as T;
    }

    if (pathname === '/api/teacher/tests' && method === 'GET') {
      return {
        tests: db.tests
          .filter((t) => t.class_id === assignedClass.id)
          .map((t) => {
            const results = db.test_results
              .filter((r) => r.test_id === t.id)
              .map((r) => ({
                ...r,
                student_name: db.students.find((s) => s.id === r.student_id)?.full_name || '',
                class_position: db.test_results.filter((x) => x.test_id === t.id && x.obtained_marks > r.obtained_marks).length + 1,
              }));
            return { ...t, graded_count: results.length, results };
          }),
      } as T;
    }
    if (pathname === '/api/teacher/tests' && method === 'POST') {
      const id = db.nextId++;
      db.tests.unshift({
        id,
        class_id: assignedClass.id,
        teacher_id: teacher.id,
        title: body.title,
        subject: body.subject,
        test_type: body.testType || 'Weekly',
        test_date: body.testDate,
        total_marks: Number(body.totalMarks),
        syllabus: body.syllabus,
        instructions: body.instructions || null,
        status: 'published',
      });
      await saveDB(db);
      return { id } as T;
    }
    if (pathname.match(/^\/api\/teacher\/tests\/\d+\/marks$/) && method === 'POST') {
      const testId = Number(pathname.split('/')[4]);
      const test = db.tests.find((t) => t.id === testId && t.class_id === assignedClass.id);
      if (!test) throw new Error('Test not found.');
      for (const m of body.marks || []) {
        const obtained = Math.max(0, Math.min(test.total_marks, Number(m.obtainedMarks)));
        const pct = Number(((obtained / test.total_marks) * 100).toFixed(1));
        const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
        const existing = db.test_results.find((r) => r.test_id === testId && r.student_id === Number(m.studentId));
        if (existing) {
          existing.obtained_marks = obtained;
          existing.percentage = pct;
          existing.grade = grade;
          existing.remarks = m.remarks || null;
        } else {
          db.test_results.push({ id: db.nextId++, test_id: testId, student_id: Number(m.studentId), obtained_marks: obtained, total_marks: test.total_marks, percentage: pct, grade, remarks: m.remarks || null, recorded_by: u.id });
        }
      }
      await saveDB(db);
      return { ok: true } as T;
    }
  }

  // Student Dashboard
  if (pathname === '/api/student/dashboard') {
    const u = requireUser();
    if (u.role !== 'student') throw new Error('Access denied.');
    const st = db.students.find((s) => s.user_id === u.id);
    if (!st) throw new Error('Student record not found.');
    const profile = buildStudentFullProfile(db, st.id)!;
    const todayAtt = db.attendance.find((a) => a.student_id === st.id && a.date === pkt.date) || null;
    const upcomingTests = db.tests.filter((t) => t.class_id === st.class_id && t.test_date >= pkt.date);
    return { pkt, todayAttendance: todayAtt, upcomingTests, ...profile } as T;
  }

  // Parent Dashboard
  if (pathname === '/api/parent/dashboard') {
    const u = requireUser();
    if (u.role !== 'parent') throw new Error('Access denied.');
    const children = db.students
      .filter((s) => s.parent_user_id === u.id && s.status === 'active')
      .map((s) => ({
        ...buildStudentFullProfile(db, s.id)!,
        todayAttendance: db.attendance.find((a) => a.student_id === s.id && a.date === pkt.date) || null,
        upcomingTests: db.tests.filter((t) => t.class_id === s.class_id && t.test_date >= pkt.date),
      }));
    return { pkt, children } as T;
  }

  throw new Error('Endpoint unavailable in static mode.');
}
