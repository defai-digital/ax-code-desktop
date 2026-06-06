export const BROWSER_VOICE_LANGUAGE_STORAGE_KEY = 'browserVoiceLanguage';
export const BROWSER_VOICE_CONVERSATION_MODE_STORAGE_KEY = 'browserVoiceConversationMode';
export const BROWSER_VOICE_LANGUAGE_CHANGE_EVENT = 'openchamber:voice-language-changed';
export const BROWSER_VOICE_CONVERSATION_MODE_CHANGE_EVENT = 'openchamber:voice-conversation-mode-changed';

const DEFAULT_SPEECH_LANGUAGE = 'en-US';
const BLOCKED_SPEECH_LANGUAGES = new Set(['ru', 'ru-RU']);

export function sanitizeSpeechLanguage(lang: unknown): string {
  const normalized = typeof lang === 'string' ? lang.trim() : '';
  if (!normalized) {
    return DEFAULT_SPEECH_LANGUAGE;
  }

  const base = normalized.split('-')[0].toLowerCase();
  if (BLOCKED_SPEECH_LANGUAGES.has(normalized) || BLOCKED_SPEECH_LANGUAGES.has(base)) {
    return DEFAULT_SPEECH_LANGUAGE;
  }
  return normalized;
}

export function getBrowserVoiceStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export function getNavigatorSpeechLanguage(): string {
  if (typeof navigator === 'undefined') {
    return DEFAULT_SPEECH_LANGUAGE;
  }
  return sanitizeSpeechLanguage(navigator.language);
}

export function readBrowserVoiceLanguage(storage: Storage | null, fallbackLanguage: string): string {
  return sanitizeSpeechLanguage(storage?.getItem(BROWSER_VOICE_LANGUAGE_STORAGE_KEY) || fallbackLanguage);
}

export function readBrowserVoiceConversationMode(storage: Storage | null): boolean {
  return storage?.getItem(BROWSER_VOICE_CONVERSATION_MODE_STORAGE_KEY) === 'true';
}

export function saveBrowserVoiceLanguage(storage: Storage | null, language: string): string {
  const nextLanguage = sanitizeSpeechLanguage(language);
  storage?.setItem(BROWSER_VOICE_LANGUAGE_STORAGE_KEY, nextLanguage);
  return nextLanguage;
}

export function saveBrowserVoiceConversationMode(storage: Storage | null, enabled: boolean): void {
  storage?.setItem(BROWSER_VOICE_CONVERSATION_MODE_STORAGE_KEY, String(enabled));
}

const getCustomEventDetail = (event: Event): unknown => (
  'detail' in event ? (event as CustomEvent<unknown>).detail : undefined
);

export function resolveBrowserVoiceLanguageEvent(event: Event, storage: Storage | null): string {
  const detail = getCustomEventDetail(event);
  const fallback = storage?.getItem(BROWSER_VOICE_LANGUAGE_STORAGE_KEY) || DEFAULT_SPEECH_LANGUAGE;
  return sanitizeSpeechLanguage(typeof detail === 'string' ? detail : fallback);
}

export function resolveBrowserVoiceConversationModeEvent(event: Event): boolean | null {
  const detail = getCustomEventDetail(event);
  return typeof detail === 'boolean' ? detail : null;
}
