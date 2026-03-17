import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { GripVertical, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import WaveHeader from '@/components/WaveHeader';
import HighlightModal from '@/components/HighlightModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getActiveHighlight,
  getBucketNames,
  getBucketConfigs,
  getTasksByBucket,
  createTask,
  moveTask,
  updateTask,
  updateBucketName,
  archiveTask,
  deleteTask,
  addCustomBucket,
  deleteCustomBucket,
  initializeCloudSync,
} from '@/lib/storage';
import { getTomorrowDate } from '@/lib/dates';
import { saveHighlightWithSync, type HighlightSaveData } from '@/lib/highlightActions';
import { BucketConfig, BUCKET_LABELS, CORE_BUCKET_IDS, Task } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

const BUCKET_ICON_OPTIONS = ['📌', '🎯', '💡', '📚', '⚡', '🎨', '🔧', '📝', '🌱', '🚀', '📦', '✨'];

const getBucketContainerId = (bucketId: string) => `bucket:${bucketId}`;

type BucketDropData = {
  type: 'bucket';
  bucket: string;
};

type TaskDropData = {
  type: 'task';
  bucket: string;
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

const SortableTaskItem = React.memo<SortableTaskItemProps>(function SortableTaskItem({
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
}) {
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
              if (e.key === 'Enter') { onSaveTaskEdit(task.id); return; }
              if (e.key === 'Escape') { onCancelTaskEdit(); }
            }}
          />
          <Button size="sm" className="h-8 px-2" onClick={() => onSaveTaskEdit(task.id)}>Guardar</Button>
          <Button size="sm" variant="outline" className="h-8 px-2" onClick={onCancelTaskEdit}>Cancelar</Button>
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
              <DropdownMenuItem onClick={() => onStartTaskEdit(task)}>Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchiveTask(task.id)}>Archivar</DropdownMenuItem>
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
});

interface BucketColumnProps {
  bucketId: string;
  tasks: Task[];
  bucketIcon: string;
  bucketName: string;
  bucketDefaultLabel: string;
  isCustomBucket: boolean;
  addingTo: string | null;
  newTitle: string;
  editingBucketName: string | null;
  bucketNameDraft: string;
  activeTaskId: string | null;
  dragDisabled: boolean;
  editingTaskId: string | null;
  editingTaskTitle: string;
  onAddBucketToggle: (bucketId: string) => void;
  onNewTitleChange: (value: string) => void;
  onHandleAddTask: (bucketId: string) => void;
  onCancelAddTask: () => void;
  onStartBucketNameEdit: (bucketId: string) => void;
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
  onDeleteBucket?: () => void;
}

const BucketColumn = React.memo<BucketColumnProps>(function BucketColumn({
  bucketId,
  tasks,
  bucketIcon,
  bucketName,
  bucketDefaultLabel,
  isCustomBucket,
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
  onDeleteBucket,
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: getBucketContainerId(bucketId),
    data: { type: 'bucket', bucket: bucketId } satisfies BucketDropData,
  });

  const displayName = bucketName || bucketDefaultLabel;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bucket-section h-full p-4 transition-colors',
        activeTaskId && isOver && 'border-primary bg-primary/10'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold font-display min-w-0">
          <span className="text-lg flex-shrink-0">{bucketIcon}</span>
          {editingBucketName === bucketId ? null : (
            <button
              type="button"
              className="truncate hover:underline text-left font-bold"
              onClick={() => onStartBucketNameEdit(bucketId)}
              title="Editar nombre"
            >
              {displayName}
            </button>
          )}
          <span className="text-xs font-normal text-muted-foreground flex-shrink-0">({tasks.length})</span>
        </h2>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onAddBucketToggle(bucketId)}
          >
            <Plus size={18} />
          </Button>
          {isCustomBucket && onDeleteBucket && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={onDeleteBucket}
              title="Eliminar fogon"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>

      {editingBucketName === bucketId && (
        <div className="mb-3 flex gap-2">
          <Input
            value={bucketNameDraft}
            onChange={e => onBucketNameDraftChange(e.target.value)}
            placeholder={bucketDefaultLabel}
            onKeyDown={e => {
              if (e.key === 'Enter') { onSaveBucketName(); return; }
              if (e.key === 'Escape') { onCancelBucketNameEdit(); }
            }}
            onBlur={onSaveBucketName}
            autoFocus
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={onSaveBucketName} className="h-9 bg-primary px-3">OK</Button>
        </div>
      )}

      {addingTo === bucketId && (
        <div className="mb-3 flex gap-2">
          <Input
            value={newTitle}
            onChange={e => onNewTitleChange(e.target.value)}
            placeholder="Nueva tarea..."
            onKeyDown={e => {
              if (e.key === 'Enter') { onHandleAddTask(bucketId); return; }
              if (e.key === 'Escape') { onCancelAddTask(); }
            }}
            onBlur={() => { if (!newTitle.trim()) onCancelAddTask(); }}
            autoFocus
            className="h-9 text-sm"
          />
          <Button size="sm" onClick={() => onHandleAddTask(bucketId)} className="h-9 bg-primary px-3">
            <Plus size={16} />
          </Button>
        </div>
      )}

      <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        <div className="min-h-8 space-y-1">
          {tasks.length === 0 && addingTo !== bucketId ? (
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
});

const FogonsPage: React.FC = () => {
  const [, setRefresh] = useState(0);
  const [bucketConfigs, setBucketConfigs] = useState<BucketConfig[]>(() => getBucketConfigs());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [bucketNames, setBucketNames] = useState(() => getBucketNames());
  const [editingBucketName, setEditingBucketName] = useState<string | null>(null);
  const [bucketNameDraft, setBucketNameDraft] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const editingTaskTitleRef = useRef(editingTaskTitle);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [highlightModal, setHighlightModal] = useState<{ open: boolean; task?: Task }>({ open: false });

  // New bucket form state
  const [addingNewBucket, setAddingNewBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketIcon, setNewBucketIcon] = useState('📌');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const tomorrowDate = getTomorrowDate();
  const activeHighlight = getActiveHighlight();
  const tomorrowHighlight = activeHighlight?.date === tomorrowDate ? activeHighlight : undefined;

  const tasksByBucket: Record<string, Task[]> = {};
  for (const config of bucketConfigs) {
    tasksByBucket[config.id] = getTasksByBucket(config.id);
  }

  const visibleTasks = bucketConfigs.flatMap(config => tasksByBucket[config.id]);
  const activeTask = activeTaskId ? visibleTasks.find(task => task.id === activeTaskId) : undefined;
  const dragDisabled = Boolean(editingTaskId) || addingTo !== null || editingBucketName !== null;

  const getBucketIcon = (bucketId: string) =>
    bucketConfigs.find(c => c.id === bucketId)?.icon ?? '📌';

  const getBucketDefaultLabel = (bucketId: string) =>
    BUCKET_LABELS[bucketId] || bucketId;

  const isCustomBucket = (bucketId: string) =>
    !(CORE_BUCKET_IDS as readonly string[]).includes(bucketId);

  const doRefresh = () => {
    setBucketConfigs(getBucketConfigs());
    setBucketNames(getBucketNames());
    setRefresh(v => v + 1);
  };

  useEffect(() => {
    let disposed = false;
    void initializeCloudSync(true).finally(() => {
      if (!disposed) doRefresh();
    });
    return () => { disposed = true; };
  }, []);

  const handleAddTask = (bucketId: string) => {
    if (!newTitle.trim()) { setAddingTo(null); setNewTitle(''); return; }
    createTask(newTitle.trim(), bucketId);
    setNewTitle('');
    setAddingTo(null);
    setRefresh(v => v + 1);
  };

  const cancelAddTask = () => { setAddingTo(null); setNewTitle(''); };

  const toggleAddTaskInput = (bucketId: string) => {
    setAddingTo(addingTo === bucketId ? null : bucketId);
    setNewTitle('');
  };

  const handleEditingTaskTitleChange = useCallback((v: string) => {
    editingTaskTitleRef.current = v;
    setEditingTaskTitle(v);
  }, []);

  const toggleTaskStatus = useCallback((task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateTask(task.id, { status: newStatus });
    setRefresh(v => v + 1);
  }, []);

  const startTaskEdit = useCallback((task: Task) => {
    editingTaskTitleRef.current = task.title;
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  }, []);

  const cancelTaskEdit = useCallback(() => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  }, []);

  const saveTaskEdit = useCallback((taskId: string) => {
    const title = editingTaskTitleRef.current.trim();
    if (!title) { setEditingTaskId(null); setEditingTaskTitle(''); return; }
    updateTask(taskId, { title });
    setEditingTaskId(null);
    setEditingTaskTitle('');
    setRefresh(v => v + 1);
    toast.success('Tarea actualizada');
  }, []);

  const startBucketNameEdit = (bucketId: string) => {
    setEditingBucketName(bucketId);
    setBucketNameDraft(bucketNames[bucketId] ?? '');
  };

  const cancelBucketNameEdit = () => { setEditingBucketName(null); setBucketNameDraft(''); };

  const saveBucketName = () => {
    if (!editingBucketName) return;
    const next = updateBucketName(editingBucketName, bucketNameDraft);
    setBucketNames(next);
    setEditingBucketName(null);
    setBucketNameDraft('');
  };

  const openHighlightModal = useCallback((task: Task) => {
    setHighlightModal({ open: true, task });
  }, []);

  const handleArchiveTask = useCallback((taskId: string) => {
    archiveTask(taskId);
    setRefresh(v => v + 1);
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteTask(taskId);
    setRefresh(v => v + 1);
  }, []);

  const handleHighlightSave = useCallback(
    async (data: HighlightSaveData) => {
      await saveHighlightWithSync(data);
      setBucketNames(getBucketNames());
      setRefresh(v => v + 1);
    },
    []
  );

  const handleAddBucket = () => {
    if (!newBucketName.trim()) { setAddingNewBucket(false); return; }
    addCustomBucket(newBucketName.trim(), newBucketIcon);
    setNewBucketName('');
    setNewBucketIcon('📌');
    setAddingNewBucket(false);
    doRefresh();
    toast.success('Fogon añadido');
  };

  const handleDeleteBucket = (bucketId: string) => {
    const deleted = deleteCustomBucket(bucketId);
    if (deleted) {
      doRefresh();
      toast.success('Fogon eliminado. Las tareas se movieron al fogon principal.');
    }
  };

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
    let targetBucket: string | null = null;
    let targetIndex = 0;

    if (overData?.type === 'bucket') {
      targetBucket = overData.bucket;
      targetIndex = tasksByBucket[targetBucket]?.length ?? 0;
    } else if (overData?.type === 'task') {
      targetBucket = overData.bucket;
      targetIndex = (tasksByBucket[targetBucket] ?? []).findIndex(task => task.id === overData.taskId);
      if (targetIndex === -1) targetIndex = tasksByBucket[targetBucket]?.length ?? 0;
    } else {
      return;
    }

    const movedTask = moveTask(movedTaskId, targetBucket, targetIndex);
    if (!movedTask) return;

    setRefresh(v => v + 1);

    if (currentTask.bucket !== targetBucket) {
      const targetLabel = bucketNames[targetBucket] || BUCKET_LABELS[targetBucket] || targetBucket;
      toast.success(`Tarea movida a ${targetLabel}`);
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
            {bucketConfigs.map((config, index) => (
              <div
                key={config.id}
                className={config.id === 'stove_main' ? 'sm:row-span-2' : undefined}
              >
                <BucketColumn
                  bucketId={config.id}
                  tasks={tasksByBucket[config.id] ?? []}
                  bucketIcon={config.icon}
                  bucketName={bucketNames[config.id] ?? ''}
                  bucketDefaultLabel={getBucketDefaultLabel(config.id)}
                  isCustomBucket={isCustomBucket(config.id)}
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
                  onEditingTaskTitleChange={handleEditingTaskTitleChange}
                  onToggleTaskStatus={toggleTaskStatus}
                  onSaveTaskEdit={saveTaskEdit}
                  onCancelTaskEdit={cancelTaskEdit}
                  onStartTaskEdit={startTaskEdit}
                  onOpenHighlight={openHighlightModal}
                  onArchiveTask={handleArchiveTask}
                  onDeleteTask={handleDeleteTask}
                  onDeleteBucket={isCustomBucket(config.id) ? () => handleDeleteBucket(config.id) : undefined}
                />
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
                <span className="text-muted-foreground">{getBucketIcon(activeTask.bucket)}</span>
                <span className={cn(activeTask.status === 'done' && 'line-through text-muted-foreground')}>
                  {activeTask.title}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Add new bucket */}
        {addingNewBucket ? (
          <div className="mt-4 rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">Nuevo fogon</p>
            <div className="flex flex-wrap gap-2">
              {BUCKET_ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewBucketIcon(icon)}
                  className={cn(
                    'text-xl p-1 rounded transition-colors',
                    newBucketIcon === icon ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newBucketName}
                onChange={e => setNewBucketName(e.target.value)}
                placeholder="Nombre del fogon..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddBucket();
                  if (e.key === 'Escape') setAddingNewBucket(false);
                }}
                className="h-9 text-sm"
              />
              <Button size="sm" onClick={handleAddBucket} className="h-9">Añadir</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingNewBucket(false)} className="h-9">Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setAddingNewBucket(true)}
            className="mt-4 w-full gap-2"
          >
            <Plus size={16} />
            Añadir fogon
          </Button>
        )}
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
