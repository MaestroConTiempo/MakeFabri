import { format, addDays } from 'date-fns';

export function getTomorrowDate(): string {
  return format(addDays(new Date(), 1), 'yyyy-MM-dd');
}

export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return format(d, 'EEEE, d MMMM');
}

export function buildScheduledAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}
