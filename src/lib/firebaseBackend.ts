import { signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import type { PktTimeInfo, SessionUser, UserRole } from '../types';

type FirebaseListener = (event: string, payload: unknown) => void;
const fbListeners = new Set<FirebaseListener>();

export function subscribeFirebaseEvents(fn: FirebaseListener): () => void {
  fbListeners.add(fn);
  const user = auth.currentUser;
  if (!user) {
    return () => fbListeners.delete(fn);
  }

  let initialized = false;
  const q = query(collection(db, 'notifications'), where('recipientUid', '==', user.uid));
  const unsub = onSnapshot(
    q,
    (snap) => {
      if (!initialized) {
        initialized = true;
        return;
      }
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const d = change.doc.data();
          const payload = {
            id: change.doc.id,
            type: d.type,
            title: d.title,
            message: d.message,
            link_tab: d.linkTab || null,
            is_read: d.isRead ? 1 : 0,
            created_at: formatTs(d.createdAt),
          };
          for (const listener of fbListeners) {
            listener('notification:new', payload);
          }
        }
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    }
  );

  return () => {
    fbListeners.delete(fn);
    unsub();
  };
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

function formatTs(ts: unknown): string {
  if (!ts) return getPktNow().date;
  if (typeof ts === 'string') return ts;
  if (typeof (ts as Timestamp)?.toDate === 'function') {
    const dt = (ts as Timestamp).toDate();
    const pkt = getPktNow(dt);
    return `${pkt.date} ${pkt.time}`;
  }
  return getPktNow().date;
}

function makeNumericId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || makeNumericId();
}

function summarizeAtt(
  rows: Array<{ status?: unknown; [key: string]: unknown }>,
  settings: { lateCountsAsPresent?: boolean; leaveExcludedFromDenominator?: boolean }
) {
  const lateAsPresent = settings.lateCountsAsPresent !== false;
  const leaveExcluded = settings.leaveExcludedFromDenominator !== false;
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let leaveDays = 0;
  for (const r of rows) {
    const status = String(r.status || '');
    if (status === 'Present') presentDays++;
    else if (status === 'Absent') absentDays++;
    else if (status === 'Late') lateDays++;
    else if (status === 'Leave') leaveDays++;
  }
  const totalDays = rows.length;
  const countedDays = leaveExcluded ? presentDays + absentDays + lateDays : totalDays;
  const effectivePresent = lateAsPresent ? presentDays + lateDays : presentDays;
  const percentage = countedDays > 0 ? Number(((effectivePresent / countedDays) * 100).toFixed(1)) : 0;
  return { totalDays, countedDays, presentDays, absentDays, lateDays, leaveDays, percentage };
}

const ADMIN_EMAIL = 'zakir4kb@gmail.com';
const MALE_AVATAR = './src/assets/images/avatar_student_male_1795627463854.jpg';
const FEMALE_AVATAR = './src/assets/images/avatar_student_female_1795627464479.jpg';
const TEACHER_AVATAR = './src/assets/images/avatar_teacher_portrait_1795627465105.jpg';

async function safeGetDoc(path: string) {
  try {
    return await getDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function safeGetDocs(colPath: string, constraints: any[] = []) {
  try {
    const ref = collection(db, colPath);
    const q = constraints.length ? query(ref, ...constraints) : ref;
    return await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

function stripUndefined(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean;
}

async function safeSetDoc(path: string, data: Record<string, unknown>) {
  try {
    await setDoc(doc(db, path), stripUndefined(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function safeUpdateDoc(path: string, data: Record<string, unknown>) {
  try {
    await updateDoc(doc(db, path), stripUndefined(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function safeDeleteDoc(path: string) {
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function addAuditLog(
  actor: { uid: string; fullName: string; role: string },
  actionType: string,
  targetTable: string,
  targetId: string,
  oldValue?: unknown,
  newValue?: unknown,
  reason?: string
) {
  const logId = `log_${makeNumericId()}`;
  const payload: Record<string, unknown> = {
    actorUid: actor.uid,
    actorName: actor.fullName.slice(0, 120),
    actorRole: actor.role.slice(0, 32),
    actionType: actionType.slice(0, 80),
    targetTable: targetTable.slice(0, 64),
    targetId: String(targetId).slice(0, 128),
    createdAt: serverTimestamp(),
  };
  if (oldValue !== undefined && oldValue !== null) payload.oldValue = JSON.stringify(oldValue).slice(0, 1000);
  if (newValue !== undefined && newValue !== null) payload.newValue = JSON.stringify(newValue).slice(0, 1000);
  if (reason) payload.reason = reason.slice(0, 500);
  await safeSetDoc(`audit_logs/${logId}`, payload);
}

async function pushCloudNotif(
  recipientUid: string,
  senderUid: string,
  type: string,
  title: string,
  message: string,
  linkTab?: string
) {
  if (!recipientUid) return;
  const nid = `ntf_${makeNumericId()}`;
  await safeSetDoc(`notifications/${nid}`, {
    recipientUid,
    senderUid,
    type: type.slice(0, 48),
    title: title.slice(0, 160),
    message: message.slice(0, 1000),
    linkTab: (linkTab || 'overview').slice(0, 48),
    isRead: false,
    createdAt: serverTimestamp(),
  });
}

async function seedInitialFirestoreData(adminUid: string, adminEmail: string, adminName: string) {
  const settingsSnap = await safeGetDoc('settings/academy');
  if (settingsSnap.exists()) return;

  const pkt = getPktNow();
  const today = pkt.date;
  const twoDaysLater = pktDaysAgo(-2);

  const teacherSpecs = [
    { id: '101', code: 'TCH-2026-001', fullName: 'Fatima Noor', specialty: 'Mathematics & Science', qual: 'M.Sc Mathematics', phone: '+92-301-5551101', classId: '201', classCode: 'CLS-05', className: '5th', room: 'Room 201' },
    { id: '102', code: 'TCH-2026-002', fullName: 'Bilal Ahmed', specialty: 'Physics & Computer Science', qual: 'M.Phil Physics', phone: '+92-302-5551102', classId: '202', classCode: 'CLS-08', className: '8th', room: 'Room 301' },
    { id: '103', code: 'TCH-2026-003', fullName: 'Ayesha Tariq', specialty: 'English & Social Studies', qual: 'M.A English Literature', phone: '+92-303-5551103', classId: '203', classCode: 'CLS-03', className: '3rd', room: 'Room 103' },
    { id: '104', code: 'TCH-2026-004', fullName: 'Usman Raza', specialty: 'General Education & Urdu', qual: 'B.Ed (Hons)', phone: '+92-304-5551104', classId: '204', classCode: 'CLS-01', className: '1st', room: 'Room 101' },
  ];

  const studentSeeds = [
    { id: '301', classIdx: 0, code: 'AEA-2026-0501', name: 'Ahmad Khan', father: 'Tariq Khan', dob: '2015-05-14', gender: 'Male', roll: '01', pName: 'Tariq Khan', pMobile: '+92-311-5552001', absences: 0 },
    { id: '302', classIdx: 0, code: 'AEA-2026-0502', name: 'Ali Raza', father: 'Salman Raza', dob: '2015-08-22', gender: 'Male', roll: '02', pName: 'Salman Raza', pMobile: '+92-311-5552002', absences: 1 },
    { id: '303', classIdx: 0, code: 'AEA-2026-0503', name: 'Hamza Malik', father: 'Imran Malik', dob: '2015-03-10', gender: 'Male', roll: '03', pName: 'Imran Malik', pMobile: '+92-311-5552003', absences: 2 },
    { id: '304', classIdx: 0, code: 'AEA-2026-0504', name: 'Usman Tariq', father: 'Tariq Mahmood', dob: '2015-11-02', gender: 'Male', roll: '04', pName: 'Tariq Mahmood', pMobile: '+92-311-5552004', absences: 3 },
    { id: '305', classIdx: 0, code: 'AEA-2026-0505', name: 'Zainab Fatima', father: 'Kamran Siddiqui', dob: '2015-07-19', gender: 'Female', roll: '05', pName: 'Kamran Siddiqui', pMobile: '+92-311-5552005', absences: 1 },
    { id: '306', classIdx: 1, code: 'AEA-2026-0801', name: 'Saad Qureshi', father: 'Nadeem Qureshi', dob: '2012-02-18', gender: 'Male', roll: '01', pName: 'Nadeem Qureshi', pMobile: '+92-312-5553001', absences: 1 },
    { id: '307', classIdx: 1, code: 'AEA-2026-0802', name: 'Hira Siddiqui', father: 'Farooq Siddiqui', dob: '2012-06-25', gender: 'Female', roll: '02', pName: 'Farooq Siddiqui', pMobile: '+92-312-5553002', absences: 0 },
    { id: '308', classIdx: 2, code: 'AEA-2026-0301', name: 'Maryam Bibi', father: 'Shahid Ali', dob: '2017-04-12', gender: 'Female', roll: '01', pName: 'Shahid Ali', pMobile: '+92-313-5554001', absences: 1 },
    { id: '309', classIdx: 3, code: 'AEA-2026-0101', name: 'Sara Javed', father: 'Javed Iqbal', dob: '2019-01-27', gender: 'Female', roll: '01', pName: 'Javed Iqbal', pMobile: '+92-314-5555001', absences: 0 },
  ];

  const schoolDays: string[] = [];
  for (let d = 1; d <= 16 && schoolDays.length < 10; d++) {
    const dt = pktDaysAgo(d);
    if (pktDayOfWeek(dt) !== 0) schoolDays.push(dt);
  }

  async function commitSeedBatch(markerPath: string, build: (b: ReturnType<typeof writeBatch>) => void) {
    const markerSnap = await safeGetDoc(markerPath);
    if (markerSnap.exists()) return;
    const b = writeBatch(db);
    build(b);
    try {
      await b.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `initial_seed:${markerPath}`);
    }
  }

  // Batch 1: Sessions, Teachers, Classes, Holidays, Announcements
  await commitSeedBatch('classes/201', (b) => {
    b.set(doc(db, 'sessions/1'), {
      name: '2026-2027',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      isActive: true,
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'sessions/2'), {
      name: '2025-2026',
      startDate: '2025-04-01',
      endDate: '2026-03-31',
      isActive: false,
      createdAt: serverTimestamp(),
    });
    teacherSpecs.forEach((t) => {
      b.set(doc(db, `teachers/${t.id}`), {
        teacherCode: t.code,
        uid: '',
        fullName: t.fullName,
        subjectSpecialty: t.specialty,
        qualification: t.qual,
        joiningDate: '2024-08-15',
        status: 'active',
        assignedClassId: t.classId,
        assignedClassName: t.className,
        createdAt: serverTimestamp(),
      });
      b.set(doc(db, `teachers/${t.id}/private/info`), {
        teacherId: t.id,
        phone: t.phone || '',
        email: '',
        updatedAt: serverTimestamp(),
      });
      b.set(doc(db, `classes/${t.classId}`), {
        classCode: t.classCode,
        name: t.className,
        section: 'A',
        roomNumber: t.room,
        teacherId: t.id,
        teacherUid: '',
        teacherName: t.fullName,
        academicSessionId: '1',
        createdAt: serverTimestamp(),
      });
    });
    b.set(doc(db, 'holidays/hol_1'), {
      date: '2026-12-25',
      title: 'Quaid-e-Azam Day',
      description: 'National public holiday — Academy closed.',
      viewerUids: [adminUid],
      createdByUid: adminUid,
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'holidays/hol_2'), {
      date: '2027-02-05',
      title: 'Kashmir Solidarity Day',
      description: 'National public holiday — Academy closed.',
      viewerUids: [adminUid],
      createdByUid: adminUid,
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'announcements/ann_1'), {
      title: 'Winter Academic Schedule & Morning Assembly',
      content: 'All classes commence promptly at 08:00 AM PKT. Teachers must finalize daily attendance before 11:59 AM PKT.',
      targetRole: 'all',
      priority: 'important',
      createdByUid: adminUid,
      viewerUids: [adminUid],
      createdAt: serverTimestamp(),
    });
  });

  // Batch 2: Students & private info
  await commitSeedBatch('students/301', (b) => {
    studentSeeds.forEach((s) => {
      const cls = teacherSpecs[s.classIdx];
      const photo = s.gender === 'Female' ? FEMALE_AVATAR : MALE_AVATAR;
      b.set(doc(db, `students/${s.id}`), {
        studentCode: s.code,
        fullName: s.name,
        fatherName: s.father,
        photoUrl: photo,
        dob: s.dob,
        gender: s.gender,
        classId: cls.classId,
        className: cls.className,
        section: 'A',
        rollNumber: s.roll,
        teacherUid: '',
        studentUid: '',
        parentUid: '',
        parentName: s.pName,
        admissionDate: '2026-04-02',
        status: 'active',
        createdAt: serverTimestamp(),
      });
      b.set(doc(db, `students/${s.id}/private/info`), {
        studentId: s.id,
        parentMobile: s.pMobile,
        studentEmail: '',
        parentEmail: '',
        updatedAt: serverTimestamp(),
      });
    });
  });

  // Batch 3a & 3b: Subjects (10 per batch)
  await commitSeedBatch('subjects/201_1', (b) => {
    teacherSpecs.slice(0, 2).forEach((t) => {
      ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'].forEach((subj, idx) => {
        b.set(doc(db, `subjects/${t.classId}_${idx + 1}`), {
          code: `${t.classCode}-SUB-${idx + 1}`,
          name: subj,
          classId: t.classId,
          teacherUid: '',
          createdAt: serverTimestamp(),
        });
      });
    });
  });

  await commitSeedBatch('subjects/203_1', (b) => {
    teacherSpecs.slice(2).forEach((t) => {
      ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'].forEach((subj, idx) => {
        b.set(doc(db, `subjects/${t.classId}_${idx + 1}`), {
          code: `${t.classCode}-SUB-${idx + 1}`,
          name: subj,
          classId: t.classId,
          teacherUid: '',
          createdAt: serverTimestamp(),
        });
      });
    });
  });

  // Batch 4: Timetable, Homework, Tests
  await commitSeedBatch('tests/tst_1', (b) => {
    teacherSpecs.forEach((t) => {
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach((day, dIdx) => {
        const slots = [
          ['08:00', '08:45'],
          ['08:45', '09:30'],
          ['09:45', '10:30'],
        ];
        const subjects = ['Mathematics', 'English', 'Science', 'Urdu', 'Islamiat'];
        slots.forEach(([startTime, endTime], pIdx) => {
          b.set(doc(db, `timetable/${t.classId}_${dIdx}_${pIdx + 1}`), {
            classId: t.classId,
            className: t.className,
            dayOfWeek: day,
            periodNumber: pIdx + 1,
            startTime,
            endTime,
            subject: subjects[(dIdx + pIdx) % subjects.length],
            teacherUid: '',
            teacherName: t.fullName,
            viewerUids: [adminUid],
            createdAt: serverTimestamp(),
          });
        });
      });
    });
    b.set(doc(db, 'homework/hw_1'), {
      classId: '201',
      teacherUid: adminUid,
      subject: 'Mathematics',
      title: 'Fractions & Decimals Practice Set 4',
      description: 'Solve Exercise 4.2 Questions 1 to 10 in your Mathematics notebook.',
      assignedDate: today,
      dueDate: twoDaysLater,
      status: 'published',
      viewerUids: [adminUid],
      publishedAt: `${today} 09:15:00`,
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'tests/tst_1'), {
      classId: '201',
      teacherUid: adminUid,
      title: 'Monthly Mathematics Assessment',
      subject: 'Mathematics',
      testType: 'Monthly',
      testDate: pktDaysAgo(5),
      totalMarks: 50,
      syllabus: 'Chapters 1–3: Whole Numbers, Factors & Fractions',
      instructions: 'Show all calculation steps.',
      status: 'published',
      viewerUids: [adminUid],
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'tests/tst_2'), {
      classId: '201',
      teacherUid: adminUid,
      title: 'Weekly Science Quiz',
      subject: 'Science',
      testType: 'Weekly',
      testDate: twoDaysLater,
      totalMarks: 25,
      syllabus: 'Chapter 3: Plant Systems & Respiration',
      instructions: 'Prepare Chapter 3 thoroughly.',
      status: 'published',
      viewerUids: [adminUid],
      createdAt: serverTimestamp(),
    });
  });

  // Batch 5: Fees & Test Results
  await commitSeedBatch('fees/fee_301', (b) => {
    studentSeeds.forEach((s) => {
      const cls = teacherSpecs[s.classIdx];
      b.set(doc(db, `fees/fee_${s.id}`), {
        studentId: s.id,
        studentName: s.name,
        studentCode: s.code,
        className: cls.className,
        studentUid: '',
        parentUid: '',
        month: 'November',
        year: 2026,
        amount: 8500,
        status: s.absences > 2 ? 'Pending' : 'Paid',
        paidAt: s.absences > 2 ? '' : '2026-11-05',
        receiptNo: s.absences > 2 ? '' : `AEA-RCP-${s.id}11`,
        createdAt: serverTimestamp(),
      });
    });
    const c5Students = studentSeeds.filter((s) => s.classIdx === 0);
    const scores = [48, 45, 42, 39, 46];
    c5Students.forEach((st, idx) => {
      const obtained = scores[idx] ?? 40;
      const pct = Number(((obtained / 50) * 100).toFixed(1));
      const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : 'C';
      b.set(doc(db, `test_results/tr_1_${st.id}`), {
        testId: 'tst_1',
        testTitle: 'Monthly Mathematics Assessment',
        subject: 'Mathematics',
        testType: 'Monthly',
        testDate: pktDaysAgo(5),
        studentId: st.id,
        studentName: st.name,
        classId: '201',
        teacherUid: adminUid,
        studentUid: '',
        parentUid: '',
        obtainedMarks: obtained,
        totalMarks: 50,
        percentage: pct,
        grade,
        remarks: pct >= 90 ? 'Outstanding performance' : 'Good progress',
        recordedByUid: adminUid,
        createdAt: serverTimestamp(),
      });
    });
  });

  // Batch 6: Teacher Attendance & Submissions
  if (schoolDays.length > 0) {
    await commitSeedBatch(`attendance_submissions/sub_201_${schoolDays[0]}`, (b) => {
      schoolDays.forEach((dateStr, dayIdx) => {
        teacherSpecs.forEach((tr) => {
          b.set(doc(db, `teacher_attendance/ta_${tr.id}_${dateStr}`), {
            teacherId: tr.id,
            teacherUid: '',
            teacherCode: tr.code,
            fullName: tr.fullName,
            date: dateStr,
            status: 'Present',
            checkInTime: '07:50 AM',
            createdAt: serverTimestamp(),
          });
          const clsStudents = studentSeeds.filter((st) => st.classIdx === teacherSpecs.indexOf(tr));
          let p = 0, a = 0;
          const subId = `sub_${tr.classId}_${dateStr}`;
          clsStudents.forEach((st) => {
            const status = dayIdx === 2 && st.absences > 0 ? 'Absent' : dayIdx === 5 && st.absences > 1 ? 'Absent' : 'Present';
            if (status === 'Present') p++;
            else a++;
          });
          b.set(doc(db, `attendance_submissions/${subId}`), {
            classId: tr.classId,
            date: dateStr,
            teacherId: tr.id,
            teacherUid: adminUid,
            pktTimeStr: '08:42:15',
            totalStudents: clsStudents.length,
            presentCount: p,
            absentCount: a,
            lateCount: 0,
            leaveCount: 0,
            isLocked: true,
            createdAt: serverTimestamp(),
          });
        });
      });
    });

    // Batch 7: Student Attendance records
    await commitSeedBatch(`attendance/att_301_${schoolDays[0]}`, (b) => {
      schoolDays.forEach((dateStr, dayIdx) => {
        teacherSpecs.forEach((tr) => {
          const clsStudents = studentSeeds.filter((st) => st.classIdx === teacherSpecs.indexOf(tr));
          const subId = `sub_${tr.classId}_${dateStr}`;
          clsStudents.forEach((st) => {
            const status = dayIdx === 2 && st.absences > 0 ? 'Absent' : dayIdx === 5 && st.absences > 1 ? 'Absent' : 'Present';
            b.set(doc(db, `attendance/att_${st.id}_${dateStr}`), {
              submissionId: subId,
              studentId: st.id,
              studentCode: st.code,
              studentName: st.name,
              rollNumber: st.roll,
              classId: tr.classId,
              className: tr.className,
              date: dateStr,
              status,
              teacherUid: '',
              studentUid: '',
              parentUid: '',
              markedByUid: adminUid,
              markedAt: `${dateStr} 08:42:15`,
              createdAt: serverTimestamp(),
            });
          });
        });
      });
    });
  }

  // Batch 8 (Final): Welcome notification & Academy settings marker
  await commitSeedBatch('settings/academy', (b) => {
    b.set(doc(db, 'notifications/ntf_welcome_1'), {
      recipientUid: adminUid,
      senderUid: adminUid,
      type: 'security',
      title: 'Cloud Database Initialized',
      message: `Connected to live Firebase Firestore as ${adminEmail}. All school records sync in real time across devices.`,
      linkTab: 'overview',
      isRead: false,
      createdAt: serverTimestamp(),
    });
    b.set(doc(db, 'settings/academy'), {
      academyName: 'ABDALI EDUCATION ACADEMY',
      campusAddress: 'Academic Boulevard, Islamabad',
      attendanceStartPkt: '08:00',
      attendanceEndPkt: '11:59',
      lateCountsAsPresent: true,
      leaveExcludedFromDenominator: true,
      updatedAt: serverTimestamp(),
    });
  });

  void adminName;
}

async function ensureUserBootstrapped(): Promise<{
  uid: string;
  email: string;
  profile: Record<string, any>;
}> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Please sign in with Google to access the live Cloud Database.');
  }
  const emailLower = user.email.toLowerCase();
  const isRootAdmin = emailLower === ADMIN_EMAIL;

  let profileSnap = await safeGetDoc(`user_profiles/${user.uid}`);

  if (isRootAdmin) {
    const adminSnap = await safeGetDoc(`admins/${user.uid}`);
    if (!adminSnap.exists()) {
      await safeSetDoc(`admins/${user.uid}`, {
        uid: user.uid,
        email: emailLower,
        fullName: user.displayName || 'Principal Admin',
        createdAt: serverTimestamp(),
      });
    }
    if (!profileSnap.exists()) {
      await safeSetDoc(`user_profiles/${user.uid}`, {
        uid: user.uid,
        role: 'principal',
        fullName: user.displayName || 'Principal Admin',
        code: 'PRI-001',
        isActive: true,
        soundAlerts: true,
        pushEnabled: false,
        avatarUrl: user.photoURL || TEACHER_AVATAR,
        createdAt: serverTimestamp(),
      });
      await safeSetDoc(`user_private/${user.uid}`, {
        uid: user.uid,
        email: emailLower,
        createdAt: serverTimestamp(),
      });
      profileSnap = await safeGetDoc(`user_profiles/${user.uid}`);
    }
    await seedInitialFirestoreData(user.uid, emailLower, user.displayName || 'Principal Admin');
  } else if (!profileSnap.exists()) {
    // Check Principal/Teacher-issued email invite
    const directInviteSnap = await safeGetDoc(`email_invites/${sanitizeId(emailLower)}`);
    const invitesSnap = directInviteSnap.exists()
      ? null
      : await safeGetDocs('email_invites', [where('emailLower', '==', emailLower)]);
    const inv = directInviteSnap.exists()
      ? directInviteSnap.data()
      : invitesSnap && !invitesSnap.empty
      ? invitesSnap.docs[0].data()
      : null;

    if (inv) {
      await safeSetDoc(`user_profiles/${user.uid}`, {
        uid: user.uid,
        role: inv.role,
        fullName: inv.fullName || user.displayName || 'Academy User',
        code: inv.code || 'AEA',
        assignedClassId: inv.assignedClassId || '',
        teacherId: inv.teacherId || '',
        studentId: inv.studentId || '',
        isActive: true,
        soundAlerts: true,
        pushEnabled: false,
        avatarUrl: user.photoURL || TEACHER_AVATAR,
        createdAt: serverTimestamp(),
      });
      await safeSetDoc(`user_private/${user.uid}`, {
        uid: user.uid,
        email: emailLower,
        createdAt: serverTimestamp(),
      });
      if (inv.role === 'teacher' && inv.teacherId) {
        await safeUpdateDoc(`teachers/${inv.teacherId}`, {
          uid: user.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
        if (inv.assignedClassId) {
          await safeUpdateDoc(`classes/${inv.assignedClassId}`, {
            teacherUid: user.uid,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        }
      } else if (inv.role === 'student' && inv.studentId) {
        await safeUpdateDoc(`students/${inv.studentId}`, {
          studentUid: user.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      } else if (inv.role === 'parent' && inv.studentId) {
        await safeUpdateDoc(`students/${inv.studentId}`, {
          parentUid: user.uid,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
      profileSnap = await safeGetDoc(`user_profiles/${user.uid}`);
    } else {
      await safeSetDoc(`user_profiles/${user.uid}`, {
        uid: user.uid,
        role: 'pending',
        fullName: user.displayName || emailLower,
        isActive: true,
        soundAlerts: true,
        pushEnabled: false,
        avatarUrl: user.photoURL || TEACHER_AVATAR,
        createdAt: serverTimestamp(),
      });
      await safeSetDoc(`user_private/${user.uid}`, {
        uid: user.uid,
        email: emailLower,
        createdAt: serverTimestamp(),
      });
      throw new Error(
        `Account ${emailLower} is signed in, but not yet assigned a school portal role. Ask the Principal (${ADMIN_EMAIL}) to assign your email to a Teacher, Student, or Parent account.`
      );
    }
  }

  const profile = profileSnap.data()!;
  if (!profile.isActive) {
    throw new Error('This account has been deactivated by the Principal.');
  }
  if (profile.role === 'pending') {
    throw new Error(
      `Account ${emailLower} is awaiting role assignment by the Principal (${ADMIN_EMAIL}).`
    );
  }

  return { uid: user.uid, email: emailLower, profile };
}

export async function signInWithFirebaseGoogle(portalRole?: UserRole): Promise<{ token: string; user: SessionUser }> {
  const result = await signInWithPopup(auth, googleProvider);
  if (!result.user.emailVerified) {
    await signOut(auth);
    throw new Error('Your Google account email must be verified.');
  }
  const { uid, profile } = await ensureUserBootstrapped();
  if (portalRole && profile.role !== portalRole) {
    throw new Error(`Your Google account is registered for the ${String(profile.role).toUpperCase()} portal, not ${portalRole.toUpperCase()}.`);
  }
  const token = await result.user.getIdToken();
  const sessionUser = await buildSessionUser(uid, profile);
  await addAuditLog({ uid, fullName: sessionUser.fullName, role: sessionUser.role }, 'LOGIN', 'users', uid, null, { portalRole: sessionUser.role });
  return { token, user: sessionUser };
}

export async function buildSessionUser(uid: string, profile: Record<string, any>): Promise<SessionUser> {
  const base: SessionUser = {
    id: uid as unknown as number,
    username: auth.currentUser?.email || profile.code || uid,
    role: profile.role as UserRole,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl || TEACHER_AVATAR,
    mustChangePassword: false,
    soundAlerts: profile.soundAlerts !== false,
    pushEnabled: Boolean(profile.pushEnabled),
    code: profile.code,
  };
  if (profile.role === 'teacher' && profile.teacherId) {
    const clsSnap = profile.assignedClassId ? await safeGetDoc(`classes/${profile.assignedClassId}`) : null;
    const clsData = clsSnap?.exists() ? clsSnap.data() : null;
    return {
      ...base,
      teacherId: profile.teacherId,
      assignedClass: clsData
        ? { id: clsSnap!.id as unknown as number, class_code: clsData.classCode, name: clsData.name }
        : null,
    };
  }
  if (profile.role === 'student' && profile.studentId) {
    const sSnap = await safeGetDoc(`students/${profile.studentId}`);
    const s = sSnap.exists() ? sSnap.data() : null;
    return {
      ...base,
      studentId: profile.studentId,
      className: s?.className,
      rollNumber: s?.rollNumber,
    };
  }
  return base;
}

async function getSettings() {
  const snap = await safeGetDoc('settings/academy');
  if (!snap.exists()) {
    return {
      academyName: 'ABDALI EDUCATION ACADEMY',
      campusAddress: 'Academic Boulevard, Islamabad',
      attendanceStartPkt: '08:00',
      attendanceEndPkt: '11:59',
      lateCountsAsPresent: true,
      leaveExcludedFromDenominator: true,
    };
  }
  return snap.data() as Record<string, any>;
}

async function buildStudentFullProfileFB(studentId: string) {
  const sSnap = await safeGetDoc(`students/${studentId}`);
  if (!sSnap.exists()) return null;
  const s = sSnap.data();
  const privSnap = await safeGetDoc(`students/${studentId}/private/info`);
  const priv = privSnap.exists() ? privSnap.data() : {};

  const attSnap = await safeGetDocs('attendance', [where('studentId', '==', studentId)]);
  const attRows = attSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));

  const settings = await getSettings();
  const pkt = getPktNow();
  const curMonth = pkt.date.slice(0, 7);
  const curYear = pkt.date.slice(0, 4);

  const byMonth = new Map<string, any[]>();
  for (const r of attRows as any[]) {
    const m = String(r.date).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r);
  }
  const monthlySeries = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, items]) => ({ month, ...summarizeAtt(items, settings) }));

  const hwSnap = await safeGetDocs('homework', [where('classId', '==', s.classId)]);
  const homeworkHistory = hwSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((h: any) => h.status === 'published')
    .map((h: any) => ({
      id: h.id,
      subject: h.subject,
      title: h.title,
      description: h.description,
      assigned_date: h.assignedDate || formatTs(h.createdAt).slice(0, 10),
      due_date: h.dueDate,
      attachment_url: h.attachmentUrl || null,
      attachment_name: h.attachmentName || null,
    }))
    .sort((a: any, b: any) => String(b.assigned_date).localeCompare(String(a.assigned_date)));

  const trSnap = await safeGetDocs('test_results', [where('studentId', '==', studentId)]);
  const testResults = trSnap.docs.map((d) => {
    const tr = d.data();
    return {
      id: d.id,
      test_id: tr.testId,
      test_title: tr.testTitle || 'Test',
      subject: tr.subject || '',
      test_type: tr.testType || '',
      test_date: tr.testDate || '',
      obtained_marks: tr.obtainedMarks,
      total_marks: tr.totalMarks,
      percentage: tr.percentage,
      grade: tr.grade,
      remarks: tr.remarks || null,
      class_position: 1,
      total_appeared: 1,
    };
  });

  const feeSnap = await safeGetDocs('fees', [where('studentId', '==', studentId)]);
  const fees = feeSnap.docs.map((d) => {
    const f = d.data();
    return {
      id: d.id,
      month: f.month,
      year: f.year,
      amount: f.amount,
      status: f.status,
      paid_at: f.paidAt || null,
      receipt_no: f.receiptNo || null,
    };
  });

  return {
    student: {
      id: studentId,
      student_code: s.studentCode,
      full_name: s.fullName,
      father_name: s.fatherName,
      photo_url: s.photoUrl || MALE_AVATAR,
      dob: s.dob || '',
      gender: s.gender || 'Male',
      class_id: s.classId,
      class_name: s.className || '',
      class_code: s.classId,
      section: s.section || 'A',
      room_number: '',
      roll_number: s.rollNumber,
      parent_name: s.parentName || '',
      parent_mobile: priv.parentMobile || '',
      admission_date: s.admissionDate || '',
      status: s.status || 'active',
      class_teacher_name: 'Assigned Faculty',
      student_username: priv.studentEmail || s.studentCode,
      parent_username: priv.parentEmail || '',
    },
    attendanceAnalytics: {
      overall: summarizeAtt(attRows as any[], settings),
      monthly: summarizeAtt((attRows as any[]).filter((a) => String(a.date).startsWith(curMonth)), settings),
      yearly: summarizeAtt((attRows as any[]).filter((a) => String(a.date).startsWith(curYear)), settings),
      monthlySeries,
    },
    attendanceRecords: (attRows as any[]).slice(0, 60).map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      marked_at: r.markedAt || formatTs(r.createdAt),
    })),
    homeworkHistory,
    testResults,
    fees,
  };
}

function getRankingsFromArrays(
  students: any[],
  attendance: any[],
  testResults: any[],
  settings: Record<string, any>,
  classId?: string
) {
  const sts = students.filter((s) => s.status === 'active' && (!classId || String(s.classId) === String(classId)));
  const attendanceRanking = sts
    .map((s) => {
      const stats = summarizeAtt(
        attendance.filter((a) => String(a.studentId) === String(s.id)),
        settings
      );
      return {
        id: s.id,
        student_code: s.studentCode,
        full_name: s.fullName,
        photo_url: s.photoUrl || MALE_AVATAR,
        class_name: s.className || '',
        attendancePercentage: stats.percentage,
      };
    })
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const academicRanking = sts
    .map((s) => {
      const trs = testResults.filter((tr) => String(tr.studentId) === String(s.id));
      const obt = trs.reduce((acc, x) => acc + Number(x.obtainedMarks || 0), 0);
      const tot = trs.reduce((acc, x) => acc + Number(x.totalMarks || 0), 0);
      const pct = tot > 0 ? Number(((obt / tot) * 100).toFixed(1)) : 0;
      return {
        id: s.id,
        student_code: s.studentCode,
        full_name: s.fullName,
        photo_url: s.photoUrl || MALE_AVATAR,
        class_name: s.className || '',
        academicPercentage: pct,
        testCount: trs.length,
      };
    })
    .sort((a, b) => b.academicPercentage - a.academicPercentage)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { attendanceRanking, academicRanking };
}

export async function handleFirebaseApiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const pkt = getPktNow();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : {};

  if (pathname === '/api/health') {
    let settings = {
      academy_name: 'ABDALI EDUCATION ACADEMY',
      campus_address: 'Academic Boulevard, Islamabad',
      attendance_start_pkt: '08:00',
      attendance_end_pkt: '11:59',
      late_counts_as_present: '1',
      leave_excluded_from_denominator: '1',
    };
    if (auth.currentUser) {
      const s = await getSettings();
      settings = {
        academy_name: s.academyName,
        campus_address: s.campusAddress || '',
        attendance_start_pkt: s.attendanceStartPkt,
        attendance_end_pkt: s.attendanceEndPkt,
        late_counts_as_present: s.lateCountsAsPresent === false ? '0' : '1',
        leave_excluded_from_denominator: s.leaveExcludedFromDenominator === false ? '0' : '1',
      };
    }
    return { ok: true, pkt, settings } as T;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    throw new Error('Cloud Firestore backend is active. Click "Continue with Google (Cloud Backend)" below to sign in securely.');
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    await signOut(auth);
    return { ok: true } as T;
  }

  if (!auth.currentUser) {
    throw new Error('Authentication required. Please sign in with Google.');
  }

  const { uid, profile } = await ensureUserBootstrapped();
  const sessionUser = await buildSessionUser(uid, profile);

  if (pathname === '/api/auth/me') {
    const notifSnap = await safeGetDocs('notifications', [where('recipientUid', '==', uid)]);
    const unread = notifSnap.docs.filter((d) => !d.data().isRead).length;
    return { user: sessionUser, pkt, unreadNotifications: unread } as T;
  }

  if (pathname === '/api/auth/preferences' && method === 'PUT') {
    await safeUpdateDoc(`user_profiles/${uid}`, {
      soundAlerts: Boolean(body.soundAlerts),
      pushEnabled: Boolean(body.pushEnabled),
      updatedAt: serverTimestamp(),
    });
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    throw new Error('Google Sign-In manages your account password securely via Google.');
  }

  if (pathname === '/api/notifications') {
    const snap = await safeGetDocs('notifications', [where('recipientUid', '==', uid)]);
    const notifications = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          type: x.type,
          title: x.title,
          message: x.message,
          link_tab: x.linkTab || null,
          is_read: x.isRead ? 1 : 0,
          created_at: formatTs(x.createdAt),
        };
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { notifications } as T;
  }

  if (pathname.match(/^\/api\/notifications\/[^/]+\/read$/) && method === 'POST') {
    const nid = pathname.split('/')[3];
    await safeUpdateDoc(`notifications/${nid}`, { isRead: true });
    return { ok: true } as T;
  }

  if (pathname === '/api/notifications/read-all' && method === 'POST') {
    const snap = await safeGetDocs('notifications', [where('recipientUid', '==', uid)]);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      if (!d.data().isRead) batch.update(d.ref, { isRead: true });
    });
    await batch.commit();
    return { ok: true } as T;
  }

  if (pathname === '/api/announcements') {
    const snap =
      sessionUser.role === 'principal'
        ? await safeGetDocs('announcements')
        : await safeGetDocs('announcements', [where('viewerUids', 'array-contains', uid)]);
    const announcements = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          title: x.title,
          content: x.content,
          target_role: x.targetRole,
          priority: x.priority,
          created_at: formatTs(x.createdAt),
        };
      })
      .filter((a) => sessionUser.role === 'principal' || a.target_role === 'all' || a.target_role === sessionUser.role);
    return { announcements } as T;
  }

  if (pathname === '/api/holidays') {
    const snap =
      sessionUser.role === 'principal'
        ? await safeGetDocs('holidays')
        : await safeGetDocs('holidays', [where('viewerUids', 'array-contains', uid)]);
    const holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { holidays } as T;
  }

  if (pathname === '/api/timetable') {
    const snap =
      sessionUser.role === 'principal'
        ? await safeGetDocs('timetable')
        : sessionUser.role === 'teacher'
        ? await safeGetDocs('timetable', [where('teacherUid', '==', uid)])
        : await safeGetDocs('timetable', [where('viewerUids', 'array-contains', uid)]);
    const timetable = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        class_id: x.classId,
        class_name: x.className || '',
        day_of_week: x.dayOfWeek,
        period_number: x.periodNumber,
        start_time: x.startTime,
        end_time: x.endTime,
        subject: x.subject,
        teacher_name: x.teacherName || '',
      };
    });
    return { timetable } as T;
  }

  // ==================== PRINCIPAL ROUTES ====================
  if (pathname.startsWith('/api/principal/')) {
    if (sessionUser.role !== 'principal') throw new Error('Access denied for your account role.');
    const settings = await getSettings();

    if (pathname === '/api/principal/overview') {
      const [stsSnap, tchSnap, clsSnap, attSnap, subSnap, taSnap, crSnap] = await Promise.all([
        safeGetDocs('students'),
        safeGetDocs('teachers'),
        safeGetDocs('classes'),
        safeGetDocs('attendance'),
        safeGetDocs('attendance_submissions'),
        safeGetDocs('teacher_attendance'),
        safeGetDocs('correction_requests'),
      ]);
      const students = stsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const teachers = tchSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const classes = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const attendance = attSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const submissions = subSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const tAtt = taSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const corrections = crSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

      const todayAtt = attendance.filter((a) => a.date === pkt.date);
      const todayPresent = todayAtt.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      const todayAbsent = todayAtt.filter((a) => a.status === 'Absent').length;
      const overall = summarizeAtt(attendance, settings);
      const todayTAtt = tAtt.filter((a) => a.date === pkt.date);
      const submittedSet = new Set(submissions.filter((s) => s.date === pkt.date).map((s) => String(s.classId)));
      const pendingSubmissions = classes
        .filter((c) => !submittedSet.has(String(c.id)))
        .map((c) => ({
          id: c.id,
          class_code: c.classCode,
          name: c.name,
          section: c.section,
          teacher_name: c.teacherName || 'Unassigned',
          student_count: students.filter((s) => String(s.classId) === String(c.id) && s.status === 'active').length,
        }));

      const dateSet = Array.from(new Set(attendance.map((a) => String(a.date)))).sort().slice(-14);
      const monthlyOverview = dateSet.map((d) => {
        const rows = attendance.filter((a) => a.date === d);
        const st = summarizeAtt(rows, settings);
        return { date: d, label: d.slice(5), present: st.presentDays + st.lateDays, absent: st.absentDays, rate: st.percentage };
      });
      const classComparison = classes.map((c) => ({
        id: c.id,
        class_code: c.classCode,
        name: c.name,
        percentage: summarizeAtt(
          attendance.filter((a) => String(a.classId) === String(c.id)),
          settings
        ).percentage,
      }));

      return {
        pkt,
        kpis: {
          totalStudents: students.filter((s) => s.status === 'active').length,
          totalTeachers: teachers.filter((t) => t.status === 'active').length,
          totalClasses: classes.length,
          todayPresent,
          todayAbsent,
          overallAttendancePct: overall.percentage,
          teachersPresentToday: todayTAtt.filter((a) => a.status === 'Present' || a.status === 'Late').length,
          teachersAbsentToday: todayTAtt.filter((a) => a.status === 'Absent' || a.status === 'Leave').length,
          pendingSubmissionsCount: pendingSubmissions.length,
          pendingCorrectionsCount: corrections.filter((c) => c.status === 'pending').length,
        },
        pendingSubmissions,
        monthlyOverview,
        classComparison,
      } as T;
    }

    if (pathname === '/api/principal/classes' && method === 'GET') {
      const [clsSnap, stsSnap, attSnap, trSnap] = await Promise.all([
        safeGetDocs('classes'),
        safeGetDocs('students'),
        safeGetDocs('attendance'),
        safeGetDocs('test_results'),
      ]);
      const students = stsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const attendance = attSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const results = trSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

      const classes = clsSnap.docs.map((d) => {
        const c = d.data();
        const stIds = new Set(
          students.filter((s) => String(s.classId) === String(d.id) && s.status === 'active').map((s) => String(s.id))
        );
        const trs = results.filter((r) => stIds.has(String(r.studentId)));
        const avgScore = trs.length
          ? Number((trs.reduce((a, b) => a + Number(b.percentage || 0), 0) / trs.length).toFixed(1))
          : 0;
        return {
          id: d.id,
          class_code: c.classCode,
          name: c.name,
          section: c.section,
          room_number: c.roomNumber || '',
          teacher_id: c.teacherId || null,
          teacher_name: c.teacherName || 'Unassigned',
          student_count: stIds.size,
          attendancePercentage: summarizeAtt(
            attendance.filter((a) => String(a.classId) === String(d.id)),
            settings
          ).percentage,
          academicAverage: avgScore,
        };
      });
      return { classes } as T;
    }

    if (pathname === '/api/principal/classes' && method === 'POST') {
      const code = String(body.classCode || '').trim().toUpperCase();
      const clsSnap = await safeGetDocs('classes');
      if (clsSnap.docs.some((d) => String(d.data().classCode).toLowerCase() === code.toLowerCase())) {
        throw new Error(`Class ID "${code}" already exists.`);
      }
      let teacherName = 'Unassigned';
      let teacherUid = '';
      if (body.teacherId) {
        const tSnap = await safeGetDoc(`teachers/${body.teacherId}`);
        if (tSnap.exists()) {
          teacherName = tSnap.data().fullName || 'Assigned Faculty';
          teacherUid = tSnap.data().uid || '';
        }
      }
      const id = makeNumericId();
      await safeSetDoc(`classes/${id}`, {
        classCode: code,
        name: String(body.name).trim(),
        section: String(body.section || 'A').trim(),
        roomNumber: body.roomNumber ? String(body.roomNumber) : '',
        teacherId: body.teacherId ? String(body.teacherId) : '',
        teacherUid,
        teacherName,
        academicSessionId: '1',
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/principal\/classes\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[4];
      let teacherName = 'Unassigned';
      let teacherUid = '';
      if (body.teacherId) {
        const tSnap = await safeGetDoc(`teachers/${body.teacherId}`);
        if (tSnap.exists()) {
          teacherName = tSnap.data().fullName || 'Assigned Faculty';
          teacherUid = tSnap.data().uid || '';
        }
      }
      await safeUpdateDoc(`classes/${id}`, {
        name: String(body.name).trim(),
        section: String(body.section || 'A').trim(),
        roomNumber: body.roomNumber ? String(body.roomNumber) : '',
        teacherId: body.teacherId ? String(body.teacherId) : '',
        teacherUid,
        teacherName,
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/subjects' && method === 'GET') {
      const [subSnap, clsSnap] = await Promise.all([safeGetDocs('subjects'), safeGetDocs('classes')]);
      const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name]));
      return {
        subjects: subSnap.docs.map((d) => {
          const x = d.data();
          return { id: d.id, code: x.code, name: x.name, class_id: x.classId, class_name: clsMap.get(x.classId) || '' };
        }),
      } as T;
    }

    if (pathname === '/api/principal/subjects' && method === 'POST') {
      const id = makeNumericId();
      const clsSnap = await safeGetDoc(`classes/${body.classId}`);
      await safeSetDoc(`subjects/${id}`, {
        code: String(body.code).trim().toUpperCase(),
        name: String(body.name).trim(),
        classId: String(body.classId),
        teacherUid: clsSnap.exists() ? clsSnap.data().teacherUid || '' : '',
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/principal\/subjects\/[^/]+$/) && method === 'DELETE') {
      await safeDeleteDoc(`subjects/${pathname.split('/')[4]}`);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/teachers' && method === 'GET') {
      const [tchSnap, clsSnap, subSnap] = await Promise.all([
        safeGetDocs('teachers'),
        safeGetDocs('classes'),
        safeGetDocs('attendance_submissions'),
      ]);
      const classes = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const submissions = subSnap.docs.map((d) => d.data());
      const teachers = await Promise.all(
        tchSnap.docs.map(async (d) => {
          const t = d.data();
          const privSnap = await safeGetDoc(`teachers/${d.id}/private/info`);
          const priv = privSnap.exists() ? privSnap.data() : {};
          const assigned = classes
            .filter((c) => String(c.teacherId) === String(d.id))
            .map((c) => `${c.name} (${c.classCode})`)
            .join(', ');
          return {
            id: d.id,
            teacher_code: t.teacherCode,
            full_name: t.fullName,
            username: priv.email || t.teacherCode,
            subject_specialty: t.subjectSpecialty || '',
            phone: priv.phone || '',
            qualification: t.qualification || '',
            joining_date: t.joiningDate || '',
            status: t.status,
            is_active: t.status === 'active' ? 1 : 0,
            assigned_classes: assigned,
            submission_count: submissions.filter((s) => String(s.teacherId) === String(d.id)).length,
          };
        })
      );
      return { teachers } as T;
    }

    if (pathname === '/api/principal/teachers' && method === 'POST') {
      const tchSnap = await safeGetDocs('teachers');
      const teacherId = makeNumericId();
      const teacherCode = `TCH-2026-${String(tchSnap.size + 1).padStart(3, '0')}`;
      let assignedClassName = '';
      if (body.classId) {
        const clsSnap = await safeGetDoc(`classes/${body.classId}`);
        if (clsSnap.exists()) {
          assignedClassName = clsSnap.data().name || '';
          await safeUpdateDoc(`classes/${body.classId}`, {
            teacherId,
            teacherName: String(body.fullName).trim(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await safeSetDoc(`teachers/${teacherId}`, {
        teacherCode,
        uid: '',
        fullName: String(body.fullName).trim(),
        subjectSpecialty: body.subjectSpecialty || 'General',
        qualification: body.qualification || '',
        joiningDate: pkt.date,
        status: 'active',
        assignedClassId: body.classId ? String(body.classId) : '',
        assignedClassName,
        createdAt: serverTimestamp(),
      });
      const emailLower = String(body.username || '').includes('@') ? String(body.username).trim().toLowerCase() : '';
      await safeSetDoc(`teachers/${teacherId}/private/info`, {
        teacherId,
        email: emailLower,
        phone: body.phone || '',
        updatedAt: serverTimestamp(),
      });
      if (emailLower) {
        await safeSetDoc(`email_invites/${sanitizeId(emailLower)}`, {
          emailLower,
          role: 'teacher',
          fullName: String(body.fullName).trim(),
          code: teacherCode,
          teacherId,
          assignedClassId: body.classId ? String(body.classId) : '',
          createdByUid: uid,
          createdAt: serverTimestamp(),
        });
      }
      return { teacherId, teacherCode } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[4];
      const tSnap = await safeGetDoc(`teachers/${id}`);
      const existingTeacher = tSnap.exists() ? tSnap.data() : {};
      const updates: Record<string, unknown> = {
        fullName: body.fullName,
        subjectSpecialty: body.subjectSpecialty || 'General',
        qualification: body.qualification || '',
        updatedAt: serverTimestamp(),
      };
      if (body.classId !== undefined) {
        updates.assignedClassId = body.classId ? String(body.classId) : '';
        if (body.classId) {
          const clsSnap = await safeGetDoc(`classes/${body.classId}`);
          if (clsSnap.exists()) {
            updates.assignedClassName = clsSnap.data().name || '';
            await safeUpdateDoc(`classes/${body.classId}`, {
              teacherId: id,
              teacherUid: existingTeacher.uid || '',
              teacherName: body.fullName,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
      await safeUpdateDoc(`teachers/${id}`, updates);
      const emailLower = String(body.username || '').includes('@') ? String(body.username).trim().toLowerCase() : '';
      const privUpdates: Record<string, unknown> = {
        phone: body.phone || '',
        updatedAt: serverTimestamp(),
      };
      if (emailLower) privUpdates.email = emailLower;
      await safeUpdateDoc(`teachers/${id}/private/info`, privUpdates);
      if (emailLower) {
        await safeSetDoc(`email_invites/${sanitizeId(emailLower)}`, {
          emailLower,
          role: 'teacher',
          fullName: String(body.fullName).trim(),
          code: existingTeacher.teacherCode || '',
          teacherId: id,
          assignedClassId: body.classId ? String(body.classId) : existingTeacher.assignedClassId || '',
          createdByUid: uid,
          createdAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/[^/]+\/reset-password$/) && method === 'POST') {
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/principal\/teachers\/[^/]+\/toggle-status$/) && method === 'POST') {
      const id = pathname.split('/')[4];
      const tSnap = await safeGetDoc(`teachers/${id}`);
      if (tSnap.exists()) {
        const nextStatus = tSnap.data().status === 'active' ? 'inactive' : 'active';
        await safeUpdateDoc(`teachers/${id}`, { status: nextStatus, updatedAt: serverTimestamp() });
      }
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/teacher-attendance' && method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || pkt.date;
      const [tchSnap, taSnap] = await Promise.all([
        safeGetDocs('teachers'),
        safeGetDocs('teacher_attendance', [where('date', '==', date)]),
      ]);
      const recMap = new Map(taSnap.docs.map((d) => [String(d.data().teacherId), d.data()]));
      const records = tchSnap.docs
        .filter((d) => d.data().status === 'active')
        .map((d) => {
          const t = d.data();
          const rec = recMap.get(d.id);
          return {
            teacher_id: d.id,
            teacher_code: t.teacherCode,
            full_name: t.fullName,
            subject_specialty: t.subjectSpecialty || '',
            status: rec?.status || null,
            check_in_time: rec?.checkInTime || null,
          };
        });
      return { date, records } as T;
    }

    if (pathname === '/api/principal/teacher-attendance' && method === 'POST') {
      for (const r of body.records || []) {
        const docId = `ta_${r.teacherId}_${body.date}`;
        const existing = await safeGetDoc(`teacher_attendance/${docId}`);
        if (existing.exists()) {
          await safeUpdateDoc(`teacher_attendance/${docId}`, {
            status: r.status,
            checkInTime: r.checkInTime || '',
            updatedAt: serverTimestamp(),
          });
        } else {
          const tSnap = await safeGetDoc(`teachers/${r.teacherId}`);
          const t = tSnap.exists() ? tSnap.data() : {};
          await safeSetDoc(`teacher_attendance/${docId}`, {
            teacherId: String(r.teacherId),
            teacherUid: t.uid || '',
            teacherCode: t.teacherCode || '',
            fullName: t.fullName || '',
            date: body.date,
            status: r.status,
            checkInTime: r.checkInTime || '',
            createdAt: serverTimestamp(),
          });
        }
      }
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/attendance') {
      const date = parsedUrl.searchParams.get('date');
      const month = parsedUrl.searchParams.get('month');
      const year = parsedUrl.searchParams.get('year');
      const classId = parsedUrl.searchParams.get('classId');
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();

      const attSnap = await safeGetDocs('attendance');
      const records = attSnap.docs
        .map((d) => {
          const a = d.data();
          return {
            id: d.id,
            student_id: a.studentId,
            class_id: a.classId,
            date: a.date,
            status: a.status,
            student_code: a.studentCode || '',
            full_name: a.studentName || '',
            roll_number: a.rollNumber || '',
            parent_mobile: '',
            class_name: a.className || '',
          };
        })
        .filter((r) => {
          if (classId && String(r.class_id) !== String(classId)) return false;
          if (month && !String(r.date).startsWith(month)) return false;
          if (year && !String(r.date).startsWith(year)) return false;
          if (date && !month && !year && r.date !== date) return false;
          if (search && !r.full_name.toLowerCase().includes(search) && !r.student_code.toLowerCase().includes(search) && !r.roll_number.toLowerCase().includes(search)) return false;
          return true;
        });

      return { pkt, records, absentStudents: records.filter((r) => r.status === 'Absent'), summary: summarizeAtt(records, settings) } as T;
    }

    if (pathname === '/api/principal/correction-requests') {
      const snap = await safeGetDocs('correction_requests');
      return {
        requests: snap.docs.map((d) => {
          const cr = d.data();
          return {
            id: d.id,
            attendance_id: cr.attendanceId,
            student_id: cr.studentId,
            student_name: cr.studentName || '',
            student_code: cr.studentCode || '',
            class_name: cr.className || '',
            teacher_name: cr.teacherName || '',
            date: cr.date || '',
            old_status: cr.oldStatus,
            requested_status: cr.requestedStatus,
            reason: cr.reason,
            status: cr.status,
          };
        }),
      } as T;
    }

    if (pathname.match(/^\/api\/principal\/correction-requests\/[^/]+\/review$/) && method === 'POST') {
      const id = pathname.split('/')[4];
      const crSnap = await safeGetDoc(`correction_requests/${id}`);
      if (!crSnap.exists() || crSnap.data().status !== 'pending') throw new Error('Correction request already processed.');
      const cr = crSnap.data();
      await safeUpdateDoc(`correction_requests/${id}`, {
        status: body.decision,
        reviewedByUid: uid,
        reviewedAt: `${pkt.date} ${pkt.time} PKT`,
        updatedAt: serverTimestamp(),
      });
      if (body.decision === 'approved') {
        await safeUpdateDoc(`attendance/${cr.attendanceId}`, {
          status: cr.requestedStatus,
          updatedAt: serverTimestamp(),
        });
      }
      await addAuditLog(
        { uid, fullName: sessionUser.fullName, role: 'principal' },
        body.decision === 'approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
        'attendance',
        cr.attendanceId,
        { status: cr.oldStatus },
        { status: body.decision === 'approved' ? cr.requestedStatus : cr.oldStatus },
        cr.reason
      );
      if (cr.requestedByTeacherUid) {
        await pushCloudNotif(
          cr.requestedByTeacherUid,
          uid,
          'correction_reviewed',
          `Correction ${body.decision}`,
          `${cr.studentName}: ${cr.oldStatus} → ${cr.requestedStatus}`,
          'attendance'
        );
      }
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/audit-logs') {
      const snap = await safeGetDocs('audit_logs');
      const logs = snap.docs
        .map((d) => {
          const l = d.data();
          return {
            id: d.id,
            actor_name: l.actorName,
            actor_role: l.actorRole,
            action_type: l.actionType,
            target_table: l.targetTable,
            target_id: l.targetId,
            old_value: l.oldValue || null,
            new_value: l.newValue || null,
            reason: l.reason || null,
            created_at: formatTs(l.createdAt),
          };
        })
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { logs } as T;
    }

    if (pathname === '/api/principal/students' && method === 'GET') {
      const classId = parsedUrl.searchParams.get('classId');
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();
      const [stsSnap, attSnap] = await Promise.all([safeGetDocs('students'), safeGetDocs('attendance')]);
      const attendance = attSnap.docs.map((d) => d.data());
      const students = stsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (s: any) =>
            (!classId || String(s.classId) === String(classId)) &&
            (!search ||
              String(s.fullName).toLowerCase().includes(search) ||
              String(s.studentCode).toLowerCase().includes(search) ||
              String(s.rollNumber).toLowerCase().includes(search))
        )
        .map((s: any) => ({
          id: s.id,
          student_code: s.studentCode,
          full_name: s.fullName,
          father_name: s.fatherName,
          photo_url: s.photoUrl || MALE_AVATAR,
          class_id: s.classId,
          class_name: s.className || '',
          roll_number: s.rollNumber,
          attendancePercentage: summarizeAtt(
            attendance.filter((a) => String(a.studentId) === String(s.id)),
            settings
          ).percentage,
        }));
      return { students } as T;
    }

    if (pathname.match(/^\/api\/principal\/students\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[4];
      const profileData = await buildStudentFullProfileFB(id);
      if (!profileData) throw new Error('Student not found.');
      return profileData as T;
    }

    if (pathname === '/api/principal/students/promote' && method === 'POST') {
      const targetId = String(body.targetClassId);
      const clsSnap = await safeGetDoc(`classes/${targetId}`);
      const cls = clsSnap.exists() ? clsSnap.data() : {};
      for (const sid of body.studentIds || []) {
        await safeUpdateDoc(`students/${sid}`, {
          classId: targetId,
          className: cls.name || '',
          teacherUid: cls.teacherUid || '',
          updatedAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/analytics') {
      const classId = parsedUrl.searchParams.get('classId') || undefined;
      const [stsSnap, attSnap, tstSnap, trSnap] = await Promise.all([
        safeGetDocs('students'),
        safeGetDocs('attendance'),
        safeGetDocs('tests'),
        safeGetDocs('test_results'),
      ]);
      const students = stsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const attendance = attSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const tests = tstSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      const testResults = trSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

      const dates = Array.from(new Set(attendance.map((a) => String(a.date)))).sort();
      const dailyChart = dates.map((d) => {
        const rows = attendance.filter((a) => a.date === d && (!classId || String(a.classId) === String(classId)));
        return {
          date: d,
          present: rows.filter((r) => r.status === 'Present').length,
          absent: rows.filter((r) => r.status === 'Absent').length,
        };
      });
      const testPerformance = tests
        .filter((t) => !classId || String(t.classId) === String(classId))
        .map((t) => {
          const res = testResults.filter((r) => String(r.testId) === String(t.id));
          const avg = res.length
            ? Number((res.reduce((a, b) => a + Number(b.percentage || 0), 0) / res.length).toFixed(1))
            : 0;
          return { id: t.id, title: t.title, subject: t.subject, avg_percentage: avg };
        });

      return { dailyChart, testPerformance, rankings: getRankingsFromArrays(students, attendance, testResults, settings, classId) } as T;
    }

    if (pathname === '/api/principal/announcements' && method === 'POST') {
      const id = `ann_${makeNumericId()}`;
      const profSnap = await safeGetDocs('user_profiles');
      const viewerUids = profSnap.docs.map((d) => d.id).slice(0, 200);
      await safeSetDoc(`announcements/${id}`, {
        title: String(body.title).trim(),
        content: String(body.content).trim(),
        targetRole: body.targetRole || 'all',
        priority: body.priority || 'normal',
        createdByUid: uid,
        viewerUids,
        createdAt: serverTimestamp(),
      });
      for (const p of profSnap.docs) {
        const pd = p.data();
        if (pd.role !== 'principal' && (body.targetRole === 'all' || pd.role === body.targetRole)) {
          await pushCloudNotif(p.id, uid, 'announcement', body.title, body.content, 'overview');
        }
      }
      return { id } as T;
    }

    if (pathname === '/api/principal/holidays' && method === 'POST') {
      const id = `hol_${makeNumericId()}`;
      const profSnap = await safeGetDocs('user_profiles');
      const viewerUids = profSnap.docs.map((d) => d.id).slice(0, 200);
      await safeSetDoc(`holidays/${id}`, {
        date: String(body.date),
        title: String(body.title).trim(),
        description: String(body.description || '').trim(),
        viewerUids,
        createdByUid: uid,
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/principal\/holidays\/[^/]+$/) && method === 'DELETE') {
      await safeDeleteDoc(`holidays/${pathname.split('/')[4]}`);
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/fees') {
      const snap = await safeGetDocs('fees');
      return {
        fees: snap.docs.map((d) => {
          const f = d.data();
          return {
            id: d.id,
            student_id: f.studentId,
            student_name: f.studentName || '',
            student_code: f.studentCode || '',
            class_name: f.className || '',
            month: f.month,
            year: f.year,
            amount: f.amount,
            status: f.status,
            paid_at: f.paidAt || null,
            receipt_no: f.receiptNo || null,
          };
        }),
      } as T;
    }

    if (pathname.match(/^\/api\/principal\/fees\/[^/]+\/mark-paid$/) && method === 'POST') {
      const id = pathname.split('/')[4];
      await safeUpdateDoc(`fees/${id}`, {
        status: 'Paid',
        paidAt: pkt.date,
        receiptNo: `AEA-RCP-${id.slice(-6)}`,
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/sessions' && method === 'GET') {
      const snap = await safeGetDocs('sessions');
      return {
        sessions: snap.docs.map((d) => {
          const s = d.data();
          return { id: d.id, name: s.name, start_date: s.startDate, end_date: s.endDate, is_active: s.isActive ? 1 : 0 };
        }),
      } as T;
    }

    if (pathname === '/api/principal/sessions' && method === 'POST') {
      const id = makeNumericId();
      await safeSetDoc(`sessions/${id}`, {
        name: String(body.name).trim(),
        startDate: String(body.startDate),
        endDate: String(body.endDate),
        isActive: false,
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/principal\/sessions\/[^/]+\/activate$/) && method === 'POST') {
      const id = pathname.split('/')[4];
      const snap = await safeGetDocs('sessions');
      for (const d of snap.docs) {
        await safeUpdateDoc(`sessions/${d.id}`, { isActive: d.id === id, updatedAt: serverTimestamp() });
      }
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/settings' && method === 'GET') {
      return {
        settings: {
          academy_name: settings.academyName,
          campus_address: settings.campusAddress || '',
          attendance_start_pkt: settings.attendanceStartPkt,
          attendance_end_pkt: settings.attendanceEndPkt,
          late_counts_as_present: settings.lateCountsAsPresent === false ? '0' : '1',
          leave_excluded_from_denominator: settings.leaveExcludedFromDenominator === false ? '0' : '1',
        },
      } as T;
    }

    if (pathname === '/api/principal/settings' && method === 'PUT') {
      await safeUpdateDoc('settings/academy', {
        academyName: String(body.academy_name || settings.academyName),
        campusAddress: String(body.campus_address || settings.campusAddress || ''),
        attendanceStartPkt: String(body.attendance_start_pkt || '08:00'),
        attendanceEndPkt: String(body.attendance_end_pkt || '11:59'),
        lateCountsAsPresent: body.late_counts_as_present !== '0',
        leaveExcludedFromDenominator: body.leave_excluded_from_denominator !== '0',
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    }

    if (pathname === '/api/principal/backup' && method === 'GET') {
      const [classes, teachers, students, attendance, tests, results, fees] = await Promise.all([
        safeGetDocs('classes'),
        safeGetDocs('teachers'),
        safeGetDocs('students'),
        safeGetDocs('attendance'),
        safeGetDocs('tests'),
        safeGetDocs('test_results'),
        safeGetDocs('fees'),
      ]);
      return {
        exportedAt: `${pkt.date} ${pkt.time} PKT`,
        academy: settings.academyName,
        source: 'Firebase Cloud Firestore',
        collections: {
          classes: classes.docs.map((d) => ({ id: d.id, ...d.data() })),
          teachers: teachers.docs.map((d) => ({ id: d.id, ...d.data() })),
          students: students.docs.map((d) => ({ id: d.id, ...d.data() })),
          attendance: attendance.docs.map((d) => ({ id: d.id, ...d.data() })),
          tests: tests.docs.map((d) => ({ id: d.id, ...d.data() })),
          test_results: results.docs.map((d) => ({ id: d.id, ...d.data() })),
          fees: fees.docs.map((d) => ({ id: d.id, ...d.data() })),
        },
      } as T;
    }
  }

  // ==================== TEACHER ROUTES ====================
  if (pathname.startsWith('/api/teacher/')) {
    if (sessionUser.role !== 'teacher') throw new Error('Access denied for your account role.');
    const settings = await getSettings();
    const classId = profile.assignedClassId || sessionUser.assignedClass?.id;
    const teacherId = profile.teacherId;
    if (!classId || !teacherId) throw new Error('No class assigned to your faculty account.');

    const [tSnap, clsSnap] = await Promise.all([safeGetDoc(`teachers/${teacherId}`), safeGetDoc(`classes/${classId}`)]);
    const teacherData = tSnap.exists() ? tSnap.data() : {};
    const clsData = clsSnap.exists() ? clsSnap.data() : {};

    if (pathname === '/api/teacher/overview') {
      const [stsSnap, attSnap, hwSnap, tstSnap] = await Promise.all([
        safeGetDocs('students', [where('teacherUid', '==', uid)]),
        safeGetDocs('attendance', [where('teacherUid', '==', uid)]),
        safeGetDocs('homework', [where('teacherUid', '==', uid)]),
        safeGetDocs('tests', [where('teacherUid', '==', uid)]),
      ]);
      const students = stsSnap.docs.filter((d) => d.data().status === 'active');
      const attRows = attSnap.docs.map((d) => d.data());
      const todayRows = attRows.filter((a) => a.date === pkt.date);
      return {
        pkt,
        teacher: { id: teacherId, teacher_code: teacherData.teacherCode, full_name: sessionUser.fullName },
        assignedClass: { id: classId, class_code: clsData.classCode, name: clsData.name, section: clsData.section, room_number: clsData.roomNumber },
        stats: {
          totalStudents: students.length,
          presentToday: todayRows.filter((r) => r.status === 'Present').length,
          absentToday: todayRows.filter((r) => r.status === 'Absent').length,
          classAttendanceAverage: summarizeAtt(attRows, settings).percentage,
          homeworkCount: hwSnap.docs.filter((d) => d.data().status === 'published').length,
        },
        upcomingTests: tstSnap.docs.map((d) => ({ id: d.id, ...d.data(), test_date: d.data().testDate })).filter((t) => t.test_date >= pkt.date),
      } as T;
    }

    if (pathname === '/api/teacher/students' && method === 'GET') {
      const search = (parsedUrl.searchParams.get('search') || '').toLowerCase();
      const [stsSnap, attSnap] = await Promise.all([
        safeGetDocs('students', [where('teacherUid', '==', uid)]),
        safeGetDocs('attendance', [where('teacherUid', '==', uid)]),
      ]);
      const attendance = attSnap.docs.map((d) => d.data());
      const students = stsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s: any) => s.status === 'active')
        .filter((s: any) => !search || String(s.fullName).toLowerCase().includes(search) || String(s.studentCode).toLowerCase().includes(search) || String(s.rollNumber).toLowerCase().includes(search))
        .map((s: any) => ({
          id: s.id,
          student_code: s.studentCode,
          full_name: s.fullName,
          father_name: s.fatherName,
          photo_url: s.photoUrl || MALE_AVATAR,
          dob: s.dob || '',
          gender: s.gender || 'Male',
          roll_number: s.rollNumber,
          parent_name: s.parentName || '',
          class_name: s.className || clsData.name,
          attendancePercentage: summarizeAtt(
            attendance.filter((a) => String(a.studentId) === String(s.id)),
            settings
          ).percentage,
        }));
      return { students } as T;
    }

    if (pathname === '/api/teacher/students' && method === 'POST') {
      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const stId = makeNumericId();
      const studentCode = `AEA-2026-${String(1000 + stsSnap.size + 1)}`;
      const parentCode = `PAR-2026-${String(1000 + stsSnap.size + 1)}`;
      const photo = body.photoUrl || (body.gender === 'Female' ? FEMALE_AVATAR : MALE_AVATAR);

      await safeSetDoc(`students/${stId}`, {
        studentCode,
        fullName: String(body.fullName).trim(),
        fatherName: String(body.fatherName).trim(),
        photoUrl: photo,
        dob: body.dob || '',
        gender: body.gender || 'Male',
        classId,
        className: clsData.name || '',
        section: clsData.section || 'A',
        rollNumber: String(body.rollNumber).trim(),
        teacherUid: uid,
        studentUid: '',
        parentUid: '',
        parentName: String(body.parentName).trim(),
        admissionDate: pkt.date,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      const studentEmail = String(body.studentUsername || '').includes('@')
        ? String(body.studentUsername).trim().toLowerCase()
        : '';
      const parentEmail = String(body.parentUsername || '').includes('@')
        ? String(body.parentUsername).trim().toLowerCase()
        : '';

      await safeSetDoc(`students/${stId}/private/info`, {
        studentId: stId,
        parentMobile: String(body.parentMobile).trim(),
        studentEmail,
        parentEmail,
        updatedAt: serverTimestamp(),
      });
      if (studentEmail) {
        await safeSetDoc(`email_invites/${sanitizeId(studentEmail)}`, {
          emailLower: studentEmail,
          role: 'student',
          fullName: String(body.fullName).trim(),
          code: studentCode,
          studentId: stId,
          assignedClassId: String(classId),
          createdByUid: uid,
          createdAt: serverTimestamp(),
        });
      }
      if (parentEmail) {
        await safeSetDoc(`email_invites/${sanitizeId(parentEmail)}`, {
          emailLower: parentEmail,
          role: 'parent',
          fullName: String(body.parentName).trim(),
          code: parentCode,
          studentId: stId,
          assignedClassId: String(classId),
          createdByUid: uid,
          createdAt: serverTimestamp(),
        });
      }
      return { studentId: stId, studentCode, parentCode } as T;
    }

    if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[4];
      await safeUpdateDoc(`students/${id}`, {
        fullName: String(body.fullName).trim(),
        fatherName: String(body.fatherName).trim(),
        dob: body.dob || '',
        gender: body.gender || 'Male',
        rollNumber: String(body.rollNumber || '').trim(),
        parentName: String(body.parentName || '').trim(),
        photoUrl: body.photoUrl || MALE_AVATAR,
        updatedAt: serverTimestamp(),
      });
      if (body.parentMobile) {
        await safeUpdateDoc(`students/${id}/private/info`, {
          parentMobile: String(body.parentMobile).trim(),
          updatedAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    }

    if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && method === 'DELETE') {
      throw new Error('Teachers are not permitted to permanently delete student records.');
    }

    if (pathname.match(/^\/api\/teacher\/students\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[4];
      const profileData = await buildStudentFullProfileFB(id);
      if (!profileData || String(profileData.student.class_id) !== String(classId)) {
        throw new Error('Access denied: student belongs to another class.');
      }
      return profileData as T;
    }

    if (pathname === '/api/teacher/rankings') {
      const [stsSnap, attSnap, trSnap] = await Promise.all([
        safeGetDocs('students', [where('teacherUid', '==', uid)]),
        safeGetDocs('attendance', [where('teacherUid', '==', uid)]),
        safeGetDocs('test_results', [where('teacherUid', '==', uid)]),
      ]);
      const students = stsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const attendance = attSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const testResults = trSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return getRankingsFromArrays(students, attendance, testResults, settings, classId) as T;
    }

    if (pathname === '/api/teacher/attendance' && method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || pkt.date;
      const [subSnap, stsSnap, attSnap] = await Promise.all([
        safeGetDoc(`attendance_submissions/sub_${classId}_${date}`),
        safeGetDocs('students', [where('teacherUid', '==', uid)]),
        safeGetDocs('attendance', [where('teacherUid', '==', uid)]),
      ]);
      const dateAttMap = new Map(
        attSnap.docs.filter((d) => d.data().date === date).map((d) => [String(d.data().studentId), { id: d.id, ...d.data() }])
      );
      const students = stsSnap.docs
        .filter((d) => d.data().status === 'active')
        .map((d) => {
          const s = d.data();
          const a: any = dateAttMap.get(d.id);
          return {
            student_id: d.id,
            student_code: s.studentCode,
            full_name: s.fullName,
            roll_number: s.rollNumber,
            photo_url: s.photoUrl || MALE_AVATAR,
            attendance_id: a?.id || null,
            status: a?.status || null,
            marked_at: a?.markedAt || null,
          };
        });
      return {
        pkt,
        classInfo: { id: classId, class_code: clsData.classCode, name: clsData.name, section: clsData.section },
        date,
        isToday: date === pkt.date,
        submission: subSnap.exists() ? { id: subSnap.id, ...subSnap.data() } : null,
        students,
      } as T;
    }

    if (pathname === '/api/teacher/attendance' && method === 'POST') {
      if (!pkt.isAttendanceWindowOpen) {
        throw new Error(`Attendance submission blocked by PKT clock (${pkt.time} PKT). ${pkt.windowMessage}`);
      }
      const subId = `sub_${classId}_${pkt.date}`;
      const existingSub = await safeGetDoc(`attendance_submissions/${subId}`);
      if (existingSub.exists()) {
        throw new Error('Attendance for today has already been submitted and locked.');
      }

      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const stuMap = new Map(stsSnap.docs.map((d) => [d.id, d.data()]));

      const batch = writeBatch(db);
      let p = 0, a = 0, l = 0, lv = 0;
      for (const entry of body.entries || []) {
        if (entry.status === 'Present') p++;
        else if (entry.status === 'Absent') a++;
        else if (entry.status === 'Late') l++;
        else lv++;
        const st = stuMap.get(String(entry.studentId)) || {};
        batch.set(doc(db, `attendance/att_${entry.studentId}_${pkt.date}`), {
          submissionId: subId,
          studentId: String(entry.studentId),
          studentCode: st.studentCode || '',
          studentName: st.fullName || '',
          rollNumber: st.rollNumber || '',
          classId,
          className: clsData.name || '',
          date: pkt.date,
          status: entry.status,
          teacherUid: uid,
          studentUid: st.studentUid || '',
          parentUid: st.parentUid || '',
          markedByUid: uid,
          markedAt: `${pkt.date} ${pkt.time}`,
          createdAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, `attendance_submissions/${subId}`), {
        classId,
        date: pkt.date,
        teacherId,
        teacherUid: uid,
        pktTimeStr: pkt.time,
        totalStudents: (body.entries || []).length,
        presentCount: p,
        absentCount: a,
        lateCount: l,
        leaveCount: lv,
        isLocked: true,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return { ok: true, submissionId: subId, pkt } as T;
    }

    if (pathname === '/api/teacher/correction-requests' && method === 'GET') {
      const snap = await safeGetDocs('correction_requests', [where('requestedByTeacherUid', '==', uid)]);
      return {
        requests: snap.docs.map((d) => {
          const cr = d.data();
          return {
            id: d.id,
            student_name: cr.studentName,
            date: cr.date,
            old_status: cr.oldStatus,
            requested_status: cr.requestedStatus,
            reason: cr.reason,
            status: cr.status,
          };
        }),
      } as T;
    }

    if (pathname === '/api/teacher/correction-requests' && method === 'POST') {
      const attSnap = await safeGetDoc(`attendance/${body.attendanceId}`);
      if (!attSnap.exists()) throw new Error('Attendance record not found.');
      const att = attSnap.data();
      const id = `cr_${makeNumericId()}`;
      await safeSetDoc(`correction_requests/${id}`, {
        attendanceId: attSnap.id,
        studentId: att.studentId,
        studentName: att.studentName || '',
        studentCode: att.studentCode || '',
        classId: att.classId,
        className: att.className || clsData.name || '',
        date: att.date,
        requestedByTeacherUid: uid,
        teacherName: sessionUser.fullName,
        oldStatus: att.status,
        requestedStatus: body.requestedStatus,
        reason: String(body.reason).trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname === '/api/teacher/homework' && method === 'GET') {
      const snap = await safeGetDocs('homework', [where('teacherUid', '==', uid)]);
      return {
        homework: snap.docs.map((d) => {
          const h = d.data();
          return {
            id: d.id,
            subject: h.subject,
            title: h.title,
            description: h.description,
            assigned_date: h.assignedDate || '',
            due_date: h.dueDate,
            status: h.status,
          };
        }),
      } as T;
    }

    if (pathname === '/api/teacher/homework' && method === 'POST') {
      const id = `hw_${makeNumericId()}`;
      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const viewerUids = Array.from(
        new Set(stsSnap.docs.flatMap((d) => [d.data().studentUid, d.data().parentUid]).filter(Boolean))
      ).slice(0, 200) as string[];
      await safeSetDoc(`homework/${id}`, {
        classId,
        teacherUid: uid,
        subject: String(body.subject),
        title: String(body.title),
        description: String(body.description),
        assignedDate: pkt.date,
        dueDate: String(body.dueDate),
        attachmentUrl: body.attachmentUrl || '',
        attachmentName: body.attachmentName || '',
        status: body.status === 'draft' ? 'draft' : 'published',
        viewerUids,
        publishedAt: body.status === 'draft' ? '' : `${pkt.date} ${pkt.time}`,
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/teacher\/homework\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[4];
      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const viewerUids = Array.from(
        new Set(stsSnap.docs.flatMap((d) => [d.data().studentUid, d.data().parentUid]).filter(Boolean))
      ).slice(0, 200) as string[];
      await safeUpdateDoc(`homework/${id}`, {
        subject: body.subject,
        title: body.title,
        description: body.description,
        dueDate: body.dueDate,
        status: body.status === 'published' ? 'published' : 'draft',
        viewerUids,
        publishedAt: body.status === 'published' ? `${pkt.date} ${pkt.time}` : '',
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    }

    if (pathname === '/api/teacher/tests' && method === 'GET') {
      const [tstSnap, trSnap] = await Promise.all([
        safeGetDocs('tests', [where('teacherUid', '==', uid)]),
        safeGetDocs('test_results', [where('teacherUid', '==', uid)]),
      ]);
      const allRes = trSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      return {
        tests: tstSnap.docs.map((d) => {
          const t = d.data();
          const results = allRes
            .filter((r) => String(r.testId) === d.id)
            .map((r) => ({
              id: r.id,
              student_id: r.studentId,
              student_name: r.studentName || '',
              obtained_marks: r.obtainedMarks,
              total_marks: r.totalMarks,
              percentage: r.percentage,
              grade: r.grade,
              remarks: r.remarks || '',
              class_position: 1,
            }));
          return {
            id: d.id,
            title: t.title,
            subject: t.subject,
            test_type: t.testType || 'Weekly',
            test_date: t.testDate,
            total_marks: t.totalMarks,
            syllabus: t.syllabus || '',
            graded_count: results.length,
            results,
          };
        }),
      } as T;
    }

    if (pathname === '/api/teacher/tests' && method === 'POST') {
      const id = `tst_${makeNumericId()}`;
      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const viewerUids = Array.from(
        new Set(stsSnap.docs.flatMap((d) => [d.data().studentUid, d.data().parentUid]).filter(Boolean))
      ).slice(0, 200) as string[];
      await safeSetDoc(`tests/${id}`, {
        classId,
        teacherUid: uid,
        title: String(body.title),
        subject: String(body.subject),
        testType: body.testType || 'Weekly',
        testDate: String(body.testDate),
        totalMarks: Number(body.totalMarks),
        syllabus: String(body.syllabus || ''),
        instructions: String(body.instructions || ''),
        status: 'published',
        viewerUids,
        createdAt: serverTimestamp(),
      });
      return { id } as T;
    }

    if (pathname.match(/^\/api\/teacher\/tests\/[^/]+\/marks$/) && method === 'POST') {
      const testId = pathname.split('/')[4];
      const testSnap = await safeGetDoc(`tests/${testId}`);
      if (!testSnap.exists()) throw new Error('Test not found.');
      const test = testSnap.data();
      const stsSnap = await safeGetDocs('students', [where('teacherUid', '==', uid)]);
      const stuMap = new Map(stsSnap.docs.map((d) => [d.id, d.data()]));

      for (const m of body.marks || []) {
        const obtained = Math.max(0, Math.min(Number(test.totalMarks), Number(m.obtainedMarks)));
        const pct = Number(((obtained / Number(test.totalMarks)) * 100).toFixed(1));
        const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
        const resId = `tr_${testId}_${m.studentId}`;
        const existing = await safeGetDoc(`test_results/${resId}`);
        const st = stuMap.get(String(m.studentId)) || {};
        if (existing.exists()) {
          await safeUpdateDoc(`test_results/${resId}`, {
            obtainedMarks: obtained,
            percentage: pct,
            grade,
            remarks: m.remarks || '',
            updatedAt: serverTimestamp(),
          });
        } else {
          await safeSetDoc(`test_results/${resId}`, {
            testId,
            testTitle: test.title,
            subject: test.subject,
            testType: test.testType || 'Weekly',
            testDate: test.testDate,
            studentId: String(m.studentId),
            studentName: st.fullName || '',
            classId,
            teacherUid: uid,
            studentUid: st.studentUid || '',
            parentUid: st.parentUid || '',
            obtainedMarks: obtained,
            totalMarks: Number(test.totalMarks),
            percentage: pct,
            grade,
            remarks: m.remarks || '',
            recordedByUid: uid,
            createdAt: serverTimestamp(),
          });
        }
      }
      return { ok: true } as T;
    }
  }

  // ==================== STUDENT DASHBOARD ====================
  if (pathname === '/api/student/dashboard') {
    if (sessionUser.role !== 'student') throw new Error('Access denied.');
    const stsSnap = await safeGetDocs('students', [where('studentUid', '==', uid)]);
    if (stsSnap.empty) throw new Error('Student record not found.');
    const stDoc = stsSnap.docs[0];
    const full = await buildStudentFullProfileFB(stDoc.id);
    if (!full) throw new Error('Student record not found.');
    const todayAtt = full.attendanceRecords.find((a) => a.date === pkt.date) || null;
    const tstSnap = await safeGetDocs('tests', [where('viewerUids', 'array-contains', uid)]);
    const upcomingTests = tstSnap.docs
      .map((d) => ({ id: d.id, ...d.data(), test_date: d.data().testDate }))
      .filter((t) => t.test_date >= pkt.date);
    return { pkt, todayAttendance: todayAtt, upcomingTests, ...full } as T;
  }

  // ==================== PARENT DASHBOARD ====================
  if (pathname === '/api/parent/dashboard') {
    if (sessionUser.role !== 'parent') throw new Error('Access denied.');
    const stsSnap = await safeGetDocs('students', [where('parentUid', '==', uid)]);
    const tstSnap = await safeGetDocs('tests', [where('viewerUids', 'array-contains', uid)]);
    const allTests = tstSnap.docs.map((d) => ({ id: d.id, ...d.data(), test_date: d.data().testDate }));
    const children = await Promise.all(
      stsSnap.docs
        .filter((d) => d.data().status === 'active')
        .map(async (d) => {
          const full = (await buildStudentFullProfileFB(d.id))!;
          const todayAtt = full.attendanceRecords.find((a) => a.date === pkt.date) || null;
          const upcomingTests = allTests.filter((t: any) => String(t.classId) === String(d.data().classId) && t.test_date >= pkt.date);
          return { ...full, todayAttendance: todayAtt, upcomingTests };
        })
    );
    return { pkt, children } as T;
  }

  throw new Error(`Unsupported endpoint: ${pathname}`);
}
