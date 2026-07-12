// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Structured Logger
// ─────────────────────────────────────────────────────────────────────────────
// Writes JSON-formatted log lines to stderr (MCP convention).
// Each log entry includes traceId, agent, tool, duration, and status.

import { envConfig } from "./config.js";
import type { AgentName, ToolExecutionContext } from "./types.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  agent?: AgentName;
  tool?: string;
  traceId?: string;
  durationMs?: number;
  message: string;
  data?: unknown;
  error?: string;
}

function getConfiguredLevel(): number {
  const level = (envConfig.logging?.level ?? "info") as LogLevel;
  return LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= getConfiguredLevel();
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;

  const line = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });

  // MCP convention: all server output goes to stderr
  // stdout is reserved for the JSON-RPC protocol
  process.stderr.write(line + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export const logger = {
  debug(message: string, data?: unknown): void {
    emit({ level: "debug", timestamp: new Date().toISOString(), message, data });
  },

  info(message: string, data?: unknown): void {
    emit({ level: "info", timestamp: new Date().toISOString(), message, data });
  },

  warn(message: string, data?: unknown): void {
    emit({ level: "warn", timestamp: new Date().toISOString(), message, data });
  },

  error(message: string, error?: unknown): void {
    const errorStr =
      error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
    emit({ level: "error", timestamp: new Date().toISOString(), message, error: errorStr });
  },

  /**
   * Log the start of a tool execution within an agent context.
   */
  toolStart(ctx: ToolExecutionContext, tool: string, input?: unknown): void {
    emit({
      level: "info",
      timestamp: new Date().toISOString(),
      agent: ctx.agent,
      tool,
      traceId: ctx.traceId,
      message: `▶ ${ctx.agent}.${tool} started`,
      data: input,
    });
  },

  /**
   * Log the successful completion of a tool execution.
   */
  toolSuccess(ctx: ToolExecutionContext, tool: string, data?: unknown): void {
    emit({
      level: "info",
      timestamp: new Date().toISOString(),
      agent: ctx.agent,
      tool,
      traceId: ctx.traceId,
      durationMs: Date.now() - ctx.startedAt,
      message: `✓ ${ctx.agent}.${tool} completed`,
      data,
    });
  },

  /**
   * Log a failed tool execution.
   */
  toolError(ctx: ToolExecutionContext, tool: string, error: unknown): void {
    const errorStr = error instanceof Error ? error.message : String(error);
    emit({
      level: "error",
      timestamp: new Date().toISOString(),
      agent: ctx.agent,
      tool,
      traceId: ctx.traceId,
      durationMs: Date.now() - ctx.startedAt,
      message: `✗ ${ctx.agent}.${tool} failed`,
      error: errorStr,
    });
  },

  /**
   * Log intent routing decisions.
   */
  routeDecision(
    intent: string,
    agent: AgentName,
    confidence: number,
    traceId: string
  ): void {
    emit({
      level: "info",
      timestamp: new Date().toISOString(),
      agent,
      traceId,
      message: `🧠 Routed "${intent}" → ${agent} (confidence: ${(confidence * 100).toFixed(0)}%)`,
    });
  },
};
