import React, { useState, useEffect } from 'react';
import WaveHeader from '@/components/WaveHeader';
import { Button } from '@/components/ui/button';
import { getHighlights, setHighlightCompletion, initializeCloudSync } from '@/lib/storage';
import { format } from 'date-fns';
import { getTodayDate } from '@/lib/dates';
import { Check, RotateCcw } from 'lucide-react';

const ReflectPage: React.FC = () => {
  const [refresh, setRefresh] = useState(0);

  const today = getTodayDate();
  const highlights = getHighlights().filter(h => h.date <= today);

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

  return (
    <div className="min-h-screen pb-24">
      <WaveHeader title="Historial" subtitle="Revisa tus highlights" />

      <div className="px-6 pt-4 animate-fade-in">
        <p className="text-sm text-muted-foreground mb-6">
          Se muestran todos los highlights pasados (completados o pendientes).
        </p>

        {highlights.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Sin highlights en este período</p>
          </div>
        ) : (
          <div className="space-y-3">
            {highlights.map(h => (
              <div
                key={h.id}
                className={`bucket-section flex items-start gap-4 ${h.completedAt ? 'opacity-70' : ''}`}
              >
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">
                    {format(new Date(h.date + 'T00:00:00'), 'EEE d MMM')}
                    {' · '}
                    {format(new Date(h.scheduledAt), 'HH:mm')}
                    {' · '}
                    {h.durationMinutes} min
                  </p>
                  <p className={`font-semibold font-display ${h.completedAt ? 'line-through' : ''}`}>
                    {h.title}
                  </p>
                </div>
                {h.completedAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetCompletion(h.id, false)}
                    className="flex-shrink-0 gap-1"
                  >
                    <RotateCcw size={14} />
                    No hecho
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetCompletion(h.id, true)}
                    className="flex-shrink-0 gap-1"
                  >
                    <Check size={14} />
                    Hecho
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReflectPage;
