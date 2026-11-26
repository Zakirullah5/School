// Security specification verification cases for Abdali Education Academy Firestore rules.
// Evaluates the 12 Dirty Dozen payloads against Firestore Security Rules invariants.

export const DIRTY_DOZEN_PAYLOADS = [
  { name: 'Unauthenticated student read', operation: 'get', path: 'students/stu_1', auth: null, expected: 'PERMISSION_DENIED' },
  { name: 'Unverified email profile create', operation: 'create', path: 'user_profiles/u1', auth: { uid: 'u1', email_verified: false }, expected: 'PERMISSION_DENIED' },
  { name: 'Self-escalation to admins', operation: 'create', path: 'admins/u1', auth: { uid: 'u1', email: 'other@example.com', email_verified: true }, expected: 'PERMISSION_DENIED' },
  { name: 'Self-escalation to principal role', operation: 'update', path: 'user_profiles/u1', payload: { role: 'principal' }, expected: 'PERMISSION_DENIED' },
  { name: 'Shadow field injection on class create', operation: 'create', path: 'classes/cls_1', payload: { classCode: 'CLS-09', name: '9th', section: 'A', isVerified: true }, expected: 'PERMISSION_DENIED' },
  { name: 'Oversized document ID poisoning', operation: 'create', path: `classes/${'a'.repeat(140)}`, expected: 'PERMISSION_DENIED' },
  { name: 'Cross-class student edit by teacher', operation: 'update', path: 'students/stu_cls8', auth: { uid: 'teacher_cls5' }, expected: 'PERMISSION_DENIED' },
  { name: 'Immutable studentCode tamper by teacher', operation: 'update', path: 'students/stu_1', payload: { studentCode: 'HACKED-001' }, expected: 'PERMISSION_DENIED' },
  { name: 'Silent attendance tamper by teacher', operation: 'update', path: 'attendance/att_1', auth: { uid: 'teacher_cls5' }, payload: { status: 'Present' }, expected: 'PERMISSION_DENIED' },
  { name: 'Teacher self-approving correction request', operation: 'update', path: 'correction_requests/cr_1', auth: { uid: 'teacher_cls5' }, payload: { status: 'approved' }, expected: 'PERMISSION_DENIED' },
  { name: 'Cross-user PII scrape on student private info', operation: 'get', path: 'students/stu_2/private/info', auth: { uid: 'parent_other' }, expected: 'PERMISSION_DENIED' },
  { name: 'Forged createdAt timestamp on audit log', operation: 'create', path: 'audit_logs/log_1', payload: { createdAt: '2020-01-01T00:00:00Z' }, expected: 'PERMISSION_DENIED' },
] as const;
