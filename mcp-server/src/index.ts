// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Production-Grade Multi-Agent Entry Point
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the monolithic 21-tool flat server with a 4-agent architecture.
// Each agent owns a focused domain: Analysis, Deployment, Monitoring, Debugging.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { envConfig } from "./config.js";
import { logger } from "./logger.js";
import type { AgentName, AgentToolDefinition } from "./types.js";
import { classifyIntent, getAgentDirectory } from "./agents/router.js";

// Import all agents
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { DeployerAgent } from "./agents/deployer/index.js";
import { MonitorAgent } from "./agents/monitor/index.js";
import { DoctorAgent } from "./agents/doctor/index.js";
import { ConfiguratorAgent } from "./agents/configurator/index.js";
import type { BaseAgent } from "./agents/base.js";

// ─────────────────────────────────────────────────────────────────────────────
// Initialize Agents
// ─────────────────────────────────────────────────────────────────────────────

const configurator = new ConfiguratorAgent();
const deployer = new DeployerAgent();
const monitor = new MonitorAgent();
const doctor = new DoctorAgent();

// Initialize all agents (register their tools)
configurator.init();
deployer.init();
monitor.init();
doctor.init();

const agents: Record<AgentName, BaseAgent> = {
  configurator,
  deployer,
  monitor,
  doctor,
};

// Build backward-compat mapping: flat name → namespaced name
const backwardCompatMap = new Map<string, { fullName: string; agent: BaseAgent }>();
if (envConfig.features.enableBackwardCompat) {
  for (const agent of Object.values(agents)) {
    for (const [shortName, fullName] of agent.getBackwardCompatMapping()) {
      backwardCompatMap.set(shortName, { fullName, agent });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server Setup
// ─────────────────────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "nosana-agentic-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Tool Registration
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: AgentToolDefinition[] = [];

  // 1. Register the router tool (always first)
  tools.push({
    name: "route_intent",
    description:
      "Classify a user message and route it to the appropriate specialized agent (Analyst, Deployer, Monitor, or Doctor). Call this first when unsure which tool to use.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The user's message or intent to classify",
        },
      },
      required: ["message"],
    },
  });

  // 2. Register the agent directory tool
  tools.push({
    name: "list_agents",
    description:
      "List all available agents and their capabilities. Use this to discover what the Nosana MCP can do.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  });

  // 3. Register all agent-namespaced tools
  for (const agent of Object.values(agents)) {
    tools.push(...agent.getMcpToolDefinitions());
  }

  // 4. Backward-compat aliases (if enabled)
  if (envConfig.features.enableBackwardCompat) {
    for (const agent of Object.values(agents)) {
      for (const tool of agent.getMcpToolDefinitions()) {
        const shortName = tool.name.split(".")[1];
        if (shortName) {
          tools.push({
            ...tool,
            name: shortName,
            description: `[LEGACY ALIAS → ${tool.name}] ${tool.description}`,
          });
        }
      }
    }
  }

  return { tools };
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool Execution
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const toolArgs = (args ?? {}) as Record<string, unknown>;

    // ── Handle meta-tools ────────────────────────────────────────────────
    if (name === "route_intent") {
      const message = toolArgs.message as string;
      if (!message) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Missing 'message' parameter" }) }],
          isError: true,
        };
      }
      const classification = await classifyIntent(message);
      return {
        content: [{ type: "text", text: JSON.stringify(classification, null, 2) }],
      };
    }

    if (name === "list_agents") {
      const directory = getAgentDirectory();
      return {
        content: [{ type: "text", text: JSON.stringify(directory, null, 2) }],
      };
    }

    // ── Route to agent by namespace ──────────────────────────────────────
    let targetAgent: BaseAgent | undefined;
    let targetToolName = name;

    // Check namespaced format: "agent.tool_name"
    if (name.includes(".")) {
      const [agentName] = name.split(".");
      targetAgent = agents[agentName as AgentName];
    }

    // Check backward-compat flat names
    if (!targetAgent && envConfig.features.enableBackwardCompat) {
      const compat = backwardCompatMap.get(name);
      if (compat) {
        targetAgent = compat.agent;
        targetToolName = compat.fullName;
        logger.info(`Backward-compat: "${name}" → "${targetToolName}"`);
      }
    }

    if (!targetAgent) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Unknown tool: "${name}"`,
            hint: "Use 'list_agents' to see available agents and their tools, or 'route_intent' to classify your request.",
            availableAgents: Object.keys(agents),
          }, null, 2),
        }],
        isError: true,
      };
    }

    // Execute through the agent wrapper (includes logging, timing, error handling)
    const result = await targetAgent.executeTool(targetToolName, toolArgs);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    };
  } catch (error: any) {
    logger.error("Unhandled error in tool execution", error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: false,
          error: `Unhandled error: ${error.message}`,
        }, null, 2),
      }],
      isError: true,
    };
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Registration (Agent System Prompts)
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const prompts = Object.values(agents).map((agent) => {
    const prompt = agent.getMcpPrompt();
    return {
      name: prompt.name,
      description: prompt.description,
    };
  });

  return { prompts };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  for (const agent of Object.values(agents)) {
    const prompt = agent.getMcpPrompt();
    if (prompt.name === name) {
      return {
        description: prompt.description,
        messages: prompt.messages,
      };
    }
  }

  throw new Error(`Prompt "${name}" not found.`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Startup
// ─────────────────────────────────────────────────────────────────────────────

let transport: SSEServerTransport;

async function run() {
  const useStdio = process.argv.includes("stdio") || process.env.TRANSPORT === "stdio";

  if (useStdio) {
    // ── STDIO Transport ──────────────────────────────────────────────────────
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Write purely to stderr so we don't break JSON-RPC over stdout
    console.error(`🚀 Nosana Agentic MCP v2.0 running on STDIO`);
    console.error(`   📊 ${Object.keys(agents).length} agents`);
    console.error(`   ⚙️ Configurator · 🚀 Deployer · 📊 Monitor · 🩺 Doctor`);
  } else {
    // ── SSE Transport ────────────────────────────────────────────────────────
    const app = express();
    const PORT = process.env.PORT || 3001;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(500).send("Transport not initialized");
      }
    });

    app.listen(PORT, () => {
      const totalTools = Object.values(agents).reduce(
        (sum, agent) => sum + agent.getToolNames().length,
        0
      );

      logger.info("🚀 Nosana Agentic MCP v2.0 — Cloud Architecture", {
        port: PORT,
        agents: Object.keys(agents),
        totalTools: totalTools + 2, // +2 for route_intent and list_agents
        backwardCompat: envConfig.features.enableBackwardCompat,
        logLevel: envConfig.logging.level,
      });

      console.log(`🚀 Nosana Agentic MCP v2.0 running on SSE`);
      console.log(`   🔗 URL: http://localhost:${PORT}/sse`);
      console.log(`   📊 ${Object.keys(agents).length} agents | ${totalTools + 2} tools | backward-compat: ${envConfig.features.enableBackwardCompat}`);
      console.log(`   ⚙️ Configurator · 🚀 Deployer · 📊 Monitor · 🩺 Doctor`);
    });
  }
}

run().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
