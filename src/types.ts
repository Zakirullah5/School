export type UserRole = 'principal' | 'teacher' | 'student' | 'parent';

export interface SessionUser {
  id: number;
  username: string;
  role: UserRole;
  fullName: string;
  avatarUrl?: string | null;
  mustChangePassword?: boolean;
  soundAlerts?: boolean;
  pushEnabled?: boolean;
  code?: string;
  designation?: string;
  teacherId?: number;
  subjectSpecialty?: string;
  assignedClass?: {
    id: number;
    class_code: string;
    name: string;
  } | null;
  studentId?: number;
  className?: string;
  rollNumber?: string;
}

export interface PktTimeInfo {
  date: string;
  time: string;
  hour: number;
  minute: number;
  second: number;
  isAttendanceWindowOpen: boolean;
  windowStatus: 'before_open' | 'open' | 'locked_after';
  windowMessage: string;
  serverTimestampMs: number;
}

export interface NotificationItem {
  id: number;
  recipient_user_id: number;
  type: string;
  title: string;
  message: string;
  link_tab?: string | null;
  link_meta_json?: string | null;
  is_read: number;
  created_at: string;
}

export interface AttendanceStats {
  totalDays: number;
  countedDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  percentage: number;
}

export interface StudentFullProfile {
  student: {
    id: number;
    student_code: string;
    full_name: string;
    father_name: string;
    photo_url: string | null;
    dob: string;
    gender: string;
    class_id: number;
    class_name: string;
    class_code: string;
    section: string;
    room_number: string | null;
    roll_number: string;
    parent_name: string;
    parent_mobile: string;
    parent_username?: string;
    student_username?: string;
    class_teacher_name?: string;
    admission_date: string;
    status: string;
  };
  attendanceAnalytics: {
    overall: AttendanceStats;
    monthly: AttendanceStats;
    yearly: AttendanceStats;
    monthlySeries: Array<AttendanceStats & { month: string }>;
  };
  attendanceRecords: Array<{
    id: number;
    date: string;
    status: 'Present' | 'Absent' | 'Late' | 'Leave';
    marked_at: string;
  }>;
  homeworkHistory: Array<{
    id: number;
    subject: string;
    title: string;
    description: string;
    assigned_date: string;
    due_date: string;
    attachment_url: string | null;
    attachment_name: string | null;
    teacher_name?: string;
  }>;
  testResults: Array<{
    id: number;
    test_id: number;
    test_title: string;
    subject: string;
    test_type: string;
    test_date: string;
    obtained_marks: number;
    total_marks: number;
    percentage: number;
    grade: string;
    remarks: string | null;
    class_position: number;
    total_appeared: number;
  }>;
  fees: Array<{
    id: number;
    month: string;
    year: number;
    amount: number;
    status: string;
    paid_at: string | null;
    receipt_no: string | null;
  }>;
}
