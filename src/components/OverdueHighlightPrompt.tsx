import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import HighlightReviewDialog from '@/components/HighlightReviewDialog';
import { buildScheduledAt, getTomorrowDate } from '@/lib/dates';
import {
  getActiveHighlight,
  getBucketConfigs,
  getBucketNames,
  markHighlightNotDone,
  returnHighlightTaskToFogon,
  setHighlightCompletion,
  updateHighlight,
} from '@/lib/storage';
import { BUCKET_LABELS } from '@/lib/types';

const OverdueHighlightPrompt: React.FC = () => {
  const [, setRefresh] = useState(0);

  const overdueHighlight = (() => {
    const now = Date.now();
    const activeHighlight = getActiveHighlight();
    if (!activeHighlight) return undefined;
    return Date.parse(activeHighlight.scheduledAt) <= now ? activeHighlight : undefined;
  })();

  const open = Boolean(overdueHighlight);

  const closePrompt = () => {
    setRefresh(r => r + 1);
  };

  const handleDoneYes = () => {
    if (!overdueHighlight) return;
    setHighlightCompletion(overdueHighlight.id, true);
    toast.success('Perfecto. Se marco como realizado y quedo en el historial.');
    closePrompt();
  };

  const handleKeep = () => {
    if (!overdueHighlight) return;
    const tomorrowDate = getTomorrowDate();
    const localTime = format(new Date(overdueHighlight.scheduledAt), 'HH:mm');

    updateHighlight(overdueHighlight.id, {
      date: tomorrowDate,
      scheduledAt: buildScheduledAt(tomorrowDate, localTime),
    });

    toast.success('Highlight mantenido. Se reprogramo para manana.');
    closePrompt();
  };

  const handleSendToHistoryNotDone = () => {
    if (!overdueHighlight) return;
    markHighlightNotDone(overdueHighlight.id);
    toast.success('Se envio al historial como no realizado y la tarea volvio a su fogon.');
    closePrompt();
  };

  const handleReturnToFogon = (bucketId: string) => {
    if (!overdueHighlight) return;
    returnHighlightTaskToFogon(overdueHighlight.id, bucketId);
    toast.success('Tarea devuelta al fogon.');
    closePrompt();
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefresh(r => r + 1);
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  if (!overdueHighlight) return null;

  const hasTask = Boolean(overdueHighlight.taskId);
  const bucketConfigs = hasTask ? getBucketConfigs() : [];
  const bucketNames = hasTask ? getBucketNames() : {};
  const availableBuckets = hasTask
    ? bucketConfigs.map(c => ({
        id: c.id,
        name: bucketNames[c.id] || BUCKET_LABELS[c.id] || c.id,
        icon: c.icon,
      }))
    : undefined;

  return (
    <HighlightReviewDialog
      open={open}
      highlight={overdueHighlight}
      title="Highlight vencido"
      step1Question="Ya paso la hora planificada. Lo realizaste?"
      step2Question="Quieres mantenerlo o enviarlo al historial como no hecho?"
      keepButtonLabel="Mantener highlight"
      preventDismiss
      onDone={handleDoneYes}
      onKeep={handleKeep}
      onNotDone={handleSendToHistoryNotDone}
      onReturnToFogon={hasTask ? handleReturnToFogon : undefined}
      availableBuckets={availableBuckets}
    />
  );
};

export default OverdueHighlightPrompt;
