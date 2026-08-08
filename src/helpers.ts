export const friendlyDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = date.toLocaleString('default', { month: 'short' }).toUpperCase(); // Get short month name in uppercase
  const yy = String(date.getFullYear()).slice(-2); // Get last two digits of the year
  return `${dd}-${mm}-${yy}`;
};

// UTC, not local. MikroORM runs with forceUtcTimezone, so local-midnight keys would split a
// single day into two rows across a DST boundary.
export const utcMidnight = (date: Date = new Date()): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

// Discord renders these client side, so relative stamps stay correct without editing the message
export const discordTime = (date: Date, format: 'f' | 'F' | 'D' | 'R' = 'f'): string =>
  `<t:${Math.floor(date.getTime() / 1000)}:${format}>`;

export const friendlyDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

// The daily average behind a total, in hours. A total on its own says nothing about pace - two
// hours is a lot over a week and nothing at all over a year - so it is reported alongside the
// same way messages are. Hours rather than minutes to match how the total is written.
export const hoursPerDay = (minutes: number, days: number): string =>
  `${(minutes / 60 / Math.max(1, days)).toFixed(1)}h/day`;

// Shared by the rank up ballot and /activity so the same ratio always reads the same way
export const activityBand = (activeDays: number, trackedDays: number): string => {
  if (trackedDays <= 0) {
    return '🔴 Low';
  }

  const ratio = activeDays / trackedDays;

  if (ratio >= 0.75) return '🟢 Very active';
  if (ratio >= 0.5) return '🟡 Active';
  if (ratio >= 0.25) return '🟠 Occasional';
  return '🔴 Low';
};

export const generateDateInPast = (daysAgo: number): Date => {
  const now = new Date();
  // Subtract daysAgo (which may be fractional) in milliseconds
  const newTime = now.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(newTime);
};