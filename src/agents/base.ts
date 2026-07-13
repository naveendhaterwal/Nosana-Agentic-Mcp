// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Base Agent Class
// ─────────────────────────────────────────────────────────────────────────────
// Every specialized agent extends this class. It provides:
// - Tool registration with namespacing
// - Execution wrapper with logging, timing, and error handling
// - MCP Prompt generation

import type {
  AgentName,
  AgentToolDefinition,
  AgentPromptDefinition,
  AgentResponse,
  ToolExecutionContext,
} from "../types.js";
import {
  createContext,
  successResponse,
  errorResponse,
} from "../types.js";
import { logger } from "../logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { traceable } from "langsmith/traceable";

/**
 * A tool handler function that receives parsed arguments and a context,
 * and returns the structured data payload.
 */
export type ToolHandler<T = any> = (
  args: T,
  ctx: ToolExecutionContext
) => Promise<unknown>;

/**
 * Internal tool registration entry.
 */
interface RegisteredTool {
  /** Short name without namespace (e.g., "analyze_project") */
  shortName: string;
  /** Full namespaced name (e.g., "analyst.analyze_project") */
  fullName: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for the tool's input */
  inputSchema: AgentToolDefinition["inputSchema"];
  /** Zod Schema for input validation */
  zodSchema: z.ZodType<any>;
  /** The handler function */
  handler: ToolHandler;
}

/**
 * Base class for all Nosana agents. Provides:
 * - Namespaced tool registration
 * - Execution wrapper with observability
 * - MCP prompt/tool definition generation
 */
export abstract class BaseAgent {
  /** Unique agent identifier */
  abstract readonly name: AgentName;
  /** Human-readable display name */
  abstract readonly displayName: string;
  /** Short description of this agent's role */
  abstract readonly description: string;
  /** System prompt guiding the LLM when using this agent */
  abstract readonly systemPrompt: string;

  /** Registered tools for this agent */
  protected tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a tool under this agent's namespace.
   * The tool will be exposed as "agentName.toolName" to the MCP client.
   */
  protected registerTool<T>(
    shortName: string,
    description: string,
    zodSchema: z.ZodType<T>,
    handler: ToolHandler<T>
  ): void {
    const fullName = `${this.name}-${shortName}`;
    const rawSchema = zodToJsonSchema(zodSchema);
    // zodToJsonSchema might return the schema wrapped or with $schema. 
    // We just need the type and properties for MCP.
    const inputSchema = {
      type: "object",
      properties: (rawSchema as any).properties || {},
      required: (rawSchema as any).required || [],
    } as AgentToolDefinition["inputSchema"];
    
    const tracedHandler = traceable(handler, {
      name: fullName,
      tags: ["mcp-tool", this.name],
    }) as unknown as ToolHandler<any>;
    
    this.tools.set(fullName, {
      shortName,
      fullName,
      description,
      inputSchema,
      zodSchema,
      handler: tracedHandler,
    });
  }

  /**
   * Abstract initialization method. Subclasses register their tools here.
   */
  abstract init(): void;

  /**
   * Execute a tool by its full namespaced name.
   * Wraps the handler with logging, timing, and error handling.
   */
  async executeTool(
    fullName: string,
    args: Record<string, unknown>
  ): Promise<AgentResponse> {
    const tool = this.tools.get(fullName);
    if (!tool) {
      const ctx = createContext(this.name);
      return errorResponse(this.name, fullName, {
        code: "TOOL_NOT_FOUND",
        message: `Tool "${fullName}" is not registered on the ${this.displayName} agent.`,
        hint: `Available tools: ${this.getToolNames().join(", ")}`,
        retryable: false,
      }, ctx);
    }

    const ctx = createContext(this.name);
    logger.toolStart(ctx, tool.shortName, args);

    // Validate inputs using Zod
    const validationResult = tool.zodSchema.safeParse(args);
    if (!validationResult.success) {
      logger.toolError(ctx, tool.shortName, validationResult.error);
      return errorResponse(
        this.name,
        tool.shortName,
        {
          code: "VALIDATION_ERROR",
          message: "Invalid arguments provided to tool",
          hint: validationResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          retryable: true,
        },
        ctx
      );
    }

    try {
      const data = await tool.handler(validationResult.data, ctx);
      logger.toolSuccess(ctx, tool.shortName);
      return successResponse(this.name, tool.shortName, data, ctx);
    } catch (err: any) {
      logger.toolError(ctx, tool.shortName, err);
      return errorResponse(this.name, tool.shortName, {
        code: err.code || "EXECUTION_ERROR",
        message: err.message || "Unknown error",
        hint: err.hint,
        retryable: err.retryable ?? false,
      }, ctx);
    }
  }

  /**
   * Check if this agent owns a given tool name.
   */
  hasTool(fullName: string): boolean {
    return this.tools.has(fullName);
  }

  /**
   * Get all full namespaced tool names for this agent.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Generate MCP tool definitions for registration with the MCP server.
   */
  getMcpToolDefinitions(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.fullName,
      description: `[${this.displayName}] ${tool.description}`,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Generate a backward-compatible flat tool name mapping.
   * Returns entries like { "smart_deploy" => "deployer.smart_deploy" }
   */
  getBackwardCompatMapping(): Map<string, string> {
    const mapping = new Map<string, string>();
    for (const tool of this.tools.values()) {
      mapping.set(tool.shortName, tool.fullName);
    }
    return mapping;
  }

  /**
   * Generate an MCP Prompt definition for this agent.
   */
  getMcpPrompt(): AgentPromptDefinition {
    const toolList = Array.from(this.tools.values())
      .map((t) => `- **${t.fullName}**: ${t.description}`)
      .join("\n");

    return {
      name: `${this.name}-guide`,
      description: `Guide for using the ${this.displayName} agent`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `# ${this.displayName}`,
              "",
              this.systemPrompt,
              "",
              "## Available Tools",
              toolList,
            ].join("\n"),
          },
        },
      ],
    };
  }
}
