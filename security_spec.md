# Security Specification — Abdali Education Academy Firestore

## 1. Data Invariants
1. **Verified Identity Gate**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
2. **No Self-Assigned Privileges**: A user cannot create or update `/admins/{uid}` or set `role: 'principal' | 'teacher' | 'student'` on `/user_profiles/{uid}` unless authorized by an existing Principal Admin (`isAdmin()`) or a matching Principal-issued `/email_invites/{inviteId}` record.
3. **Immutable Student ID & Non-Deletion**: Teachers can edit permitted student metadata (`fullName`, `fatherName`, `dob`, `gender`, `rollNumber`, `parentName`, `photoUrl`, `updatedAt`) for their assigned class ONLY, must preserve `studentCode`, and cannot delete student records.
4. **Immutable Submitted Attendance**: Teachers cannot update or delete `/attendance/{attendanceId}` or `/attendance_submissions/{submissionId}` once created. Corrections require creating a `pending` `/correction_requests/{requestId}` document reviewed exclusively by Principal.
5. **PII Isolation**: Emails, phone numbers, and parent mobile numbers are isolated in `/user_private/{uid}`, `/teachers/{teacherId}/private/{docId}`, and `/students/{studentId}/private/{docId}`, readable only by the owner, assigned teacher, or Principal.
6. **Temporal Integrity & Path Hardening**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and `createdAt`/`updatedAt` timestamps must match `request.time`.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read**: `getDoc('/students/stu-1')` with `auth = null`.
2. **Unverified email write**: `setDoc('/user_profiles/u1', ...)` with `email_verified = false`.
3. **Admin self-escalation**: Non-admin user creating `/admins/u1` with own UID.
4. **Role self-escalation**: Non-admin user updating `/user_profiles/u1` with `{ role: 'principal' }`.
5. **Shadow field injection**: Creating `/classes/c1` with extra ghost field `{ isVerified: true }`.
6. **ID poisoning**: Creating `/classes/${'x'.repeat(200)}` (path ID > 128 chars or invalid chars).
7. **Cross-class student mutation**: Teacher of `cls-05` updating a student in `cls-08`.
8. **Student ID mutation**: Teacher updating `/students/stu-1` changing `studentCode`.
9. **Silent attendance tampering**: Teacher updating `/attendance/att-1` status from `'Absent'` to `'Present'`.
10. **Correction state shortcutting**: Teacher approving their own `/correction_requests/cr-1` (`status: 'approved'`).
11. **PII blanket scrape**: Student or unrelated parent reading `/students/stu-2/private/info`.
12. **Client timestamp forgery**: Creating `/audit_logs/log-1` with `{ createdAt: new Date('2020-01-01') }` instead of `serverTimestamp()`.
