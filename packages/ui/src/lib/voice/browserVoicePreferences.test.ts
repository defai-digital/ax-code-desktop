import { describe, expect, test } from 'bun:test';
import {
  BROWSER_VOICE_CONVERSATION_MODE_STORAGE_KEY,
  BROWSER_VOICE_LANGUAGE_STORAGE_KEY,
  readBrowserVoiceConversationMode,
  readBrowserVoiceLanguage,
  resolveBrowserVoiceConversationModeEvent,
  resolveBrowserVoiceLanguageEvent,
  sanitizeSpeechLanguage,
  saveBrowserVoiceConversationMode,
  saveBrowserVoiceLanguage,
} from './browserVoicePreferences';

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe('browser voice preferences', () => {
  test('sanitizes empty and blocked speech languages', () => {
    expect(sanitizeSpeechLanguage('')).toBe('en-US');
    expect(sanitizeSpeechLanguage('  es-ES  ')).toBe('es-ES');
    expect(sanitizeSpeechLanguage('ru')).toBe('en-US');
    expect(sanitizeSpeechLanguage('ru-RU')).toBe('en-US');
  });

  test('reads and writes language preference through storage', () => {
    const storage = createMemoryStorage();
    expect(readBrowserVoiceLanguage(storage, 'fr-FR')).toBe('fr-FR');

    expect(saveBrowserVoiceLanguage(storage, ' de-DE ')).toBe('de-DE');
    expect(storage.getItem(BROWSER_VOICE_LANGUAGE_STORAGE_KEY)).toBe('de-DE');
    expect(readBrowserVoiceLanguage(storage, 'fr-FR')).toBe('de-DE');
  });

  test('resolves language events with storage fallback', () => {
    const storage = createMemoryStorage();
    storage.setItem(BROWSER_VOICE_LANGUAGE_STORAGE_KEY, 'it-IT');

    expect(resolveBrowserVoiceLanguageEvent(new CustomEvent('language', { detail: 'ja-JP' }), storage)).toBe('ja-JP');
    expect(resolveBrowserVoiceLanguageEvent(new CustomEvent('language', { detail: 1 }), storage)).toBe('it-IT');
  });

  test('reads and writes conversation mode preference', () => {
    const storage = createMemoryStorage();
    expect(readBrowserVoiceConversationMode(storage)).toBe(false);

    saveBrowserVoiceConversationMode(storage, true);
    expect(storage.getItem(BROWSER_VOICE_CONVERSATION_MODE_STORAGE_KEY)).toBe('true');
    expect(readBrowserVoiceConversationMode(storage)).toBe(true);
  });

  test('resolves conversation mode events only from boolean detail', () => {
    expect(resolveBrowserVoiceConversationModeEvent(new CustomEvent('conversation', { detail: true }))).toBe(true);
    expect(resolveBrowserVoiceConversationModeEvent(new CustomEvent('conversation', { detail: false }))).toBe(false);
    expect(resolveBrowserVoiceConversationModeEvent(new CustomEvent('conversation', { detail: 'true' }))).toBeNull();
  });
});
