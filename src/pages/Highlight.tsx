import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getHighlightByDate,
  initializeCloudSync,
  setHighlightCompletion,
  updateHighlight,
  upsertHighlight,
} from '@/lib/storage';
import { buildScheduledAt, getTodayDate, getTomorrowDate } from '@/lib/dates';
import { downloadICS, generateGoogleCalendarUrl } from '@/lib/calendar';
import {
  getGoogleCalendarErrorMessage,
  hasGoogleCalendarClientId,
  syncHighlightToGoogleCalendar,
} from '@/lib/googleCalendar';
import { isHighlightReviewed, markHighlightReviewed } from '@/lib/highlightReview';

type ReviewStep = 'done-question' | 'keep-question';

const HighlightPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStep, setReviewStep] = useState<ReviewStep>('done-question');
  const [, setRefresh] = useState(0);

  const todayDate = getTodayDate();
  const tomorrowDate = getTomorrowDate();
  const todayHighlight = getHighlightByDate(todayDate);
  const tomorrowHighlight = getHighlightByDate(tomorrowDate);
  const highlight = todayHighlight ?? tomorrowHighlight;
  const isTodayHighlight = Boolean(todayHighlight && highlight?.id === todayHighlight.id);
  const highlightReviewed = highlight ? isHighlightReviewed(highlight.id) : false;

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
    async (data: { date: string; title: string; time: string; durationMinutes: number; remindBeforeMinutes: number; taskId?: string }) => {
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

      setRefresh(r => r + 1);
    },
    []
  );

  const handleToggleCompletion = () => {
    if (!highlight || !isTodayHighlight) return;
    const completed = !highlight.completedAt;
    setHighlightCompletion(highlight.id, completed);
    if (completed) markHighlightReviewed(highlight.id);
    toast.success(completed ? 'Highlight marcado como completado' : 'Highlight marcado como no completado');
    setRefresh(r => r + 1);
  };

  const openReviewDialog = () => {
    if (!highlight || !isTodayHighlight) return;
    setReviewStep('done-question');
    setReviewOpen(true);
  };

  const handleDoneYes = () => {
    if (!highlight || !isTodayHighlight) return;
    setHighlightCompletion(highlight.id, true);
    markHighlightReviewed(highlight.id);
    toast.success('Perfecto. Se marco como realizado y quedo en el historial.');
    setReviewOpen(false);
    setRefresh(r => r + 1);
  };

  const handleDoneNo = () => {
    setReviewStep('keep-question');
  };

  const handleKeepForTomorrow = () => {
    if (!highlight || !isTodayHighlight) return;
    const localTime = format(new Date(highlight.scheduledAt), 'HH:mm');

    updateHighlight(highlight.id, {
      date: tomorrowDate,
      scheduledAt: buildScheduledAt(tomorrowDate, localTime),
    });

    toast.success('Highlight mantenido. Se movio para manana.');
    setReviewOpen(false);
    setRefresh(r => r + 1);
  };

  const handleSendToHistoryNotDone = () => {
    if (!highlight || !isTodayHighlight) return;
    markHighlightReviewed(highlight.id);
    toast.success('Se envio al historial como no realizado.');
    setReviewOpen(false);
    setRefresh(r => r + 1);
  };

  return (
    <div className="min-h-screen pb-24 flex flex-col">
      <WaveHeader title="Highlight" subtitle="Que es lo mas importante de hoy?" />

      <div className="w-full max-w-md mx-auto px-6 pt-8 pb-4 animate-fade-in flex-1 flex flex-col justify-center">
        {highlight ? (
          <button
            type="button"
            className="post-it mb-6 text-left w-full"
            onClick={openReviewDialog}
            disabled={!isTodayHighlight}
          >
            <p className="text-xs font-medium opacity-60 mb-2">
              {isTodayHighlight ? 'Hoy' : 'Manana'} a las {format(new Date(highlight.scheduledAt), 'HH:mm')} {' · '} {highlight.durationMinutes} min
            </p>
            <p className="text-2xl font-bold font-display leading-tight">{highlight.title}</p>
            {highlight.completedAt && isTodayHighlight ? (
              <span className="inline-block mt-3 text-xs font-semibold bg-foreground/10 rounded-full px-3 py-1">
                Completado
              </span>
            ) : highlightReviewed && isTodayHighlight ? (
              <span className="inline-block mt-3 text-xs font-semibold bg-foreground/10 rounded-full px-3 py-1">
                Revisado (no hecho)
              </span>
            ) : !isTodayHighlight ? (
              <span className="inline-block mt-3 text-xs font-semibold bg-foreground/10 rounded-full px-3 py-1">
                Pendiente para manana
              </span>
            ) : null}
          </button>
        ) : (
          <div className="post-it-placeholder mb-6 flex items-center justify-center min-h-[120px]">
            <p className="text-lg font-display opacity-40">Elige el Highlight de hoy</p>
          </div>
        )}

        <Button
          onClick={() => setModalOpen(true)}
          className="w-full bg-secondary text-secondary-foreground font-semibold text-base py-6 hover:opacity-90"
        >
          {highlight ? 'Cambiar Highlight' : 'Establecer Highlight de hoy'}
        </Button>

        {highlight && isTodayHighlight && (
          <Button
            variant={highlight.completedAt ? 'outline' : 'default'}
            className="w-full mt-3"
            onClick={handleToggleCompletion}
          >
            {highlight.completedAt ? 'Marcar como no completado' : 'Marcar como completado'}
          </Button>
        )}

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
            <Button variant="outline" className="flex-1 gap-2" onClick={() => downloadICS(highlight)}>
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
        initialDate={highlight?.date ?? todayDate}
        willReplaceExisting
      />

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Estado del Highlight</DialogTitle>
            {highlight && (
              <DialogDescription>
                {highlight.title} ({format(new Date(highlight.scheduledAt), 'HH:mm')})
              </DialogDescription>
            )}
          </DialogHeader>

          {reviewStep === 'done-question' ? (
            <div className="space-y-3">
              <p className="text-sm">Lo realizaste ya?</p>
              <Button className="w-full" onClick={handleDoneYes}>
                Si, lo realice
              </Button>
              <Button variant="outline" className="w-full" onClick={handleDoneNo}>
                No lo realice
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">Quieres mantenerlo para manana o enviarlo al historial como no hecho?</p>
              <Button className="w-full" onClick={handleKeepForTomorrow}>
                Mantener para manana
              </Button>
              <Button variant="outline" className="w-full" onClick={handleSendToHistoryNotDone}>
                Enviar a historial (no hecho)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HighlightPage;
