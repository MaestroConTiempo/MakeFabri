import React, { useEffect, useState } from 'react';
import WaveHeader from '@/components/WaveHeader';
import { Button } from '@/components/ui/button';
import {
  deleteHighlight,
  getHighlightsRange,
  initializeCloudSync,
  setHighlightCompletion,
} from '@/lib/storage';
import { getReviewedHighlightIds, unmarkHighlightReviewed } from '@/lib/highlightReview';
import { format, subDays } from 'date-fns';
import { getTodayDate } from '@/lib/dates';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const FILTERS = [
  { label: '7 dias', days: 7 },
  { label: '14 dias', days: 14 },
  { label: '30 dias', days: 30 },
];
const ReflectPage: React.FC = () => {
  const [days, setDays] = useState(14);
  const [refresh, setRefresh] = useState(0);

  const today = getTodayDate();
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const highlights = getHighlightsRange(startDate, today);
  const reviewedHighlightIds = getReviewedHighlightIds();
  const visibleHighlights = highlights.filter(h => reviewedHighlightIds.has(h.id));

  useEffect(() => {
    let disposed = false;

    void initializeCloudSync(true).finally(() => {
      if (!disposed) setRefresh(r => r + 1);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const handleSetCompletion = (id: string, completed: boolean) => {
    setHighlightCompletion(id, completed);
    setRefresh(r => r + 1);
  };

  const handleDeleteHighlight = (id: string) => {
    const confirmed = window.confirm('Eliminar este highlight del historial? Tambien se eliminara en Supabase.');
    if (!confirmed) return;

    const deleted = deleteHighlight(id);
    if (!deleted) {
      toast.error('No se pudo eliminar el highlight.');
      return;
    }

    unmarkHighlightReviewed(id);
    toast.success('Highlight eliminado.', { duration: 1800 });
    setRefresh(r => r + 1);
  };

  return (
    <div className="min-h-screen pb-24">
      <WaveHeader
        title="Historial"
        subtitle="Revisa tus highlights"
        containerClassName="md:pb-16"
        titleClassName="md:text-5xl"
        subtitleClassName="md:text-base md:mt-2"
      />

      <div className="px-6 pt-4 animate-fade-in">
        <div className="flex gap-2 mb-6">
          {FILTERS.map(f => (
            <Button
              key={f.days}
              variant={days === f.days ? 'default' : 'outline'}
              onClick={() => setDays(f.days)}
              className={`h-9 px-4 text-sm md:h-11 md:px-5 md:text-base ${days === f.days ? 'bg-primary' : ''}`}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {visibleHighlights.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Sin highlights en este periodo</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleHighlights.map(h => (
              <div
                key={h.id}
                className={`bucket-section flex items-start gap-4 ${h.completedAt ? 'opacity-70' : ''}`}
              >
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">
                    {format(new Date(h.date + 'T00:00:00'), 'EEE d MMM')}
                    {' - '}
                    {format(new Date(h.scheduledAt), 'HH:mm')}
                    {' - '}
                    {h.durationMinutes} min
                  </p>
                  <p className={`font-semibold font-display ${h.completedAt ? 'line-through' : ''}`}>
                    {h.title}
                  </p>
                </div>
                <div className="flex-shrink-0 flex gap-2">
                  {h.completedAt ? (
                    <Button
                      variant="outline"
                      onClick={() => handleSetCompletion(h.id, false)}
                      className="h-9 px-3 text-sm md:h-11 md:px-4 md:text-base gap-1"
                    >
                      <RotateCcw className="h-4 w-4 md:h-5 md:w-5" />
                      No hecho
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleSetCompletion(h.id, true)}
                      className="h-9 px-3 text-sm md:h-11 md:px-4 md:text-base gap-1"
                    >
                      <Check className="h-4 w-4 md:h-5 md:w-5" />
                      Hecho
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleDeleteHighlight(h.id)}
                    className="h-9 px-3 text-sm md:h-11 md:px-4 md:text-base gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReflectPage;
