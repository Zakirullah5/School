export interface PktTimeInfo {
  date: string; // YYYY-MM-DD in Asia/Karachi
  time: string; // HH:MM:SS in Asia/Karachi
  hour: number;
  minute: number;
  second: number;
  isAttendanceWindowOpen: boolean;
  windowStatus: 'before_open' | 'open' | 'locked_after';
  windowMessage: string;
  serverTimestampMs: number;
}

export function getPktTimeInfo(now: Date = new Date()): PktTimeInfo {
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
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const rawHour = Number(map.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(map.minute);
  const second = Number(map.second);
  const date = `${map.year}-${map.month}-${map.day}`;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;

  // Strictly 08:00 AM to 11:59 AM PKT (08:00:00 through 11:59:59)
  const totalMinutes = hour * 60 + minute;
  const openMinutes = 8 * 60;
  const closeMinutes = 11 * 60 + 59;

  let windowStatus: PktTimeInfo['windowStatus'] = 'open';
  let isAttendanceWindowOpen = true;
  let windowMessage = 'Attendance submission window is open (08:00 AM – 11:59 AM PKT).';

  if (totalMinutes < openMinutes) {
    windowStatus = 'before_open';
    isAttendanceWindowOpen = false;
    windowMessage = 'Attendance submission opens at 08:00 AM PKT.';
  } else if (totalMinutes > closeMinutes) {
    windowStatus = 'locked_after';
    isAttendanceWindowOpen = false;
    windowMessage = 'Attendance submission locked after 11:59 AM PKT.';
  }

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

export function getPktDateDaysAgo(daysAgo: number): string {
  const target = new Date(Date.now() - daysAgo * 86400 * 1000);
  return getPktTimeInfo(target).date;
}

export function getPktDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
