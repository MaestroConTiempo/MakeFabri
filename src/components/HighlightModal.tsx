import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSettings, getTasks, getHighlightByDate } from '@/lib/storage';
import { getTomorrowDate } from '@/lib/dates';
import { Task } from '@/lib/types';

interface HighlightModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    time: string;
    durationMinutes: number;
    remindBeforeMinutes: number;
    taskId?: string;
  }) => void | Promise<void>;
  initialTitle?: string;
  initialTaskId?: string;
  willReplaceExisting?: boolean;
}

const DURATIONS = [30, 60, 90];
const REMINDERS = [0, 15, 30, 60];

const HighlightModal: React.FC<HighlightModalProps> = ({
  open,
  onClose,
  onSave,
  initialTitle = '',
  initialTaskId,
  willReplaceExisting = true,
}) => {
  const settings = getSettings();
  const [title, setTitle] = useState(initialTitle);
  const [time, setTime] = useState(settings.defaultPlanHour);
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [reminder, setReminder] = useState(settings.defaultRemindBeforeMinutes);
  const [showTasks, setShowTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taskId, setTaskId] = useState<string | undefined>(initialTaskId);

  const existingHighlight = getHighlightByDate(getTomorrowDate());
  const tasks = getTasks().filter(t => t.status !== 'archived');

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), time, durationMinutes: duration, remindBeforeMinutes: reminder, taskId });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const pickTask = (task: Task) => {
    setTitle(task.title);
    setTaskId(task.id);
    setShowTasks(false);
  };

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setTaskId(initialTaskId);
      setTime(settings.defaultPlanHour);
      setDuration(settings.defaultDurationMinutes);
      setReminder(settings.defaultRemindBeforeMinutes);
      setShowTasks(false);
      setSaving(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Highlight de mañana</DialogTitle>
        </DialogHeader>

        {existingHighlight && willReplaceExisting && (
          <div className="highlight-banner text-sm mb-2">
            Esto reemplazara: <strong>{existingHighlight.title}</strong>
          </div>
        )}

        {existingHighlight && !willReplaceExisting && (
          <div className="highlight-banner text-sm mb-2">
            Se creara un nuevo highlight y el actual quedara en el historial.
          </div>
        )}

        {!showTasks ? (
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="¿Qué es lo más importante mañana?"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Hora</Label>
              <Input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Duración</Label>
              <div className="flex gap-2 mt-1">
                {DURATIONS.map(d => (
                  <Button
                    key={d}
                    variant={duration === d ? 'default' : 'outline'}
                    size="sm"
                    disabled={saving}
                    onClick={() => setDuration(d)}
                    className={duration === d ? 'bg-primary' : ''}
                  >
                    {d} min
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>Recordatorio</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {REMINDERS.map(r => (
                  <Button
                    key={r}
                    variant={reminder === r ? 'default' : 'outline'}
                    size="sm"
                    disabled={saving}
                    onClick={() => setReminder(r)}
                    className={reminder === r ? 'bg-primary' : ''}
                  >
                    {r === 0 ? 'Ninguno' : `${r} min`}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setShowTasks(true)}
              className="w-full"
            >
              📋 Elegir de una tarea existente
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-secondary text-secondary-foreground font-semibold hover:opacity-90"
            >
              {saving ? 'Guardando...' : 'Guardar Highlight'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <Button variant="ghost" size="sm" onClick={() => setShowTasks(false)}>
              ← Volver
            </Button>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No hay tareas</p>
            ) : (
              tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => pickTask(task)}
                  className="task-item w-full text-left border border-border rounded-lg"
                >
                  <span className="text-sm">{task.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HighlightModal;

