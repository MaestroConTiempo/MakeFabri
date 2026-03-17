import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DailyHighlight } from '@/lib/types';

type ReviewStep = 'done-question' | 'keep-question' | 'bucket-select';

export interface BucketOption {
  id: string;
  name: string;
  icon: string;
}

interface HighlightReviewDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  highlight: DailyHighlight;
  title: string;
  step1Question: string;
  step2Question: string;
  keepButtonLabel: string;
  preventDismiss?: boolean;
  onDone: () => void;
  onKeep: () => void;
  onNotDone: () => void;
  /** If provided, shows a third option "Devolver tarea a su fogón" in the keep step */
  onReturnToFogon?: (bucketId: string) => void;
  availableBuckets?: BucketOption[];
}

const HighlightReviewDialog: React.FC<HighlightReviewDialogProps> = ({
  open,
  onOpenChange,
  highlight,
  title,
  step1Question,
  step2Question,
  keepButtonLabel,
  preventDismiss = false,
  onDone,
  onKeep,
  onNotDone,
  onReturnToFogon,
  availableBuckets,
}) => {
  const [step, setStep] = useState<ReviewStep>('done-question');

  useEffect(() => {
    if (open) setStep('done-question');
  }, [open, highlight.id]);

  const showReturnOption = Boolean(onReturnToFogon && availableBuckets && availableBuckets.length > 0);

  return (
    <Dialog open={open} onOpenChange={preventDismiss ? undefined : onOpenChange}>
      <DialogContent
        className="max-w-sm mx-auto"
        {...(preventDismiss
          ? {
              onEscapeKeyDown: (e) => e.preventDefault(),
              onInteractOutside: (e) => e.preventDefault(),
            }
          : {})}
      >
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>
            {highlight.title} ({format(new Date(highlight.scheduledAt), 'HH:mm')})
          </DialogDescription>
        </DialogHeader>

        {step === 'done-question' && (
          <div className="space-y-3">
            <p className="text-sm">{step1Question}</p>
            <Button className="w-full" onClick={onDone}>
              Si, lo realice
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep('keep-question')}>
              No lo realice
            </Button>
          </div>
        )}

        {step === 'keep-question' && (
          <div className="space-y-3">
            <p className="text-sm">{step2Question}</p>
            <Button className="w-full" onClick={onKeep}>
              {keepButtonLabel}
            </Button>
            <Button variant="outline" className="w-full" onClick={onNotDone}>
              Enviar a historial (no hecho)
            </Button>
            {showReturnOption && (
              <Button variant="outline" className="w-full" onClick={() => setStep('bucket-select')}>
                Devolver tarea a su fogon
              </Button>
            )}
          </div>
        )}

        {step === 'bucket-select' && (
          <div className="space-y-3">
            <p className="text-sm">A que fogon quieres devolver la tarea?</p>
            <div className="space-y-2">
              {availableBuckets!.map(b => (
                <Button
                  key={b.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => onReturnToFogon!(b.id)}
                >
                  <span>{b.icon}</span>
                  <span>{b.name}</span>
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setStep('keep-question')}
            >
              Volver
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HighlightReviewDialog;
