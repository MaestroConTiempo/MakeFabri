import React, { useState, useCallback, useEffect } from 'react';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { getHighlightByDate, upsertHighlight, updateHighlight, setHighlightCompletion, initializeCloudSync } from '@/lib/storage';
import { getTomorrowDate, getTodayDate, buildScheduledAt } from '@/lib/dates';
import { generateGoogleCalendarUrl, downloadICS } from '@/lib/calendar';
import { syncHighlightToGoogleCalendar, hasGoogleCalendarClientId, getGoogleCalendarErrorMessage } from '@/lib/googleCalendar';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const HighlightPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [, setRefresh] = useState(0);

  const todayDate = getTodayDate();
  const tomorrowDate = getTomorrowDate();
  const todayHighlight = getHighlightByDate(todayDate);
  const highlight = getHighlightByDate(tomorrowDate);

  useEffect(() => {
    let disposed = false;

    void initializeCloudSync(true).finally(() => {
      if (!disposed) setRefresh(r => r + 1);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const handleSave = useCallback(
    async (data: { title: string; time: string; durationMinutes: number; remindBeforeMinutes: number; taskId?: string }) => {
      const savedHighlight = upsertHighlight({
        date: tomorrowDate,
        taskId: data.taskId,
        title: data.title,
        scheduledAt: buildScheduledAt(tomorrowDate, data.time),
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

      setRefresh(r => r + 1);
    },
    [tomorrowDate]
  );

  const handleCompleteTodayHighlight = () => {
    if (!todayHighlight) return;
    setHighlightCompletion(todayHighlight.id, true);
    toast.success('Highlight de hoy marcado como completado');
    setRefresh(r => r + 1);
  };

  const handleCarryTodayToTomorrow = () => {
    if (!todayHighlight) return;

    const nextHighlight = upsertHighlight({
      date: tomorrowDate,
      taskId: todayHighlight.taskId,
      title: todayHighlight.title,
      scheduledAt: buildScheduledAt(tomorrowDate, format(new Date(todayHighlight.scheduledAt), 'HH:mm')),
      durationMinutes: todayHighlight.durationMinutes,
      remindBeforeMinutes: todayHighlight.remindBeforeMinutes,
    });

    if (todayHighlight.googleCalendarEventId || todayHighlight.googleCalendarEventLink) {
      updateHighlight(nextHighlight.id, {
        googleCalendarEventId: undefined,
        googleCalendarEventLink: undefined,
      });
    }

    toast.success('Highlight mantenido para mañana');
    setRefresh(r => r + 1);
  };

  return (
    <div className="min-h-screen pb-24 flex flex-col">
      <WaveHeader
        title="Highlight"
        subtitle="¿Qué es lo más importante de mañana?"
      />

      <div className="px-6 pt-8 pb-4 animate-fade-in flex-1 flex flex-col justify-center">
        {todayHighlight && !todayHighlight.completedAt && (
          <div className="highlight-banner mb-4">
            <p className="text-sm">
              Tienes un highlight pendiente de hoy: <strong>{todayHighlight.title}</strong>
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="flex-1" onClick={handleCompleteTodayHighlight}>
                Marcar completado
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={handleCarryTodayToTomorrow}>
                Mantener para mañana
              </Button>
            </div>
          </div>
        )}

        {highlight ? (
          <div className="post-it mb-6">
            <p className="text-xs font-medium opacity-60 mb-2">
              Mañana ({format(new Date(`${highlight.date}T00:00:00`), 'EEE d MMM')}) a las {format(new Date(highlight.scheduledAt), 'HH:mm')}
              {' · '}
              {highlight.durationMinutes} min
            </p>
            <p className="text-2xl font-bold font-display leading-tight">
              {highlight.title}
            </p>
            {highlight.completedAt && (
              <span className="inline-block mt-3 text-xs font-semibold bg-foreground/10 rounded-full px-3 py-1">
                ✅ Completado
              </span>
            )}
          </div>
        ) : (
          <div className="post-it-placeholder mb-6 flex items-center justify-center min-h-[120px]">
            <p className="text-lg font-display opacity-40">
              Elige el Highlight de mañana
            </p>
          </div>
        )}

        <Button
          onClick={() => setModalOpen(true)}
          className="w-full bg-secondary text-secondary-foreground font-semibold text-base py-6 hover:opacity-90"
        >
          {highlight ? "Cambiar Highlight" : "Establecer Highlight de mañana"}
        </Button>

        {highlight && (
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => window.open(highlight.googleCalendarEventLink || generateGoogleCalendarUrl(highlight), '_blank')}
            >
              <ExternalLink size={16} />
              Google Calendar
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => downloadICS(highlight)}
            >
              <Download size={16} />
              .ics
            </Button>
          </div>
        )}
      </div>

      <HighlightModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        willReplaceExisting
      />
    </div>
  );
};

export default HighlightPage;
