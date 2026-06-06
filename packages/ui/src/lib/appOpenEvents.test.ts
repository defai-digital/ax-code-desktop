import { describe, expect, test } from 'bun:test';
import {
  parseOpenDraftSessionEvent,
  parseOpenProjectEvent,
  parseOpenSessionEvent,
} from './appOpenEvents';

describe('app open event parsers', () => {
  test('parses open-session detail', () => {
    expect(parseOpenSessionEvent(new CustomEvent('open', {
      detail: { sessionId: ' session-1 ', directory: ' /repo ' },
    }))).toEqual({
      sessionId: 'session-1',
      directory: '/repo',
    });
  });

  test('rejects open-session without a session id', () => {
    expect(parseOpenSessionEvent(new CustomEvent('open', {
      detail: { directory: '/repo' },
    }))).toBeNull();
    expect(parseOpenSessionEvent(new Event('open'))).toBeNull();
  });

  test('parses open-draft-session detail with nullable fields', () => {
    expect(parseOpenDraftSessionEvent(new CustomEvent('open', {
      detail: { directory: ' ', projectId: ' project-1 ' },
    }))).toEqual({
      directory: null,
      projectId: 'project-1',
    });
  });

  test('parses open-project detail', () => {
    expect(parseOpenProjectEvent(new CustomEvent('open', {
      detail: { projectPath: ' /repo ' },
    }))).toEqual({ projectPath: '/repo' });
  });

  test('rejects open-project without a project path', () => {
    expect(parseOpenProjectEvent(new CustomEvent('open', {
      detail: { projectPath: '' },
    }))).toBeNull();
    expect(parseOpenProjectEvent(new CustomEvent('open', {
      detail: null,
    }))).toBeNull();
  });
});
