import React, { useState, useCallback, useEffect } from 'react';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getTasksByBucket,
  createTask,
  updateTask,
  archiveTask,
  deleteTask,
  getHighlightByDate,
  upsertHighlight,
  updateHighlight,
  initializeCloudSync,
} from '@/lib/storage';
import { getTomorrowDate, buildScheduledAt } from '@/lib/dates';
import { syncHighlightToGoogleCalendar, hasGoogleCalendarClientId, getGoogleCalendarErrorMessage } from '@/lib/googleCalendar';
import { Bucket, BUCKET_LABELS, BUCKET_ICONS, Task } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, MoreHorizontal, Star, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const BUCKETS: Bucket[] = ['stove_main', 'stove_secondary', 'sink'];

const FogonsPage: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const [addingTo, setAddingTo] = useState<Bucket | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [highlightModal, setHighlightModal] = useState<{ open: boolean; task?: Task }>({ open: false });

  const tomorrowDate = getTomorrowDate();
  const tomorrowHighlight = getHighlightByDate(tomorrowDate);

  const doRefresh = () => setRefresh(r => r + 1);

  useEffect(() => {
    let disposed = false;

    void initializeCloudSync(true).finally(() => {
      if (!disposed) doRefresh();
    });

    return () => {
      disposed = true;
    };
  }, []);

  const handleAddTask = (bucket: Bucket) => {
    if (!newTitle.trim()) {
      setAddingTo(null);
      setNewTitle('');
      return;
    }
    createTask(newTitle.trim(), bucket);
    setNewTitle('');
    setAddingTo(null);
    doRefresh();
  };

  const toggleTaskStatus = (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateTask(task.id, { status: newStatus });
    doRefresh();
  };

  const handleHighlightSave = useCallback(
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

      doRefresh();
    },
    []
  );
  const renderBucket = (bucket: Bucket) => {
    const tasks = getTasksByBucket(bucket);
    return (
      <div className="bucket-section h-full p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold font-display flex items-center gap-1.5">
            <span className="text-lg">{BUCKET_ICONS[bucket]}</span>
            {BUCKET_LABELS[bucket]}
            <span className="text-muted-foreground font-normal text-xs">({tasks.length})</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              setAddingTo(addingTo === bucket ? null : bucket);
              setNewTitle('');
            }}
          >
            <Plus size={18} />
          </Button>
        </div>

        {addingTo === bucket && (
          <div className="flex gap-2 mb-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Nueva tarea..."
              onKeyDown={e => e.key === 'Enter' && handleAddTask(bucket)}
              autoFocus
              className="text-sm h-9"
            />
            <Button size="sm" onClick={() => handleAddTask(bucket)} className="bg-primary h-9 px-3">
              <Plus size={16} />
            </Button>
          </div>
        )}

        {tasks.length === 0 && addingTo !== bucket && (
          <p className="text-xs text-muted-foreground text-center py-4">Sin tareas</p>
        )}

        <div className="space-y-1">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/50 group">
              <Checkbox
                checked={task.status === 'done'}
                onCheckedChange={() => toggleTaskStatus(task)}
                className="h-4 w-4"
              />
              <span className={`flex-1 text-sm leading-snug ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </span>
              <button
                onClick={() => setHighlightModal({ open: true, task })}
                className="text-mt-yellow hover:scale-110 transition-transform flex-shrink-0 opacity-0 group-hover:opacity-100"
                title="Hacer Highlight de mañana"
              >
                <Star size={16} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground flex-shrink-0 opacity-0 group-hover:opacity-100">
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { archiveTask(task.id); doRefresh(); }}>
                    Archivar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      deleteTask(task.id);
                      doRefresh();
                    }}
                  >
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-24">
      <WaveHeader title="Fogones" subtitle="Tus tareas organizadas" />

      <div className="px-4 pt-2 animate-fade-in">
        {/* Tomorrow's highlight banner */}
        {tomorrowHighlight && (
          <div className="highlight-banner flex items-center justify-between mb-4">
            <div className="text-sm">
              <span className="opacity-60">Mañana: </span>
              <strong>{tomorrowHighlight.title}</strong>
              <span className="opacity-60 ml-1">
                {format(new Date(tomorrowHighlight.scheduledAt), 'HH:mm')}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHighlightModal({ open: true })}
              className="text-xs"
            >
              <Pencil size={12} />
            </Button>
          </div>
        )}

        {/* 2-column layout: main left, secondary+sink right */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={{ minHeight: '65vh' }}>
          {/* Left column: Fogón principal (full height) */}
          <div className="sm:row-span-2">
            {renderBucket('stove_main')}
          </div>

          {/* Right top: Fogón secundario */}
          <div>
            {renderBucket('stove_secondary')}
          </div>

          {/* Right bottom: Fregadero */}
          <div>
            {renderBucket('sink')}
          </div>
        </div>
      </div>

      <HighlightModal
        open={highlightModal.open}
        onClose={() => setHighlightModal({ open: false })}
        onSave={handleHighlightSave}
        initialTitle={highlightModal.task?.title}
        initialTaskId={highlightModal.task?.id}
        willReplaceExisting
      />
    </div>
  );
};

export default FogonsPage;
