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

export const generateDateInPast = (daysAgo: number): Date => {
  const now = new Date();
  // Subtract daysAgo (which may be fractional) in milliseconds
  const newTime = now.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(newTime);
};