import React, { useState } from 'react';
import WaveHeader from '@/components/WaveHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  getSettings,
  saveSettings,
  exportAllData,
  importAllData,
  resetAllData,
  getCloudSyncState,
} from '@/lib/storage';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  hasGoogleCalendarClientId,
  isGoogleCalendarConnected,
  getGoogleCalendarErrorMessage,
} from '@/lib/googleCalendar';
import { AppSettings } from '@/lib/types';
import { Download, Upload, Trash2, Link2, Link2Off } from 'lucide-react';
import { toast } from 'sonner';

const TIMEZONES = [
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'UTC',
];

const DURATIONS = [30, 45, 60, 90, 120];
const REMINDERS = [0, 15, 30, 60];

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [googleConnected, setGoogleConnected] = useState(isGoogleCalendarConnected());
  const [, setRefresh] = useState(0);
  const googleConfigured = hasGoogleCalendarClientId();
  const cloudSync = getCloudSyncState();

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const handleExport = () => {
    const data = exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlight-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('¡Datos exportados!');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        importAllData(text);
        setSettings(getSettings());
        setRefresh(r => r + 1);
        toast.success('¡Datos importados!');
      } catch {
        toast.error('Error al importar los datos');
      }
    };
    input.click();
  };

  const handleReset = () => {
    resetAllData();
    setSettings(getSettings());
    setRefresh(r => r + 1);
    toast.success('Todos los datos eliminados');
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      await connectGoogleCalendar();
      setGoogleConnected(true);
      toast.success('Google Calendar conectado');
    } catch (error) {
      toast.error(getGoogleCalendarErrorMessage(error));
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    await disconnectGoogleCalendar();
    setGoogleConnected(false);
    toast.success('Google Calendar desconectado');
  };

  return (
    <div className="min-h-screen pb-24 flex flex-col">
      <WaveHeader title="Ajustes" subtitle="Configura la app" />

      <div className="w-full max-w-md mx-auto px-6 pt-8 pb-4 space-y-6 animate-fade-in">
        {/* Timezone */}
        <div>
          <Label>Zona horaria</Label>
          <Select value={settings.timezone} onValueChange={v => update({ timezone: v })}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default plan hour */}
        <div>
          <Label>Hora de planificación por defecto</Label>
          <Input
            type="time"
            value={settings.defaultPlanHour}
            onChange={e => update({ defaultPlanHour: e.target.value })}
            className="mt-1"
          />
        </div>

        {/* Default duration */}
        <div>
          <Label>Duración por defecto</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {DURATIONS.map(d => (
              <Button
                key={d}
                variant={settings.defaultDurationMinutes === d ? 'default' : 'outline'}
                size="sm"
                onClick={() => update({ defaultDurationMinutes: d })}
                className={settings.defaultDurationMinutes === d ? 'bg-primary' : ''}
              >
                {d} min
              </Button>
            ))}
          </div>
        </div>

        {/* Reminder */}
        <div>
          <Label>Recordatorio por defecto</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {REMINDERS.map(r => (
              <Button
                key={r}
                variant={settings.defaultRemindBeforeMinutes === r ? 'default' : 'outline'}
                size="sm"
                onClick={() => update({ defaultRemindBeforeMinutes: r })}
                className={settings.defaultRemindBeforeMinutes === r ? 'bg-primary' : ''}
              >
                {r === 0 ? 'Ninguno' : `${r} min`}
              </Button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <h3 className="font-display font-semibold text-sm">Google Calendar</h3>
          <p className="text-sm text-muted-foreground">
            {googleConnected
              ? 'Conectado. Los highlights se sincronizan automaticamente al guardarlos.'
              : 'No conectado. Conecta tu cuenta para sincronizacion automatica.'}
          </p>
          {!googleConfigured && (
            <p className="text-xs text-muted-foreground">
              Falta VITE_GOOGLE_CLIENT_ID en tu entorno.
            </p>
          )}
          {googleConnected ? (
            <Button variant="outline" onClick={handleDisconnectGoogleCalendar} className="w-full gap-2">
              <Link2Off size={16} /> Desconectar Google Calendar
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleConnectGoogleCalendar}
              disabled={!googleConfigured}
              className="w-full gap-2"
            >
              <Link2 size={16} /> Conectar Google Calendar
            </Button>
          )}
        </div>

        {/* Data management */}
        <div className="pt-4 border-t border-border space-y-3">
          <h3 className="font-display font-semibold text-sm">Supabase</h3>
          {cloudSync.configured ? (
            <p className="text-sm text-muted-foreground">
              Estado: {cloudSync.status} · {cloudSync.message}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No configurado. Añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en tu entorno.
            </p>
          )}
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <h3 className="font-display font-semibold text-sm">Datos</h3>
          <Button variant="outline" onClick={handleExport} className="w-full gap-2">
            <Download size={16} /> Exportar datos (JSON)
          </Button>
          <Button variant="outline" onClick={handleImport} className="w-full gap-2">
            <Upload size={16} /> Importar datos (JSON)
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 size={16} /> Borrar todos los datos
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esto eliminará todas las tareas, highlights y configuración. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Sí, borrar todo</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
