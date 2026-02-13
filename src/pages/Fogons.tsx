import React, { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, MoreHorizontal, Star, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getActiveHighlight,
  getBucketNames,
  getTasksByBucket,
  createTask,
  updateTask,
  updateBucketName,
  archiveTask,
  deleteTask,
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

const FogonsPage: React.FC = () => {
  const [refresh, setRefresh] = useState(0);
  const [addingTo, setAddingTo] = useState<Bucket | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [bucketNames, setBucketNames] = useState(getBucketNames);
  const [editingBucketName, setEditingBucketName] = useState<Bucket | null>(null);
  const [bucketNameDraft, setBucketNameDraft] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [highlightModal, setHighlightModal] = useState<{ open: boolean; task?: Task }>({ open: false });

  const tomorrowDate = getTomorrowDate();
  const activeHighlight = getActiveHighlight();
  const tomorrowHighlight = activeHighlight?.date === tomorrowDate ? activeHighlight : undefined;

  const doRefresh = () => {
    setBucketNames(getBucketNames());
    setRefresh(r => r + 1);
  };

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

  const startTaskEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const saveTaskEdit = (taskId: string) => {
    const title = editingTaskTitle.trim();
    if (!title) {
      cancelTaskEdit();
      return;
    }

    updateTask(taskId, { title });
    cancelTaskEdit();
    doRefresh();
    toast.success('Tarea actualizada');
  };

  const startBucketNameEdit = (bucket: Bucket) => {
    setEditingBucketName(bucket);
    setBucketNameDraft(bucketNames[bucket] ?? '');
  };

  const cancelBucketNameEdit = () => {
    setEditingBucketName(null);
    setBucketNameDraft('');
  };

  const saveBucketName = () => {
    if (!editingBucketName) return;
    const next = updateBucketName(editingBucketName, bucketNameDraft);
    setBucketNames(next);
    setEditingBucketName(null);
    setBucketNameDraft('');
  };

  const handleHighlightSave = useCallback(
    async (data: { date: string; title: string; time: string; durationMinutes: number; remindBeforeMinutes: number; taskId?: string }) => {
      await initializeCloudSync(true);

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
            <span>{BUCKET_LABELS[bucket]}</span>
            {bucketNames[bucket] && (
              <span className="text-muted-foreground font-medium text-xs">
                - {bucketNames[bucket]}
              </span>
            )}
            <span className="text-muted-foreground font-normal text-xs">({tasks.length})</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => startBucketNameEdit(bucket)}
              title="Renombrar fogon"
            >
              <Pencil size={14} />
            </Button>
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
        </div>

        {editingBucketName === bucket && (
          <div className="flex gap-2 mb-3">
            <Input
              value={bucketNameDraft}
              onChange={e => setBucketNameDraft(e.target.value)}
              placeholder="Nombre del fogon..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  saveBucketName();
                  return;
                }

                if (e.key === 'Escape') {
                  cancelBucketNameEdit();
                }
              }}
              onBlur={saveBucketName}
              autoFocus
              className="text-sm h-9"
            />
            <Button size="sm" onClick={saveBucketName} className="bg-primary h-9 px-3">
              OK
            </Button>
          </div>
        )}

        {addingTo === bucket && (
          <div className="flex gap-2 mb-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Nueva tarea..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleAddTask(bucket);
                  return;
                }

                if (e.key === 'Escape') {
                  setAddingTo(null);
                  setNewTitle('');
                }
              }}
              onBlur={() => {
                if (!newTitle.trim()) {
                  setAddingTo(null);
                  setNewTitle('');
                }
              }}
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
                disabled={editingTaskId === task.id}
                className="h-4 w-4"
              />

              {editingTaskId === task.id ? (
                <>
                  <Input
                    value={editingTaskTitle}
                    onChange={e => setEditingTaskTitle(e.target.value)}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        saveTaskEdit(task.id);
                        return;
                      }

                      if (e.key === 'Escape') {
                        cancelTaskEdit();
                      }
                    }}
                  />
                  <Button size="sm" className="h-8 px-2" onClick={() => saveTaskEdit(task.id)}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={cancelTaskEdit}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm leading-snug ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => setHighlightModal({ open: true, task })}
                    className="text-mt-yellow hover:scale-110 transition-transform flex-shrink-0 opacity-0 group-hover:opacity-100"
                    title="Hacer Highlight de manana"
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
                      <DropdownMenuItem onClick={() => startTaskEdit(task)}>
                        Editar
                      </DropdownMenuItem>
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
                </>
              )}
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
        {tomorrowHighlight && (
          <div className="highlight-banner flex items-center justify-between mb-4">
            <div className="text-sm">
              <span className="opacity-60">Manana: </span>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={{ minHeight: '65vh' }}>
          <div className="sm:row-span-2">
            {renderBucket('stove_main')}
          </div>
          <div>
            {renderBucket('stove_secondary')}
          </div>
          <div>
            {renderBucket('sink')}
          </div>
        </div>
      </div>

      <HighlightModal
        open={highlightModal.open}
        onClose={() => setHighlightModal({ open: false })}
        onSave={handleHighlightSave}
        initialTitle={highlightModal.task?.title ?? tomorrowHighlight?.title}
        initialTaskId={highlightModal.task?.id ?? tomorrowHighlight?.taskId}
        initialDate={tomorrowHighlight?.date ?? tomorrowDate}
        willReplaceExisting
      />
    </div>
  );
};

export default FogonsPage;
