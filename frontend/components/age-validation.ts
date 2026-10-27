// Use UTC calendar dates to match backend validation. February 29 birthdays
// reach the next age on March 1 in non-leap years.
export function adultBirthDateLimit(today = new Date()): string {
  const year = today.getUTCFullYear() - 18;
  const month = today.getUTCMonth();
  const day = Math.min(today.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function birthDateError(value: string, today = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter your date of birth.';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value.startsWith('0000')) return 'Enter a valid date of birth.';
  return value > adultBirthDateLimit(today) ? 'You must be at least 18 years old to register.' : null;
}
