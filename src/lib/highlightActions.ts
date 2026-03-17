import { toast } from 'sonner';
import { buildScheduledAt } from './dates';
import { initializeCloudSync, upsertHighlight, updateHighlight } from './storage';
import { getGoogleCalendarErrorMessage, hasGoogleCalendarClientId, syncHighlightToGoogleCalendar } from './googleCalendar';
import { DailyHighlight } from './types';

export interface HighlightSaveData {
  date: string;
  title: string;
  time: string;
  durationMinutes: number;
  remindBeforeMinutes: number;
  taskId?: string;
}

export async function saveHighlightWithSync(data: HighlightSaveData): Promise<DailyHighlight> {
  await initializeCloudSync(true);

  const savedHighlight = upsertHighlight({
    date: data.date,
    taskId: data.taskId,
    title: data.title,
    scheduledAt: buildScheduledAt(data.date, data.time),
    durationMinutes: data.durationMinutes,
    remindBeforeMinutes: data.remindBeforeMinutes,
  });

  if (hasGoogleCalendarClientId()) {
    try {
      const synced = await syncHighlightToGoogleCalendar(savedHighlight);
      updateHighlight(savedHighlight.id, {
        googleCalendarEventId: synced.eventId,
        googleCalendarEventLink: synced.eventLink,
      });
      toast.success('Highlight sincronizado con Google Calendar');
    } catch (error) {
      toast.error(`Highlight guardado, pero no se pudo sincronizar. ${getGoogleCalendarErrorMessage(error)}`);
    }
  }

  return savedHighlight;
}
