import {
  Task,
  DailyHighlight,
  AppSettings,
  DEFAULT_SETTINGS,
  Bucket,
  BucketNames,
  DEFAULT_BUCKET_NAMES,
} from './types';
import { v4 as uuid } from 'uuid';
import { hasSupabaseConfig, supabase } from './supabase';

const KEYS = {
  tasks: 'mt_tasks',
  highlights: 'mt_highlights',
  settings: 'mt_settings',
  bucketNames: 'mt_bucket_names',
};

const TABLES = {
  tasks: 'mt_tasks',
  highlights: 'mt_highlights',
  settings: 'mt_settings',
  bucketNames: 'mt_bucket_names',
};

const sharedTasksMode = import.meta.env.VITE_SUPABASE_SHARED_TASKS === 'true';
const sharedHighlightsMode = sharedTasksMode;
export const HIGHLIGHT_NOT_DONE_SENTINEL = '1970-01-01T00:00:00.000Z';

type CloudSyncStatus = 'disabled' | 'connecting' | 'ready' | 'error';

interface CloudSyncState {
  configured: boolean;
  status: CloudSyncStatus;
  message: string;
}

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  bucket: Bucket;
  order_index: number;
  status: string;
  est_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface HighlightRow {
  id: string;
  user_id: string;
  date: string;
  task_id: string | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  remind_before_minutes: number;
  google_calendar_event_id: string | null;
  google_calendar_event_link: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingsRow {
  user_id: string;
  timezone: string;
  default_duration_minutes: number;
  default_remind_before_minutes: number;
  default_plan_hour: string;
  updated_at: string;
}

interface BucketNamesRow {
  id: string;
  stove_main_name: string;
  stove_secondary_name: string;
  sink_name: string;
  updated_at: string;
}

const SHARED_BUCKET_NAMES_ROW_ID = 'global';

let cloudSyncStatus: CloudSyncStatus = hasSupabaseConfig() ? 'connecting' : 'disabled';
let cloudSyncMessage = hasSupabaseConfig()
  ? 'Sincronizacion con Supabase pendiente'
  : 'Supabase no configurado';

let cloudSyncInitialized = false;
let cloudWriteQueue: Promise<void> = Promise.resolve();
let suppressCloudWrites = false;
let cachedCloudUserId: string | null = null;
let cloudUserPromise: Promise<string | null> | null = null;

function setCloudSyncStatus(status: CloudSyncStatus, message: string) {
  cloudSyncStatus = status;
  cloudSyncMessage = message;
}

export function getCloudSyncState(): CloudSyncState {
  return {
    configured: hasSupabaseConfig(),
    status: cloudSyncStatus,
    message: cloudSyncMessage,
  };
}

function readJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeTasksLocal(tasks: Task[]) {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
}

function writeHighlightsLocal(highlights: DailyHighlight[]) {
  localStorage.setItem(KEYS.highlights, JSON.stringify(highlights));
}

function writeSettingsLocal(settings: AppSettings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

function writeBucketNamesLocal(bucketNames: BucketNames) {
  localStorage.setItem(KEYS.bucketNames, JSON.stringify(bucketNames));
}

function isDefaultSettings(settings: AppSettings): boolean {
  return settings.timezone === DEFAULT_SETTINGS.timezone
    && settings.defaultDurationMinutes === DEFAULT_SETTINGS.defaultDurationMinutes
    && settings.defaultRemindBeforeMinutes === DEFAULT_SETTINGS.defaultRemindBeforeMinutes
    && settings.defaultPlanHour === DEFAULT_SETTINGS.defaultPlanHour;
}

function isDefaultBucketNames(bucketNames: BucketNames): boolean {
  return bucketNames.stove_main.trim() === ''
    && bucketNames.stove_secondary.trim() === ''
    && bucketNames.sink.trim() === '';
}

function toTaskRow(task: Task, userId: string): TaskRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes ?? null,
    bucket: task.bucket,
    order_index: task.orderIndex,
    status: task.status,
    est_minutes: task.estMinutes ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function fromTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    bucket: row.bucket,
    orderIndex: row.order_index,
    status: row.status as Task['status'],
    estMinutes: row.est_minutes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toHighlightRow(highlight: DailyHighlight, userId: string): HighlightRow {
  return {
    id: highlight.id,
    user_id: userId,
    date: highlight.date,
    task_id: highlight.taskId ?? null,
    title: highlight.title,
    scheduled_at: highlight.scheduledAt,
    duration_minutes: highlight.durationMinutes,
    remind_before_minutes: highlight.remindBeforeMinutes,
    google_calendar_event_id: highlight.googleCalendarEventId ?? null,
    google_calendar_event_link: highlight.googleCalendarEventLink ?? null,
    completed_at: highlight.completedAt ?? null,
    created_at: highlight.createdAt,
    updated_at: highlight.updatedAt,
  };
}

function fromHighlightRow(row: HighlightRow): DailyHighlight {
  return {
    id: row.id,
    date: row.date,
    taskId: row.task_id ?? undefined,
    title: row.title,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    remindBeforeMinutes: row.remind_before_minutes,
    googleCalendarEventId: row.google_calendar_event_id ?? undefined,
    googleCalendarEventLink: row.google_calendar_event_link ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isHighlightMoreRecent(next: DailyHighlight, current: DailyHighlight): boolean {
  const nextUpdated = parseTimestamp(next.updatedAt);
  const currentUpdated = parseTimestamp(current.updatedAt);
  if (nextUpdated !== currentUpdated) return nextUpdated > currentUpdated;
  return next.createdAt > current.createdAt;
}

export function isHighlightDone(highlight: DailyHighlight): boolean {
  return Boolean(highlight.completedAt && highlight.completedAt !== HIGHLIGHT_NOT_DONE_SENTINEL);
}

export function isHighlightNotDone(highlight: DailyHighlight): boolean {
  return highlight.completedAt === HIGHLIGHT_NOT_DONE_SENTINEL;
}

export function isHighlightActive(highlight: DailyHighlight): boolean {
  return !highlight.completedAt;
}

function pickMostRecentHighlight(highlights: DailyHighlight[]): DailyHighlight | undefined {
  let winner: DailyHighlight | undefined;

  for (const highlight of highlights) {
    if (!winner || isHighlightMoreRecent(highlight, winner)) {
      winner = highlight;
    }
  }

  return winner;
}

function enforceSingleActiveHighlight(highlights: DailyHighlight[]): DailyHighlight[] {
  const activeHighlights = highlights.filter(isHighlightActive);
  if (activeHighlights.length <= 1) return highlights;

  const keepActive = pickMostRecentHighlight(activeHighlights);
  if (!keepActive) return highlights;

  return highlights.map(highlight => {
    if (!isHighlightActive(highlight) || highlight.id === keepActive.id) return highlight;
    return {
      ...highlight,
      completedAt: HIGHLIGHT_NOT_DONE_SENTINEL,
    };
  });
}

function normalizeHighlights(highlights: DailyHighlight[]): DailyHighlight[] {
  const byId = new Map<string, DailyHighlight>();

  for (const highlight of highlights) {
    const current = byId.get(highlight.id);
    if (!current || isHighlightMoreRecent(highlight, current)) {
      byId.set(highlight.id, highlight);
    }
  }

  return [...byId.values()].sort((a, b) => {
    const activeDelta = Number(isHighlightActive(b)) - Number(isHighlightActive(a));
    if (activeDelta !== 0) return activeDelta;

    if (a.date !== b.date) return b.date.localeCompare(a.date);

    const aUpdated = parseTimestamp(a.updatedAt);
    const bUpdated = parseTimestamp(b.updatedAt);
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    return b.createdAt.localeCompare(a.createdAt);
  });
}

function toSettingsRow(settings: AppSettings, userId: string): SettingsRow {
  return {
    user_id: userId,
    timezone: settings.timezone,
    default_duration_minutes: settings.defaultDurationMinutes,
    default_remind_before_minutes: settings.defaultRemindBeforeMinutes,
    default_plan_hour: settings.defaultPlanHour,
    updated_at: new Date().toISOString(),
  };
}

function fromSettingsRow(row: SettingsRow): AppSettings {
  return {
    timezone: row.timezone,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultRemindBeforeMinutes: row.default_remind_before_minutes,
    defaultPlanHour: row.default_plan_hour,
  };
}

function toBucketNamesRow(bucketNames: BucketNames): BucketNamesRow {
  return {
    id: SHARED_BUCKET_NAMES_ROW_ID,
    stove_main_name: bucketNames.stove_main,
    stove_secondary_name: bucketNames.stove_secondary,
    sink_name: bucketNames.sink,
    updated_at: new Date().toISOString(),
  };
}

function fromBucketNamesRow(row: BucketNamesRow): BucketNames {
  return {
    stove_main: row.stove_main_name || '',
    stove_secondary: row.stove_secondary_name || '',
    sink: row.sink_name || '',
  };
}

function isBucketNamesTableMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  return code === '42P01' || message.includes(TABLES.bucketNames);
}

function enqueueCloudWrite(op: () => Promise<void>) {
  if (!hasSupabaseConfig() || !supabase || suppressCloudWrites) return;

  cloudWriteQueue = cloudWriteQueue
    .then(async () => {
      await op();
      setCloudSyncStatus('ready', 'Datos sincronizados con Supabase');
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      setCloudSyncStatus('error', 'Error al sincronizar con Supabase: ' + detail);
    });
}

async function ensureCloudUserId(): Promise<string | null> {
  if (!hasSupabaseConfig() || !supabase) return null;
  if (cachedCloudUserId) return cachedCloudUserId;
  if (cloudUserPromise) return cloudUserPromise;

  setCloudSyncStatus('connecting', 'Conectando con Supabase...');

  cloudUserPromise = (async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Supabase getUser error:', userError.message);
      }

      if (userData.user) {
        cachedCloudUserId = userData.user.id;
        setCloudSyncStatus('ready', 'Sesion anonima de Supabase activa');
        return cachedCloudUserId;
      }

      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError || !anonData.user) {
        const detail = anonError?.message ?? 'Supabase no devolvio usuario en signInAnonymously';
        setCloudSyncStatus('error', 'No se pudo crear la sesion anonima de Supabase: ' + detail);
        return null;
      }

      cachedCloudUserId = anonData.user.id;
      setCloudSyncStatus('ready', 'Sesion anonima de Supabase activa');
      return cachedCloudUserId;
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      setCloudSyncStatus('error', 'No se pudo crear la sesion anonima de Supabase: ' + detail);
      return null;
    }
  })().finally(() => {
    cloudUserPromise = null;
  });

  return cloudUserPromise;
}

async function pushTasksToCloud(userId: string, tasks: Task[]) {
  if (!supabase) return;
  const rows = tasks.map(task => toTaskRow(task, userId));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from(TABLES.tasks)
      .upsert(rows, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  // In shared mode we do not prune stale rows here to avoid deleting
  // tasks created by another device that has not synced yet.
  if (sharedTasksMode) return;

  const { data: remoteRows, error: remoteError } = await supabase
    .from(TABLES.tasks)
    .select('id')
    .eq('user_id', userId);

  if (remoteError) throw remoteError;

  const localIds = new Set(tasks.map(task => task.id));
  const staleIds = (remoteRows || [])
    .map(row => row.id as string)
    .filter(id => !localIds.has(id));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(TABLES.tasks)
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds);
    if (deleteError) throw deleteError;
  }
}

async function pushHighlightsToCloud(userId: string, highlights: DailyHighlight[]) {
  if (!supabase) return;
  const rows = highlights.map(highlight => toHighlightRow(highlight, userId));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from(TABLES.highlights)
      .upsert(rows, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  // In shared mode we avoid stale pruning to prevent one device
  // from deleting highlights created/updated by another one.
  if (sharedHighlightsMode) return;

  const { data: remoteRows, error: remoteError } = await supabase
    .from(TABLES.highlights)
    .select('id')
    .eq('user_id', userId);

  if (remoteError) throw remoteError;

  const localIds = new Set(highlights.map(highlight => highlight.id));
  const staleIds = (remoteRows || [])
    .map(row => row.id as string)
    .filter(id => !localIds.has(id));

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from(TABLES.highlights)
      .delete()
      .eq('user_id', userId)
      .in('id', staleIds);
    if (deleteError) throw deleteError;
  }
}

async function pushSettingsToCloud(userId: string, settings: AppSettings) {
  if (!supabase) return;

  const { error: upsertError } = await supabase
    .from(TABLES.settings)
    .upsert(toSettingsRow(settings, userId), { onConflict: 'user_id' });

  if (upsertError) throw upsertError;
}

async function pushBucketNamesToCloud(bucketNames: BucketNames) {
  if (!supabase) return;

  const { error: upsertError } = await supabase
    .from(TABLES.bucketNames)
    .upsert(toBucketNamesRow(bucketNames), { onConflict: 'id' });

  if (upsertError) {
    if (isBucketNamesTableMissing(upsertError)) return;
    throw upsertError;
  }
}

async function fetchBucketNamesFromCloud(): Promise<BucketNames | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(TABLES.bucketNames)
    .select('*')
    .eq('id', SHARED_BUCKET_NAMES_ROW_ID)
    .maybeSingle();

  if (error) {
    if (isBucketNamesTableMissing(error)) return null;
    throw error;
  }

  if (!data) return null;
  return fromBucketNamesRow(data as BucketNamesRow);
}

async function deleteTaskFromCloud(userId: string, id: string) {
  if (!supabase) return;

  let query = supabase
    .from(TABLES.tasks)
    .delete()
    .eq('id', id);

  if (!sharedTasksMode) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) throw error;
}

async function deleteHighlightFromCloud(userId: string, id: string) {
  if (!supabase) return;

  let query = supabase
    .from(TABLES.highlights)
    .delete()
    .eq('id', id);

  if (!sharedHighlightsMode) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) throw error;
}

async function removeAllFromCloud(userId: string) {
  if (!supabase) return;

  const tasksDeleteQuery = sharedTasksMode
    ? supabase.from(TABLES.tasks).delete().not('id', 'is', null)
    : supabase.from(TABLES.tasks).delete().eq('user_id', userId);

  const highlightsDeleteQuery = sharedHighlightsMode
    ? supabase.from(TABLES.highlights).delete().not('id', 'is', null)
    : supabase.from(TABLES.highlights).delete().eq('user_id', userId);

  const [tasksDelete, highlightsDelete, settingsDelete] = await Promise.all([
    tasksDeleteQuery,
    highlightsDeleteQuery,
    supabase.from(TABLES.settings).delete().eq('user_id', userId),
  ]);

  const { error: bucketNamesDeleteError } = await supabase
    .from(TABLES.bucketNames)
    .delete()
    .eq('id', SHARED_BUCKET_NAMES_ROW_ID);

  if (tasksDelete.error) throw tasksDelete.error;
  if (highlightsDelete.error) throw highlightsDelete.error;
  if (settingsDelete.error) throw settingsDelete.error;
  if (bucketNamesDeleteError && !isBucketNamesTableMissing(bucketNamesDeleteError)) {
    throw bucketNamesDeleteError;
  }
}

function nextBucketOrderIndex(tasks: Task[], bucket: Bucket, excludeTaskId?: string): number {
  return tasks
    .filter(task => task.bucket === bucket)
    .filter(task => task.status !== 'archived')
    .filter(task => task.id !== excludeTaskId)
    .length;
}

function archiveTaskForHighlight(tasks: Task[], taskId: string): boolean {
  const idx = tasks.findIndex(task => task.id === taskId);
  if (idx === -1) return false;

  const task = tasks[idx];
  if (task.status === 'archived') return false;

  tasks[idx] = {
    ...task,
    status: 'archived',
    updatedAt: new Date().toISOString(),
  };

  return true;
}

function restoreTaskFromHighlight(tasks: Task[], taskId: string): boolean {
  const idx = tasks.findIndex(task => task.id === taskId);
  if (idx === -1) return false;

  const task = tasks[idx];
  const orderIndex = nextBucketOrderIndex(tasks, task.bucket, task.id);
  const shouldRestore = task.status === 'archived' || task.status !== 'todo' || task.orderIndex !== orderIndex;
  if (!shouldRestore) return false;

  tasks[idx] = {
    ...task,
    status: 'todo',
    orderIndex,
    updatedAt: new Date().toISOString(),
  };

  return true;
}

// Tasks
export function getTasks(): Task[] {
  return readJSON<Task[]>(KEYS.tasks, []);
}

export function saveTasks(tasks: Task[]) {
  writeTasksLocal(tasks);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await pushTasksToCloud(userId, tasks);
  });
}

export function getTasksByBucket(bucket: Bucket): Task[] {
  return getTasks()
    .filter(t => t.bucket === bucket && t.status !== 'archived')
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function createTask(title: string, bucket: Bucket): Task {
  const tasks = getTasks();
  const bucketTasks = tasks.filter(t => t.bucket === bucket);
  const now = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    title,
    bucket,
    orderIndex: bucketTasks.length,
    status: 'todo',
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() };
  saveTasks(tasks);
  return tasks[idx];
}

export function archiveTask(id: string) {
  updateTask(id, { status: 'archived' });
}

export function deleteTask(id: string): boolean {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;

  tasks.splice(idx, 1);
  saveTasks(tasks);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await deleteTaskFromCloud(userId, id);
  });

  return true;
}

// Highlights
export function getHighlights(): DailyHighlight[] {
  const highlights = readJSON<DailyHighlight[]>(KEYS.highlights, []);
  return enforceSingleActiveHighlight(normalizeHighlights(highlights));
}

export function saveHighlights(highlights: DailyHighlight[]) {
  const normalized = enforceSingleActiveHighlight(normalizeHighlights(highlights));
  writeHighlightsLocal(normalized);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await pushHighlightsToCloud(userId, normalized);
  });
}

export function getHighlightByDate(date: string): DailyHighlight | undefined {
  return getHighlights().find(h => h.date === date && isHighlightActive(h));
}

export function getActiveHighlight(): DailyHighlight | undefined {
  return pickMostRecentHighlight(getHighlights().filter(isHighlightActive));
}

export function getHighlightsRange(startDate: string, endDate: string): DailyHighlight[] {
  return getHighlights()
    .filter(h => h.date >= startDate && h.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function upsertHighlight(data: Omit<DailyHighlight, 'id' | 'createdAt' | 'updatedAt'>): DailyHighlight {
  const highlights = getHighlights();
  const now = new Date().toISOString();
  const activeHighlights = highlights.filter(isHighlightActive);
  const activeHighlight = pickMostRecentHighlight(activeHighlights);

  const tasks = getTasks();
  let tasksChanged = false;

  if (activeHighlight?.taskId && activeHighlight.taskId !== data.taskId) {
    tasksChanged = restoreTaskFromHighlight(tasks, activeHighlight.taskId) || tasksChanged;
  }

  if (data.taskId && data.taskId !== activeHighlight?.taskId) {
    tasksChanged = archiveTaskForHighlight(tasks, data.taskId) || tasksChanged;
  }

  if (tasksChanged) {
    saveTasks(tasks);
  }

  const sanitizedHighlights = highlights.map(highlight => {
    if (!isHighlightActive(highlight)) return highlight;
    if (activeHighlight && highlight.id === activeHighlight.id) return highlight;

    return {
      ...highlight,
      completedAt: HIGHLIGHT_NOT_DONE_SENTINEL,
      updatedAt: now,
    };
  });

  if (activeHighlight) {
    const idx = sanitizedHighlights.findIndex(h => h.id === activeHighlight.id);
    sanitizedHighlights[idx] = {
      ...sanitizedHighlights[idx],
      ...data,
      completedAt: undefined,
      updatedAt: now,
    };

    saveHighlights(sanitizedHighlights);
    return sanitizedHighlights[idx];
  }

  const highlight: DailyHighlight = {
    ...data,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
  };

  sanitizedHighlights.push(highlight);
  saveHighlights(sanitizedHighlights);
  return highlight;
}

export function createHighlight(data: Omit<DailyHighlight, 'id' | 'createdAt' | 'updatedAt'>): DailyHighlight {
  return upsertHighlight(data);
}

export function markHighlightDone(id: string) {
  setHighlightCompletion(id, true);
}

export function setHighlightCompletion(id: string, completed: boolean): DailyHighlight | null {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();

  if (completed) {
    highlights[idx] = {
      ...highlights[idx],
      completedAt: now,
      updatedAt: now,
    };

    saveHighlights(highlights);

    if (highlights[idx].taskId) {
      const tasks = getTasks();
      const archived = archiveTaskForHighlight(tasks, highlights[idx].taskId);
      if (archived) {
        saveTasks(tasks);
      }
    }

    return highlights[idx];
  }

  const anotherActiveExists = highlights.some(h => h.id !== id && isHighlightActive(h));
  highlights[idx] = {
    ...highlights[idx],
    completedAt: anotherActiveExists ? HIGHLIGHT_NOT_DONE_SENTINEL : undefined,
    updatedAt: now,
  };

  saveHighlights(highlights);
  return highlights[idx];
}

export function markHighlightNotDone(id: string): DailyHighlight | null {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  highlights[idx] = {
    ...highlights[idx],
    completedAt: HIGHLIGHT_NOT_DONE_SENTINEL,
    updatedAt: now,
  };
  saveHighlights(highlights);

  if (highlights[idx].taskId) {
    const tasks = getTasks();
    const restored = restoreTaskFromHighlight(tasks, highlights[idx].taskId);
    if (restored) {
      saveTasks(tasks);
    }
  }

  return highlights[idx];
}

export function updateHighlight(id: string, updates: Partial<DailyHighlight>): DailyHighlight | null {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx === -1) return null;
  highlights[idx] = { ...highlights[idx], ...updates, updatedAt: new Date().toISOString() };
  saveHighlights(highlights);
  return highlights[idx];
}

export function deleteHighlight(id: string): boolean {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx === -1) return false;
  const highlight = highlights[idx];

  if (highlight.taskId && !isHighlightDone(highlight)) {
    const tasks = getTasks();
    const restored = restoreTaskFromHighlight(tasks, highlight.taskId);
    if (restored) {
      saveTasks(tasks);
    }
  }

  highlights.splice(idx, 1);
  saveHighlights(highlights);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await deleteHighlightFromCloud(userId, id);
  });

  return true;
}

// Settings
export function getSettings(): AppSettings {
  const raw = readJSON<Partial<AppSettings> | null>(KEYS.settings, null);
  return raw ? { ...DEFAULT_SETTINGS, ...raw } : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings) {
  writeSettingsLocal(settings);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await pushSettingsToCloud(userId, settings);
  });
}

// Bucket names
export function getBucketNames(): BucketNames {
  const raw = readJSON<Partial<BucketNames> | null>(KEYS.bucketNames, null);
  return raw ? { ...DEFAULT_BUCKET_NAMES, ...raw } : { ...DEFAULT_BUCKET_NAMES };
}

export function saveBucketNames(bucketNames: BucketNames) {
  const normalized = { ...DEFAULT_BUCKET_NAMES, ...bucketNames };
  writeBucketNamesLocal(normalized);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await pushBucketNamesToCloud(normalized);
  });
}

export function updateBucketName(bucket: Bucket, name: string): BucketNames {
  const next = {
    ...getBucketNames(),
    [bucket]: name.trim(),
  };
  saveBucketNames(next);
  return next;
}

// Cloud bootstrap
export async function initializeCloudSync(force = false) {
  if (cloudSyncInitialized && !force) return;
  cloudSyncInitialized = true;

  if (!hasSupabaseConfig() || !supabase) {
    setCloudSyncStatus('disabled', 'Supabase no configurado');
    return;
  }

  const userId = await ensureCloudUserId();
  if (!userId) return;

  try {
    const tasksQuery = supabase
      .from(TABLES.tasks)
      .select('*')
      .order('order_index', { ascending: true });

    const highlightsQuery = supabase
      .from(TABLES.highlights)
      .select('*')
      .order('date', { ascending: false });

    const scopedTasksQuery = sharedTasksMode
      ? tasksQuery
      : tasksQuery.eq('user_id', userId);

    const scopedHighlightsQuery = sharedHighlightsMode
      ? highlightsQuery
      : highlightsQuery.eq('user_id', userId);

    const [tasksResult, highlightsResult, settingsResult] = await Promise.all([
      scopedTasksQuery,
      scopedHighlightsQuery,
      supabase
        .from(TABLES.settings)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (tasksResult.error) throw tasksResult.error;
    if (highlightsResult.error) throw highlightsResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const remoteTasks = (tasksResult.data || []).map(row => fromTaskRow(row as TaskRow));
    const remoteHighlights = (highlightsResult.data || []).map(row => fromHighlightRow(row as HighlightRow));
    const remoteSettings = settingsResult.data ? fromSettingsRow(settingsResult.data as SettingsRow) : null;
    const remoteBucketNames = await fetchBucketNamesFromCloud();

    const remoteHasData = remoteTasks.length > 0 || remoteHighlights.length > 0 || Boolean(remoteSettings);
    const localTasks = getTasks();
    const localHighlights = enforceSingleActiveHighlight(getHighlights());
    const localSettings = getSettings();
    const localBucketNames = getBucketNames();
    const localHasBucketNames = !isDefaultBucketNames(localBucketNames);
    const localHasData = localTasks.length > 0 || localHighlights.length > 0 || !isDefaultSettings(localSettings);

    suppressCloudWrites = true;

    if (remoteHasData) {
      writeTasksLocal(remoteTasks);
      writeHighlightsLocal(enforceSingleActiveHighlight(normalizeHighlights(remoteHighlights)));
      writeSettingsLocal(remoteSettings || { ...DEFAULT_SETTINGS });
    } else if (localHasData) {
      await Promise.all([
        pushTasksToCloud(userId, localTasks),
        pushHighlightsToCloud(userId, localHighlights),
        pushSettingsToCloud(userId, localSettings),
      ]);
    }

    if (remoteBucketNames) {
      writeBucketNamesLocal(remoteBucketNames);
    } else if (localHasBucketNames) {
      await pushBucketNamesToCloud(localBucketNames);
    } else {
      writeBucketNamesLocal({ ...DEFAULT_BUCKET_NAMES });
    }

    setCloudSyncStatus('ready', 'Sincronizacion con Supabase activa');
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    setCloudSyncStatus('error', 'No se pudo inicializar la sincronizacion con Supabase: ' + detail);
  } finally {
    suppressCloudWrites = false;
  }
}

// Export/Import
export function exportAllData(): string {
  return JSON.stringify({
    tasks: getTasks(),
    highlights: getHighlights(),
    settings: getSettings(),
    bucketNames: getBucketNames(),
  }, null, 2);
}

export function importAllData(json: string) {
  const data = JSON.parse(json);
  if (data.tasks) saveTasks(data.tasks);
  if (data.highlights) saveHighlights(data.highlights);
  if (data.settings) saveSettings(data.settings);
  if (data.bucketNames) saveBucketNames(data.bucketNames);
}

export function resetAllData() {
  localStorage.removeItem(KEYS.tasks);
  localStorage.removeItem(KEYS.highlights);
  localStorage.removeItem(KEYS.settings);
  localStorage.removeItem(KEYS.bucketNames);

  enqueueCloudWrite(async () => {
    const userId = await ensureCloudUserId();
    if (!userId) return;
    await removeAllFromCloud(userId);
  });
}
