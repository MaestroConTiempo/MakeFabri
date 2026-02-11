import React, { useState, useCallback } from 'react';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { getHighlightByDate, upsertHighlight, updateHighlight } from '@/lib/storage';
import { getTomorrowDate, buildScheduledAt } from '@/lib/dates';
import { generateGoogleCalendarUrl, downloadICS } from '@/lib/calendar';
import { syncHighlightToGoogleCalendar, hasGoogleCalendarClientId, getGoogleCalendarErrorMessage } from '@/lib/googleCalendar';
import { Button } from '@/components/ui/button';
import { Calendar, Download, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const HighlightPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [, setRefresh] = useState(0);

  const tomorrowDate = getTomorrowDate();
  const highlight = getHighlightByDate(tomorrowDate);

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

  return (
    <div className="min-h-screen pb-24 flex flex-col">
      <WaveHeader
        title="Highlight"
        subtitle="¿Qué es lo más importante de mañana?"
      />

      <div className="px-6 pt-8 pb-4 animate-fade-in flex-1 flex flex-col justify-center">
        {highlight ? (
          <div className="post-it mb-6">
            <p className="text-xs font-medium opacity-60 mb-2">
              Mañana a las {format(new Date(highlight.scheduledAt), 'HH:mm')}
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
      />
    </div>
  );
};

export default HighlightPage;
