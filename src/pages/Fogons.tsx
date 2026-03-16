import React, { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { GripVertical, MoreHorizontal, Pencil, Plus, Star } from 'lucide-react';
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
  moveTask,
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
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

const BUCKETS: Bucket[] = ['stove_main', 'stove_secondary', 'sink'];

const getBucketContainerId = (bucket: Bucket) => `bucket:${bucket}`;

type BucketDropData = {
  type: 'bucket';
  bucket: Bucket;
};

type TaskDropData = {
  type: 'task';
  bucket: Bucket;
  taskId: string;
};

interface SortableTaskItemProps {
  task: Task;
  dragDisabled: boolean;
  isEditing: boolean;
  editingTaskTitle: string;
  onEditingTaskTitleChange: (value: string) => void;
  onToggleTaskStatus: (task: Task) => void;
  onSaveTaskEdit: (taskId: string) => void;
  onCancelTaskEdit: () => void;
  onStartTaskEdit: (task: Task) => void;
  onOpenHighlight: (task: Task) => void;
  onArchiveTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const SortableTaskItem: React.FC<SortableTaskItemProps> = ({
  task,
  dragDisabled,
  isEditing,
  editingTaskTitle,
  onEditingTaskTitleChange,
  onToggleTaskStatus,
  onSaveTaskEdit,
  onCancelTaskEdit,
  onStartTaskEdit,
  onOpenHighlight,
  onArchiveTask,
  onDeleteTask,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled || isEditing,
    data: {
      type: 'task',
      bucket: task.bucket,
      taskId: task.id,
    } satisfies TaskDropData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 rounded-lg border border-transparent py-2 px-2 transition-colors',
        isEditing ? 'bg-muted/40' : 'hover:bg-muted/50',
        isDragging && 'opacity-40 shadow-sm'
      )}
    >
      <button
        type="button"
        className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
          dragDisabled || isEditing ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:text-foreground active:cursor-grabbing'
        )}
        title="Arrastrar tarea"
        aria-label={`Arrastrar ${task.title}`}
        disabled={dragDisabled || isEditing}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <Checkbox
        checked={task.status === 'done'}
        onCheckedChange={() => onToggleTaskStatus(task)}
        disabled={isEditing}
        className="h-4 w-4"
      />

      {isEditing ? (
        <>
          <Input
            value={editingTaskTitle}
            onChange={e => onEditingTaskTitleChange(e.target.value)}
            className="h-8 flex-1 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onSaveTaskEdit(task.id);
                return;
              }

              if (e.key === 'Escape') {
                onCancelTaskEdit();
              }
            }}
          />
          <Button size="sm" className="h-8 px-2" onClick={() => onSaveTaskEdit(task.id)}>
            Guardar
          </Button>
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={onCancelTaskEdit}>
            Cancelar
          </Button>
        </>
      ) : (
        <>
          <span className={cn('flex-1 text-sm leading-snug', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </span>
          <button
            type="button"
            onClick={() => onOpenHighlight(task)}
            className="flex-shrink-0 text-mt-yellow opacity-0 transition group-hover:opacity-100 hover:scale-110"
            title="Hacer Highlight de manana"
          >
            <Star size={16} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex-shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onStartTaskEdit(task)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchiveTask(task.id)}>
                Archivar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDeleteTask(task.id)}
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
};

interface BucketColumnProps {
  bucket: Bucket;
  tasks: Task[];
  bucketName: string;
  addingTo: Bucket | null;
  newTitle: string;
  editingBucketName: Bucket | null;
  bucketNameDraft: string;
  activeTaskId: string | null;
  dragDisabled: boolean;
  editingTaskId: string | null;
  editingTaskTitle: string;
  onAddBucketToggle: (bucket: Bucket) => void;
  onNewTitleChange: (value: string) => void;
  onHandleAddTask: (bucket: Bucket) => void;
  onCancelAddTask: () => void;
  onStartBucketNameEdit: (bucket: Bucket) => void;
  onBucketNameDraftChange: (value: string) => void;
  onSaveBucketName: () => void;
  onCancelBucketNameEdit: () => void;
  onEditingTaskTitleChange: (value: string) => void;
  onToggleTaskStatus: (task: Task) => void;
  onSaveTaskEdit: (taskId: string) => void;
  onCancelTaskEdit: () => void;
  onStartTaskEdit: (task: Task) => void;
  onOpenHighlight: (task: Task) => void;
  onArchiveTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const BucketColumn: React.FC<BucketColumnProps> = ({
  bucket,
  tasks,
  bucketName,
  addingTo,
  newTitle,
  editingBucketName,
  bucketNameDraft,
  activeTaskId,
  dragDisabled,
  editingTaskId,
  editingTaskTitle,
  onAddBucketToggle,
  onNewTitleChange,
  onHandleAddTask,
  onCancelAddTask,
  onStartBucketNameEdit,
  onBucketNameDraftChange,
  onSaveBucketName,
  onCancelBucketNameEdit,
  onEditingTaskTitleChange,
  onToggleTaskStatus,
  onSaveTaskEdit,
  onCancelTaskEdit,
  onStartTaskEdit,
  onOpenHighlight,
  onArchiveTask,
  onDeleteTask,
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: getBucketContainerId(bucket),
    data: {
      type: 'bucket',
      bucket,
    } satisfies BucketDropData,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bucket-section h-full p-4 transition-colors',
        activeTaskId && isOver && 'border-primary bg-primary/10'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold font-display">
          <span className="text-lg">{BUCKET_ICONS[bucket]}</span>
          <span>{BUCKET_LABELS[bucket]}</span>
          {bucketName && (
            <span className="text-xs font-medium text-muted-foreground">
              - {bucketName}
            </span>
          )}
          <span className="text-xs font-normal text-muted-foreground">({tasks.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onStartBucketNameEdit(bucket)}
            title="Renombrar fogon"
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onAddBucketToggle(bucket)}
          >
            <Plus size={18} />
          </Button>
        </div>
      </div>

      {editingBucketName === bucket && (
        <div className="mb-3 flex gap-2">
          <Input
            value={bucketNameDraft}
            onChange={e => onBucketNameDraftChange(e.target.value)}
            placeholder="Nombre del fogon..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onSaveBucketName();
                return;
              }

              if (e.key === 'Escape') {
                onCancelBucketNameEdit();
              }
            }}
            onBlur={onSaveBucketName}
            autoFocus
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={onSaveBucketName} className="h-9 bg-primary px-3">
            OK
          </Button>
        </div>
      )}

      {addingTo === bucket && (
        <div className="mb-3 flex gap-2">
          <Input
            value={newTitle}
            onChange={e => onNewTitleChange(e.target.value)}
            placeholder="Nueva tarea..."
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onHandleAddTask(bucket);
                return;
              }

              if (e.key === 'Escape') {
                onCancelAddTask();
              }
            }}
            onBlur={() => {
              if (!newTitle.trim()) {
                onCancelAddTask();
              }
            }}
            autoFocus
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={() => onHandleAddTask(bucket)} className="h-9 bg-primary px-3">
            <Plus size={16} />
          </Button>
        </div>
      )}

      <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-8 space-y-1">
          {tasks.length === 0 && addingTo !== bucket ? (
            <div
              className={cn(
                'rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors',
                activeTaskId && isOver && 'border-primary bg-background text-foreground'
              )}
            >
              {activeTaskId ? 'Suelta aqui una tarea' : 'Sin tareas'}
            </div>
          ) : (
            tasks.map(task => (
              <SortableTaskItem
                key={task.id}
                task={task}
                dragDisabled={dragDisabled}
                isEditing={editingTaskId === task.id}
                editingTaskTitle={editingTaskTitle}
                onEditingTaskTitleChange={onEditingTaskTitleChange}
                onToggleTaskStatus={onToggleTaskStatus}
                onSaveTaskEdit={onSaveTaskEdit}
                onCancelTaskEdit={onCancelTaskEdit}
                onStartTaskEdit={onStartTaskEdit}
                onOpenHighlight={onOpenHighlight}
                onArchiveTask={onArchiveTask}
                onDeleteTask={onDeleteTask}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};

const FogonsPage: React.FC = () => {
  const [, setRefresh] = useState(0);
  const [addingTo, setAddingTo] = useState<Bucket | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [bucketNames, setBucketNames] = useState(getBucketNames);
  const [editingBucketName, setEditingBucketName] = useState<Bucket | null>(null);
  const [bucketNameDraft, setBucketNameDraft] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [highlightModal, setHighlightModal] = useState<{ open: boolean; task?: Task }>({ open: false });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const tomorrowDate = getTomorrowDate();
  const activeHighlight = getActiveHighlight();
  const tomorrowHighlight = activeHighlight?.date === tomorrowDate ? activeHighlight : undefined;
  const tasksByBucket: Record<Bucket, Task[]> = {
    stove_main: getTasksByBucket('stove_main'),
    stove_secondary: getTasksByBucket('stove_secondary'),
    sink: getTasksByBucket('sink'),
  };
  const visibleTasks = BUCKETS.flatMap(bucket => tasksByBucket[bucket]);
  const activeTask = activeTaskId ? visibleTasks.find(task => task.id === activeTaskId) : undefined;
  const dragDisabled = Boolean(editingTaskId) || addingTo !== null || editingBucketName !== null;

  const doRefresh = () => {
    setBucketNames(getBucketNames());
    setRefresh(value => value + 1);
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

  const cancelAddTask = () => {
    setAddingTo(null);
    setNewTitle('');
  };

  const toggleAddTaskInput = (bucket: Bucket) => {
    setAddingTo(addingTo === bucket ? null : bucket);
    setNewTitle('');
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

  const openHighlightModal = (task: Task) => {
    setHighlightModal({ open: true, task });
  };

  const handleArchiveTask = (taskId: string) => {
    archiveTask(taskId);
    doRefresh();
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId);
    doRefresh();
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

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTaskId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTaskId(null);

    if (!over) return;

    const movedTaskId = String(active.id);
    const currentTask = visibleTasks.find(task => task.id === movedTaskId);
    if (!currentTask) return;

    const overData = over.data.current as BucketDropData | TaskDropData | undefined;
    let targetBucket: Bucket | null = null;
    let targetIndex = 0;

    if (overData?.type === 'bucket') {
      targetBucket = overData.bucket;
      targetIndex = tasksByBucket[targetBucket].length;
    } else if (overData?.type === 'task') {
      targetBucket = overData.bucket;
      targetIndex = tasksByBucket[targetBucket].findIndex(task => task.id === overData.taskId);
      if (targetIndex === -1) {
        targetIndex = tasksByBucket[targetBucket].length;
      }
    } else {
      return;
    }

    const movedTask = moveTask(movedTaskId, targetBucket, targetIndex);
    if (!movedTask) return;

    doRefresh();

    if (currentTask.bucket !== targetBucket) {
      toast.success(`Tarea movida a ${BUCKET_LABELS[targetBucket]}`);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <WaveHeader title="Fogones" subtitle="Tus tareas organizadas" />

      <div className="animate-fade-in px-4 pt-2">
        {tomorrowHighlight && (
          <div className="highlight-banner mb-4 flex items-center justify-between">
            <div className="text-sm">
              <span className="opacity-60">Manana: </span>
              <strong>{tomorrowHighlight.title}</strong>
              <span className="ml-1 opacity-60">
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTaskId(null)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" style={{ minHeight: '65vh' }}>
            {BUCKETS.map(bucket => (
              <div key={bucket} className={bucket === 'stove_main' ? 'sm:row-span-2' : undefined}>
                <BucketColumn
                  bucket={bucket}
                  tasks={tasksByBucket[bucket]}
                  bucketName={bucketNames[bucket]}
                  addingTo={addingTo}
                  newTitle={newTitle}
                  editingBucketName={editingBucketName}
                  bucketNameDraft={bucketNameDraft}
                  activeTaskId={activeTaskId}
                  dragDisabled={dragDisabled}
                  editingTaskId={editingTaskId}
                  editingTaskTitle={editingTaskTitle}
                  onAddBucketToggle={toggleAddTaskInput}
                  onNewTitleChange={setNewTitle}
                  onHandleAddTask={handleAddTask}
                  onCancelAddTask={cancelAddTask}
                  onStartBucketNameEdit={startBucketNameEdit}
                  onBucketNameDraftChange={setBucketNameDraft}
                  onSaveBucketName={saveBucketName}
                  onCancelBucketNameEdit={cancelBucketNameEdit}
                  onEditingTaskTitleChange={setEditingTaskTitle}
                  onToggleTaskStatus={toggleTaskStatus}
                  onSaveTaskEdit={saveTaskEdit}
                  onCancelTaskEdit={cancelTaskEdit}
                  onStartTaskEdit={startTaskEdit}
                  onOpenHighlight={openHighlightModal}
                  onArchiveTask={handleArchiveTask}
                  onDeleteTask={handleDeleteTask}
                />
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
                <span className="text-muted-foreground">
                  {BUCKET_ICONS[activeTask.bucket]}
                </span>
                <span className={cn(activeTask.status === 'done' && 'line-through text-muted-foreground')}>
                  {activeTask.title}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
