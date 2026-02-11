import { Task, DailyHighlight, AppSettings, DEFAULT_SETTINGS, Bucket } from './types';
import { v4 as uuid } from 'uuid';

const KEYS = {
  tasks: 'mt_tasks',
  highlights: 'mt_highlights',
  settings: 'mt_settings',
};

// Tasks
export function getTasks(): Task[] {
  const raw = localStorage.getItem(KEYS.tasks);
  return raw ? JSON.parse(raw) : [];
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(KEYS.tasks, JSON.stringify(tasks));
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

// Highlights
export function getHighlights(): DailyHighlight[] {
  const raw = localStorage.getItem(KEYS.highlights);
  return raw ? JSON.parse(raw) : [];
}

export function saveHighlights(highlights: DailyHighlight[]) {
  localStorage.setItem(KEYS.highlights, JSON.stringify(highlights));
}

export function getHighlightByDate(date: string): DailyHighlight | undefined {
  return getHighlights().find(h => h.date === date);
}

export function getHighlightsRange(startDate: string, endDate: string): DailyHighlight[] {
  return getHighlights()
    .filter(h => h.date >= startDate && h.date <= endDate)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function upsertHighlight(data: Omit<DailyHighlight, 'id' | 'createdAt' | 'updatedAt'>): DailyHighlight {
  const highlights = getHighlights();
  const existing = highlights.findIndex(h => h.date === data.date);
  const now = new Date().toISOString();

  if (existing >= 0) {
    highlights[existing] = {
      ...highlights[existing],
      ...data,
      updatedAt: now,
    };
    saveHighlights(highlights);
    return highlights[existing];
  }

  const highlight: DailyHighlight = {
    ...data,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
  };
  highlights.push(highlight);
  saveHighlights(highlights);
  return highlight;
}

export function markHighlightDone(id: string) {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx >= 0) {
    highlights[idx].completedAt = new Date().toISOString();
    highlights[idx].updatedAt = new Date().toISOString();
    saveHighlights(highlights);
  }
}

export function updateHighlight(id: string, updates: Partial<DailyHighlight>): DailyHighlight | null {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === id);
  if (idx === -1) return null;
  highlights[idx] = { ...highlights[idx], ...updates, updatedAt: new Date().toISOString() };
  saveHighlights(highlights);
  return highlights[idx];
}

// Settings
export function getSettings(): AppSettings {
  const raw = localStorage.getItem(KEYS.settings);
  return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

// Export/Import
export function exportAllData(): string {
  return JSON.stringify({
    tasks: getTasks(),
    highlights: getHighlights(),
    settings: getSettings(),
  }, null, 2);
}

export function importAllData(json: string) {
  const data = JSON.parse(json);
  if (data.tasks) saveTasks(data.tasks);
  if (data.highlights) saveHighlights(data.highlights);
  if (data.settings) saveSettings(data.settings);
}

export function resetAllData() {
  localStorage.removeItem(KEYS.tasks);
  localStorage.removeItem(KEYS.highlights);
  localStorage.removeItem(KEYS.settings);
}
