/**
 * A host-owned list of terminals that tools can address by id. The package does not know about sessions, tabs or PTYs,
 * so the application registers each terminal under a stable id of its own choosing.
 */

import type { ReadableTerminal } from './reader';

export interface TerminalSessionInfo {
  id: string;
  /** Optional human-readable name, such as the tab title or the agent that owns the session. */
  label?: string;
}

export interface TerminalSessionSource {
  list(): TerminalSessionInfo[];
  get(id: string): ReadableTerminal | undefined;
}

export class TerminalSessionRegistry implements TerminalSessionSource {
  private readonly sessions = new Map<string, { terminal: ReadableTerminal; label?: string }>();

  /** Registers a terminal and returns a function that removes it. Re-using an id replaces the earlier terminal. */
  add(id: string, terminal: ReadableTerminal, label?: string): () => void {
    if (!id) throw new RangeError('session id must not be empty');
    const entry = { terminal, label };
    this.sessions.set(id, entry);
    return () => {
      // Only remove our own entry, not a newer terminal registered under the same id.
      if (this.sessions.get(id) === entry) this.sessions.delete(id);
    };
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions].map(([id, { label }]) => (label === undefined ? { id } : { id, label }));
  }

  get(id: string): ReadableTerminal | undefined {
    return this.sessions.get(id)?.terminal;
  }
}
