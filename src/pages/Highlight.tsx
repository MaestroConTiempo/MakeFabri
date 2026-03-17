import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import HighlightReviewDialog from '@/components/HighlightReviewDialog';
import { Button } from '@/components/ui/button';
import {
  getActiveHighlight,
  initializeCloudSync,
  markHighlightNotDone,
  setHighlightCompletion,
  updateHighlight,
} from '@/lib/storage';
import { buildScheduledAt, getTodayDate, getTomorrowDate } from '@/lib/dates';
import { downloadICS, generateGoogleCalendarUrl } from '@/lib/calendar';
import { saveHighlightWithSync, type HighlightSaveData } from '@/lib/highlightActions';

const HighlightPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [, setRefresh] = useState(0);

  const todayDate = getTodayDate();
  const tomorrowDate = getTomorrowDate();
  const highlight = getActiveHighlight();
  const isTodayHighlight = Boolean(highlight && highlight.date === todayDate);
  const isTomorrowHighlight = Boolean(highlight && highlight.date === tomorrowDate);

  useEffect(() => {
    // Re-render instantly when highlights change from any component (e.g. OverdueHighlightPrompt)
    const onHighlightsChanged = () => setRefresh(r => r + 1);
    window.addEventListener('mt:highlights-changed', onHighlightsChanged);
    return () => window.removeEventListener('mt:highlights-changed', onHighlightsChanged);
  }, []);

  useEffect(() => {
    let disposed = false;

    const syncHighlights = async () => {
      await initializeCloudSync(true);
      if (!disposed) setRefresh(r => r + 1);
    };

    void syncHighlights();
    const syncInterval = window.setInterval(() => {
      void syncHighlights();
    }, 15000);

    return () => {
      disposed = true;
      window.clearInterval(syncInterval);
    };
  }, []);

  const handleSave = useCallback(
    async (data: HighlightSaveData) => {
      await saveHighlightWithSync(data);
      setRefresh(r => r + 1);
    },
    []
  );

  const handleToggleCompletion = () => {
    if (!highlight || !isTodayHighlight) return;
    const completed = !highlight.completedAt;
    setHighlightCompletion(highlight.id, completed);
    toast.success(completed ? 'Highlight marcado como completado' : 'Highlight marcado como no completado');
    setRefresh(r => r + 1);
  };

  const openReviewDialog = () => {
    if (!highlight || !isTodayHighlight) return;
    setReviewOpen(true);
  };

  const handleDoneYes = () => {
    if (!highlight || !isTodayHighlight) return;
    setHighlightCompletion(highlight.id, true);
    toast.success('Perfecto. Se marco como realizado y quedo en el historial.');
    setReviewOpen(false);
    setRefresh(r => r + 1);
  };

  const handleKeepForTomorrow = () => {
    if (!highlight || !isTodayHighlight) return;
    const localTime = format(new Date(highlight.scheduledAt), 'HH:mm');

    updateHighlight(highlight.id, {
      date: tomorrowDate,
      scheduledAt: buildScheduledAt(tomorrowDate, localTime),
      completedAt: undefined,
    });

    toast.success('Highlight mantenido. Se movio para manana.');
    setReviewOpen(false);
    setRefresh(r => r + 1);
  };

  const handleSendToHistoryNotDone = () => {
    if (!highlight || !isTodayHighlight) return;
    markHighlightNotDone(highlight.id);
    toast.success('Se envio al historial como no realizado y la tarea volvio a su fogon.');
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
              {isTodayHighlight ? 'Hoy' : 'Manana'} a las {format(new Date(highlight.scheduledAt), 'HH:mm')} {' - '} {highlight.durationMinutes} min
            </p>
            <p className="text-2xl font-bold font-display leading-tight">{highlight.title}</p>
            {isTomorrowHighlight && (
              <span className="inline-block mt-3 text-xs font-semibold bg-foreground/10 rounded-full px-3 py-1">
                Pendiente para manana
              </span>
            )}
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
          {highlight ? 'Cambiar Highlight activo' : 'Establecer Highlight'}
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
        initialTitle={highlight?.title}
        initialTaskId={highlight?.taskId}
        initialDate={highlight?.date ?? todayDate}
        willReplaceExisting
      />

      {highlight && isTodayHighlight && (
        <HighlightReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          highlight={highlight}
          title="Estado del Highlight"
          step1Question="Lo realizaste ya?"
          step2Question="Quieres mantenerlo para manana o enviarlo al historial como no hecho?"
          keepButtonLabel="Mantener para manana"
          onDone={handleDoneYes}
          onKeep={handleKeepForTomorrow}
          onNotDone={handleSendToHistoryNotDone}
        />
      )}
    </div>
  );
};

export default HighlightPage;
