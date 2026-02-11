import React, { useState } from 'react';
import WaveHeader from '@/components/WaveHeader';
import { Button } from '@/components/ui/button';
import { getHighlightsRange, markHighlightDone } from '@/lib/storage';
import { format, subDays } from 'date-fns';
import { getTodayDate } from '@/lib/dates';
import { Check, CheckCircle } from 'lucide-react';

const FILTERS = [
  { label: '7 días', days: 7 },
  { label: '14 días', days: 14 },
  { label: '30 días', days: 30 },
];

const ReflectPage: React.FC = () => {
  const [days, setDays] = useState(14);
  const [refresh, setRefresh] = useState(0);

  const today = getTodayDate();
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const highlights = getHighlightsRange(startDate, today);

  const handleMarkDone = (id: string) => {
    markHighlightDone(id);
    setRefresh(r => r + 1);
  };

  return (
    <div className="min-h-screen pb-24">
      <WaveHeader title="Historial" subtitle="Revisa tus highlights" />

      <div className="px-6 pt-4 animate-fade-in">
        <div className="flex gap-2 mb-6">
          {FILTERS.map(f => (
            <Button
              key={f.days}
              variant={days === f.days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(f.days)}
              className={days === f.days ? 'bg-primary' : ''}
            >
              {f.label}
            </Button>
          ))}
        </div>

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
                  <CheckCircle size={24} className="text-primary flex-shrink-0 mt-1" />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMarkDone(h.id)}
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
