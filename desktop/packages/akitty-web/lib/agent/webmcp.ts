/**
 * Optional adapter that exposes the read-only terminal tools to browser agents through WebMCP
 * (`document.modelContext`, see developer.chrome.com/docs/modern-web-guidance/guides/webmcp). The API is new and
 * browser support is partial, so this feature-detects and does nothing where it is missing; the tools in ./tools work
 * without it.
 */

import type { TerminalSessionSource } from './registry';
import { createTerminalTools, type TerminalTool } from './tools';

export interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute(input: unknown, context?: { signal?: AbortSignal }): unknown;
}

/** The part of `document.modelContext` this adapter uses. */
export interface WebMcpContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): unknown;
}

export interface WebMcpOptions {
  /** Defaults to `document.modelContext` when the browser has it. */
  context?: WebMcpContext;
  /** Aborting this signal unregisters the tools, the same as calling dispose(). */
  signal?: AbortSignal;
}

export interface WebMcpRegistration {
  /** Names of the tools that were registered; empty when WebMCP is unavailable or registration failed. */
  tools: string[];
  /** Unregisters every tool. Safe to call more than once. */
  dispose(): void;
}

function defaultContext(): WebMcpContext | undefined {
  if (typeof document === 'undefined') return undefined;
  const context = (document as { modelContext?: WebMcpContext }).modelContext;
  return context && typeof context.registerTool === 'function' ? context : undefined;
}

function toWebMcpTool(tool: TerminalTool): WebMcpTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { ...tool.annotations },
    execute: (input) => tool.execute(input),
  };
}

export async function registerWebMcpTools(
  source: TerminalSessionSource,
  options: WebMcpOptions = {}
): Promise<WebMcpRegistration> {
  const context = options.context ?? defaultContext();
  const controller = new AbortController();
  const dispose = () => {
    controller.abort();
    options.signal?.removeEventListener('abort', dispose);
  };
  const none: WebMcpRegistration = { tools: [], dispose };
  if (!context) return none;

  if (options.signal) {
    if (options.signal.aborted) { dispose(); return none; }
    options.signal.addEventListener('abort', dispose, { once: true });
  }

  const registered: string[] = [];
  try {
    for (const tool of createTerminalTools(source)) {
      if (controller.signal.aborted) { dispose(); return none; }
      await context.registerTool(toWebMcpTool(tool), { signal: controller.signal });
      if (controller.signal.aborted) { dispose(); return none; }
      registered.push(tool.name);
    }
  } catch (error) {
    // Partial registration would leave an agent with a confusing subset, so back out.
    dispose();
    console.warn('akitty-web: WebMCP registration failed', error);
    return { tools: [], dispose };
  }
  return { tools: registered, dispose };
}
