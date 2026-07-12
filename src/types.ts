// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Shared Types & Response Contracts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The specialized agents in the remote MCP system.
 */
export type AgentName = "configurator" | "deployer" | "monitor" | "doctor";

/**
 * Standardized response envelope returned by every tool through every agent.
 * This ensures the host LLM always gets a predictable structure.
 */
export interface AgentResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Which agent handled this request */
  agent: AgentName;
  /** The specific action/tool that was executed */
  action: string;
  /** The structured result data */
  data: T;
  /** Error details if success is false */
  error?: {
    code: string;
    message: string;
    hint?: string;
    retryable: boolean;
  };
  /** Execution metadata */
  meta: {
    traceId: string;
    durationMs: number;
    timestamp: string;
  };
}

/**
 * Intent classification result from the Router.
 */
export interface IntentClassification {
  /** The agent that should handle this intent */
  agent: AgentName;
  /** Confidence score (0-1) of the classification */
  confidence: number;
  /** The matched intent category */
  intent: string;
  /** Suggested tools the agent should use */
  suggestedTools: string[];
  /** Brief explanation of why this agent was chosen */
  reasoning: string;
}

/**
 * Context passed through tool executions for tracing and observability.
 */
export interface ToolExecutionContext {
  /** Unique trace ID for this execution chain */
  traceId: string;
  /** Which agent initiated this tool call */
  agent: AgentName;
  /** When the execution started */
  startedAt: number;
}

/**
 * MCP Tool definition schema used by agents to register their tools.
 */
export interface AgentToolDefinition {
  /** Full namespaced name: "agent.tool_name" */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP Prompt template definition for agent system prompts.
 */
export interface AgentPromptDefinition {
  /** Prompt name (e.g., "analyst-guide") */
  name: string;
  /** Short description */
  description: string;
  /** The prompt messages */
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

let traceCounter = 0;

/**
 * Generate a unique trace ID for execution tracking.
 */
export function generateTraceId(): string {
  traceCounter++;
  const timestamp = Date.now().toString(36);
  const counter = traceCounter.toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `nos-${timestamp}-${counter}-${random}`;
}

/**
 * Create a new ToolExecutionContext for a tool invocation.
 */
export function createContext(agent: AgentName): ToolExecutionContext {
  return {
    traceId: generateTraceId(),
    agent,
    startedAt: Date.now(),
  };
}

/**
 * Build a successful AgentResponse.
 */
export function successResponse<T>(
  agent: AgentName,
  action: string,
  data: T,
  ctx: ToolExecutionContext
): AgentResponse<T> {
  return {
    success: true,
    agent,
    action,
    data,
    meta: {
      traceId: ctx.traceId,
      durationMs: Date.now() - ctx.startedAt,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Build a failed AgentResponse.
 */
export function errorResponse(
  agent: AgentName,
  action: string,
  error: { code: string; message: string; hint?: string; retryable?: boolean },
  ctx: ToolExecutionContext
): AgentResponse<null> {
  return {
    success: false,
    agent,
    action,
    data: null,
    error: {
      code: error.code,
      message: error.message,
      hint: error.hint,
      retryable: error.retryable ?? false,
    },
    meta: {
      traceId: ctx.traceId,
      durationMs: Date.now() - ctx.startedAt,
      timestamp: new Date().toISOString(),
    },
  };
}
