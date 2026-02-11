import { DailyHighlight } from './types';

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_STORAGE_KEY = 'mt_google_calendar_auth';
const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface StoredGoogleCalendarAuth {
  connected: boolean;
  accessToken?: string;
  expiresAt?: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleApiErrorResponse {
  error?: {
    code?: number;
    message?: string;
  };
}

interface GoogleCalendarEventResponse {
  id: string;
  htmlLink?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let gsiLoadPromise: Promise<void> | null = null;

function readAuthState(): StoredGoogleCalendarAuth {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return { connected: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      connected: Boolean(parsed.connected),
      accessToken: parsed.accessToken,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined,
    };
  } catch {
    return { connected: false };
  }
}

function writeAuthState(state: StoredGoogleCalendarAuth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function getClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('missing_google_client_id');
  }
  return clientId;
}

function getStoredAccessToken(): string | null {
  const state = readAuthState();
  if (state.accessToken && state.expiresAt && state.expiresAt > Date.now() + 30000) {
    return state.accessToken;
  }
  return null;
}

async function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  if (gsiLoadPromise) return gsiLoadPromise;

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-google-gsi="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('google_identity_script_load_failed')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('google_identity_script_load_failed'));
    document.head.appendChild(script);
  });

  return gsiLoadPromise;
}

async function requestAccessToken(interactive: boolean): Promise<string> {
  await loadGsiScript();
  const clientId = getClientId();
  const oauth2 = window.google?.accounts?.oauth2;

  if (!oauth2) {
    throw new Error('google_identity_not_available');
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: response => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'google_authorization_failed'));
          return;
        }

        const expiresIn = Number(response.expires_in || 3600);
        writeAuthState({
          connected: true,
          accessToken: response.access_token,
          expiresAt: Date.now() + expiresIn * 1000 - 30000,
        });
        resolve(response.access_token);
      },
      error_callback: error => {
        reject(new Error(error.type || 'google_authorization_failed'));
      },
    });

    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function getAccessToken(): Promise<string> {
  const cached = getStoredAccessToken();
  if (cached) return cached;

  try {
    return await requestAccessToken(false);
  } catch {
    return requestAccessToken(true);
  }
}

async function parseApiError(response: Response): Promise<string> {
  let fallback = `google_calendar_request_failed_${response.status}`;
  try {
    const body = await response.json() as GoogleApiErrorResponse;
    if (body.error?.message) {
      fallback = body.error.message;
    }
  } catch {
    // Ignore parse failures and keep fallback
  }
  return fallback;
}

function buildEventBody(highlight: DailyHighlight) {
  const start = new Date(highlight.scheduledAt);
  const end = new Date(start.getTime() + highlight.durationMinutes * 60000);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const reminderOverrides = highlight.remindBeforeMinutes > 0
    ? [{ method: 'popup', minutes: highlight.remindBeforeMinutes }]
    : [];

  return {
    summary: `Highlight: ${highlight.title}`,
    description: 'Planned in Make Time',
    start: {
      dateTime: start.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: timezone,
    },
    reminders: reminderOverrides.length > 0
      ? { useDefault: false, overrides: reminderOverrides }
      : { useDefault: true },
  };
}

async function sendEvent(
  token: string,
  method: 'POST' | 'PATCH',
  url: string,
  highlight: DailyHighlight
): Promise<{ status: number; event?: GoogleCalendarEventResponse; errorMessage?: string }> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventBody(highlight)),
  });

  if (!response.ok) {
    return {
      status: response.status,
      errorMessage: await parseApiError(response),
    };
  }

  const event = await response.json() as GoogleCalendarEventResponse;
  return { status: response.status, event };
}

export function hasGoogleCalendarClientId(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

export function isGoogleCalendarConnected(): boolean {
  return readAuthState().connected;
}

export async function connectGoogleCalendar(): Promise<void> {
  await requestAccessToken(true);
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const state = readAuthState();
  if (state.accessToken) {
    const token = encodeURIComponent(state.accessToken);
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // Ignore revoke failures and still clear local auth state.
    }
  }

  writeAuthState({ connected: false });
}

export async function syncHighlightToGoogleCalendar(highlight: DailyHighlight): Promise<{
  eventId: string;
  eventLink?: string;
}> {
  if (!hasGoogleCalendarClientId()) {
    throw new Error('missing_google_client_id');
  }

  let token = await getAccessToken();

  const createEvent = async (accessToken: string) =>
    sendEvent(accessToken, 'POST', CALENDAR_BASE_URL, highlight);

  const updateEvent = async (accessToken: string) =>
    sendEvent(
      accessToken,
      'PATCH',
      `${CALENDAR_BASE_URL}/${encodeURIComponent(highlight.googleCalendarEventId || '')}`,
      highlight
    );

  let result;
  if (highlight.googleCalendarEventId) {
    result = await updateEvent(token);
    if (result.status === 404) {
      result = await createEvent(token);
    }
  } else {
    result = await createEvent(token);
  }

  if (result.status === 401 || result.status === 403) {
    token = await requestAccessToken(true);
    if (highlight.googleCalendarEventId) {
      result = await updateEvent(token);
      if (result.status === 404) {
        result = await createEvent(token);
      }
    } else {
      result = await createEvent(token);
    }
  }

  if (!result.event?.id) {
    throw new Error(result.errorMessage || 'google_calendar_sync_failed');
  }

  return {
    eventId: result.event.id,
    eventLink: result.event.htmlLink,
  };
}

export function getGoogleCalendarErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'unknown_google_calendar_error';

  if (raw === 'missing_google_client_id') {
    return 'Configura VITE_GOOGLE_CLIENT_ID para activar Google Calendar.';
  }
  if (raw === 'popup_closed' || raw === 'access_denied' || raw === 'interaction_required') {
    return 'No se pudo autorizar Google Calendar.';
  }
  if (raw === 'google_identity_script_load_failed' || raw === 'google_identity_not_available') {
    return 'No se pudo cargar Google Identity.';
  }

  return 'Error al sincronizar con Google Calendar.';
}
