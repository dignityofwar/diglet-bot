export const friendlyDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = date.toLocaleString('default', { month: 'short' }).toUpperCase(); // Get short month name in uppercase
  const yy = String(date.getFullYear()).slice(-2); // Get last two digits of the year
  return `${dd}-${mm}-${yy}`;
};

export const generateDateInPast = (daysAgo: number): Date => {
  const now = new Date();
  // Subtract daysAgo (which may be fractional) in milliseconds
  const newTime = now.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(newTime);
};
