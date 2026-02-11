import { DailyHighlight } from './types';

export function generateGoogleCalendarUrl(h: DailyHighlight): string {
  const start = new Date(h.scheduledAt);
  const end = new Date(start.getTime() + h.durationMinutes * 60000);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Highlight: ${h.title}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: 'Planned in MakeTime-style app',
  });

  return `https://calendar.google.com/calendar/render?${params}`;
}

export function generateICS(h: DailyHighlight): string {
  const start = new Date(h.scheduledAt);
  const end = new Date(start.getTime() + h.durationMinutes * 60000);

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Highlight App//EN',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Highlight: ${h.title}`,
    `DESCRIPTION:Planned in MakeTime-style app`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${h.remindBeforeMinutes}M`,
    'DESCRIPTION:Highlight reminder',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    'DESCRIPTION:Highlight starting now',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(h: DailyHighlight) {
  const ics = generateICS(h);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `highlight-${h.date}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
