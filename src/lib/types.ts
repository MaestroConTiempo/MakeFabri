export type Bucket = 'stove_main' | 'stove_secondary' | 'sink';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'archived';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  bucket: Bucket;
  orderIndex: number;
  status: TaskStatus;
  estMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyHighlight {
  id: string;
  date: string; // YYYY-MM-DD
  taskId?: string;
  title: string;
  scheduledAt: string; // ISO
  durationMinutes: number;
  remindBeforeMinutes: number;
  googleCalendarEventId?: string;
  googleCalendarEventLink?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  timezone: string;
  defaultDurationMinutes: number;
  defaultRemindBeforeMinutes: number;
  defaultPlanHour: string; // HH:MM
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  stove_main: 'Fogón principal',
  stove_secondary: 'Fogón secundario',
  sink: 'Fregadero',
};

export const BUCKET_ICONS: Record<Bucket, string> = {
  stove_main: '🔥',
  stove_secondary: '🍳',
  sink: '🧹',
};

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: 'Europe/Madrid',
  defaultDurationMinutes: 60,
  defaultRemindBeforeMinutes: 30,
  defaultPlanHour: '20:30',
};
