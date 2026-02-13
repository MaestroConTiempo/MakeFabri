import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { buildScheduledAt, getTomorrowDate } from '@/lib/dates';
import { getActiveHighlight, markHighlightNotDone, setHighlightCompletion, updateHighlight } from '@/lib/storage';
import { DailyHighlight } from '@/lib/types';
import { format } from 'date-fns';
import { toast } from 'sonner';

type Step = 'done-question' | 'keep-question';

const OverdueHighlightPrompt: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const [step, setStep] = useState<Step>('done-question');

  const overdueHighlight = (() => {
    const now = Date.now();
    const activeHighlight = getActiveHighlight();
    if (!activeHighlight) return undefined;
    return Date.parse(activeHighlight.scheduledAt) <= now ? activeHighlight : undefined;
  })();

  const open = Boolean(overdueHighlight);

  const closePrompt = useCallback(() => {
    setStep('done-question');
    setRefresh(r => r + 1);
  }, []);

  const handleDoneYes = useCallback((highlight: DailyHighlight) => {
    setHighlightCompletion(highlight.id, true);
    toast.success('Perfecto. Se marco como realizado y quedo en el historial.');
    closePrompt();
  }, [closePrompt]);

  const handleDoneNo = useCallback(() => {
    setStep('keep-question');
  }, []);

  const handleKeep = useCallback((highlight: DailyHighlight) => {
    const tomorrowDate = getTomorrowDate();
    const localTime = format(new Date(highlight.scheduledAt), 'HH:mm');

    updateHighlight(highlight.id, {
      date: tomorrowDate,
      scheduledAt: buildScheduledAt(tomorrowDate, localTime),
    });

    toast.success('Highlight mantenido. Se reprogramo para manana.');
    closePrompt();
  }, [closePrompt]);

  const handleSendToHistoryNotDone = useCallback((highlight: DailyHighlight) => {
    markHighlightNotDone(highlight.id);
    toast.success('Se envio al historial como no realizado y la tarea volvio a su fogon.');
    closePrompt();
  }, [closePrompt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefresh(r => r + 1);
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (open) setStep('done-question');
  }, [open, overdueHighlight?.id]);

  if (!overdueHighlight) return null;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm mx-auto" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-display">Highlight vencido</DialogTitle>
          <DialogDescription>
            {overdueHighlight.title} ({format(new Date(overdueHighlight.scheduledAt), 'HH:mm')})
          </DialogDescription>
        </DialogHeader>

        {step === 'done-question' ? (
          <div className="space-y-3">
            <p className="text-sm">Ya paso la hora planificada. Lo realizaste?</p>
            <Button className="w-full" onClick={() => handleDoneYes(overdueHighlight)}>
              Si, lo realice
            </Button>
            <Button variant="outline" className="w-full" onClick={handleDoneNo}>
              No lo realice
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Quieres mantenerlo o enviarlo al historial como no hecho?</p>
            <Button className="w-full" onClick={() => handleKeep(overdueHighlight)}>
              Mantener highlight
            </Button>
            <Button variant="outline" className="w-full" onClick={() => handleSendToHistoryNotDone(overdueHighlight)}>
              Enviar a historial (no hecho)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OverdueHighlightPrompt;
