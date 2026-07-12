// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Deterministic Intent Router
// ─────────────────────────────────────────────────────────────────────────────
// Pattern-based intent classifier. NO LLM calls — pure keyword/regex matching.
// Maps user intent → AgentName with confidence scoring.

import type { AgentName, IntentClassification } from "../types.js";
import { generateTraceId } from "../types.js";
import { logger } from "../logger.js";
import { traceable } from "langsmith/traceable";

// ─────────────────────────────────────────────────────────────────────────────
// Intent Pattern Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface IntentPattern {
  agent: AgentName;
  intent: string;
  /** Keywords that trigger this intent (case-insensitive) */
  keywords: string[];
  /** Regex patterns for more complex matching */
  patterns?: RegExp[];
  /** Suggested tools for this intent */
  suggestedTools: string[];
  /** Base confidence for keyword matches (0-1) */
  baseConfidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ── Configurator Intents ───────────────────────────────────────────────────
  {
    agent: "configurator",
    intent: "generate_job_config",
    keywords: ["job definition", "job config", "compose", "configure", "generate config", "create config", "json config"],
    patterns: [/job\s*def/i, /create.*config/i],
    suggestedTools: ["configurator.generate_job_config"],
    baseConfidence: 0.9,
  },
  {
    agent: "configurator",
    intent: "validate_job_config",
    keywords: ["validate", "check config", "verify definition"],
    patterns: [/validate\s+(the\s+)?config/i, /check\s+(the\s+)?json/i],
    suggestedTools: ["configurator.validate_job_config"],
    baseConfidence: 0.9,
  },

  // ── Deployer Intents ─────────────────────────────────────────────────────
  {
    agent: "deployer",
    intent: "post_job",
    keywords: ["deploy", "launch", "ship", "push", "go live", "put online", "start deploy", "submit job", "post job", "raw job"],
    patterns: [/deploy\s+(my|this|the)/i, /put\s+(it\s+)?online/i, /go\s+live/i],
    suggestedTools: ["deployer.post_job"],
    baseConfidence: 0.95,
  },
  {
    agent: "deployer",
    intent: "gpu_markets",
    keywords: ["gpu market", "gpu list", "available gpu", "cheapest gpu", "gpu price"],
    patterns: [/gpu\s+(market|option|price|list)/i, /cheapest\s+gpu/i],
    suggestedTools: ["deployer.get_gpu_markets"],
    baseConfidence: 0.9,
  },
  {
    agent: "deployer",
    intent: "check_market",
    keywords: ["market queue", "congestion", "market availability", "market busy"],
    patterns: [/market\s+(queue|busy|available|congestion)/i],
    suggestedTools: ["deployer.check_market"],
    baseConfidence: 0.85,
  },
  {
    agent: "deployer",
    intent: "upload_secrets",
    keywords: ["upload secrets", "pin secrets", "secrets file", "env file"],
    patterns: [/upload\s+(the\s+)?secrets/i, /upload.*\.env/i],
    suggestedTools: ["deployer.upload_secrets"],
    baseConfidence: 0.9,
  },

  // ── Monitor Intents ──────────────────────────────────────────────────────
  {
    agent: "monitor",
    intent: "check_status",
    keywords: ["status", "check", "is it running", "is it live", "health", "how is"],
    patterns: [/is\s+(it|my)\s+(running|live|ready|up)/i, /how\s+is\s+(my|the)/i],
    suggestedTools: ["monitor.deployment_status", "monitor.job_status"],
    baseConfidence: 0.9,
  },
  {
    agent: "monitor",
    intent: "view_logs",
    keywords: ["logs", "log", "output", "stdout", "stderr", "console"],
    patterns: [/show\s+(me\s+)?(the\s+)?logs/i, /get\s+logs/i],
    suggestedTools: ["monitor.job_logs", "monitor.deployment_logs"],
    baseConfidence: 0.9,
  },
  {
    agent: "monitor",
    intent: "list_deployments",
    keywords: ["list", "show all", "all deployments", "my deployments", "what's running"],
    patterns: [/list\s+(all\s+)?(my\s+)?deploy/i, /show\s+(all\s+)?(my\s+)?deploy/i, /what.*running/i],
    suggestedTools: ["monitor.list_deployments"],
    baseConfidence: 0.9,
  },
  {
    agent: "monitor",
    intent: "view_events",
    keywords: ["events", "timeline", "history", "state changes"],
    patterns: [/deployment\s+events/i, /state\s+change/i],
    suggestedTools: ["monitor.deployment_events"],
    baseConfidence: 0.85,
  },
  {
    agent: "monitor",
    intent: "get_details",
    keywords: ["details", "info", "information", "get deployment"],
    patterns: [/deployment\s+(details|info)/i],
    suggestedTools: ["monitor.get_deployment"],
    baseConfidence: 0.8,
  },
  {
    agent: "monitor",
    intent: "list_jobs",
    keywords: ["list jobs", "my jobs", "all jobs", "recent jobs"],
    patterns: [/list\s+(all\s+)?(my\s+)?jobs/i, /show.*jobs/i],
    suggestedTools: ["monitor.list_jobs"],
    baseConfidence: 0.9,
  },
  {
    agent: "monitor",
    intent: "download_artifacts",
    keywords: ["download", "artifacts", "output files", "results"],
    patterns: [/download\s+(the\s+)?artifacts/i, /get.*results/i],
    suggestedTools: ["monitor.download_artifacts"],
    baseConfidence: 0.9,
  },

  // ── Doctor Intents ───────────────────────────────────────────────────────
  {
    agent: "doctor",
    intent: "diagnose",
    keywords: ["diagnose", "debug", "why failed", "not working", "broken", "investigate", "troubleshoot"],
    patterns: [/why\s+(did|is)\s+(it|my|the)\s+(fail|crash|error|stop|break)/i, /not\s+working/i, /what.*wrong/i],
    suggestedTools: ["doctor.diagnose"],
    baseConfidence: 0.95,
  },
  {
    agent: "doctor",
    intent: "restart",
    keywords: ["restart", "redeploy", "try again", "relaunch"],
    patterns: [/re-?deploy/i, /try\s+again/i, /re-?start/i, /re-?launch/i],
    suggestedTools: ["doctor.restart"],
    baseConfidence: 0.9,
  },
  {
    agent: "doctor",
    intent: "stop",
    keywords: ["stop", "kill", "terminate", "shut down", "shutdown"],
    patterns: [/shut\s*down/i, /stop\s+(the|my)/i],
    suggestedTools: ["doctor.stop"],
    baseConfidence: 0.9,
  },
  {
    agent: "doctor",
    intent: "scale",
    keywords: ["scale", "replicas", "scale up", "scale down", "more instances"],
    patterns: [/scale\s+(up|down|to)/i, /add\s+(more\s+)?replicas/i],
    suggestedTools: ["doctor.scale_replicas"],
    baseConfidence: 0.9,
  },
  {
    agent: "doctor",
    intent: "update_timeout",
    keywords: ["timeout", "extend", "extend time", "more time"],
    patterns: [/extend\s+(the\s+)?time/i, /update\s+timeout/i, /more\s+time/i],
    suggestedTools: ["doctor.update_timeout"],
    baseConfidence: 0.9,
  },
  {
    agent: "doctor",
    intent: "revision",
    keywords: ["revision", "update config", "change config", "modify deployment", "new version"],
    patterns: [/create\s+(a\s+)?revision/i, /update\s+(the\s+)?config/i, /new\s+version/i],
    suggestedTools: ["doctor.create_revision"],
    baseConfidence: 0.85,
  },
  {
    agent: "doctor",
    intent: "get_ssh",
    keywords: ["ssh", "connect", "shell", "exec"],
    patterns: [/ssh\s+to/i, /get\s+ssh\s+command/i, /connect\s+to/i],
    suggestedTools: ["doctor.get_ssh_command"],
    baseConfidence: 0.9,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Router Logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify user intent and route to the appropriate agent.
 * Uses keyword matching + regex patterns with confidence scoring.
 */
export const classifyIntent = traceable((userMessage: string): IntentClassification => {
  const lower = userMessage.toLowerCase().trim();
  const traceId = generateTraceId();

  let bestMatch: {
    pattern: IntentPattern;
    score: number;
    matchType: "regex" | "keyword";
  } | null = null;

  for (const pattern of INTENT_PATTERNS) {
    let score = 0;
    let matchType: "regex" | "keyword" = "keyword";

    // Check regex patterns first (higher confidence)
    if (pattern.patterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(lower)) {
          score = pattern.baseConfidence + 0.05; // Regex match bonus
          matchType = "regex";
          break;
        }
      }
    }

    // Check keyword matches
    if (score === 0) {
      const keywordHits = pattern.keywords.filter((kw) => lower.includes(kw));
      if (keywordHits.length > 0) {
        // More keyword hits = higher confidence
        const hitRatio = keywordHits.length / pattern.keywords.length;
        score = pattern.baseConfidence * (0.7 + 0.3 * hitRatio);
        matchType = "keyword";
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { pattern, score, matchType };
    }
  }

  // Default fallback: deployer (most common action)
  if (!bestMatch) {
    const result: IntentClassification = {
      agent: "deployer",
      confidence: 0.3,
      intent: "unknown",
      suggestedTools: ["deployer.post_job"],
      reasoning: "No strong intent match found. Defaulting to Deploy Orchestrator as the most common action.",
    };
    logger.routeDecision(userMessage.slice(0, 80), result.agent, result.confidence, traceId);
    return result;
  }

  const result: IntentClassification = {
    agent: bestMatch.pattern.agent,
    confidence: Math.min(bestMatch.score, 1.0),
    intent: bestMatch.pattern.intent,
    suggestedTools: bestMatch.pattern.suggestedTools,
    reasoning: `Matched intent "${bestMatch.pattern.intent}" via ${bestMatch.matchType} match.`,
  };

  logger.routeDecision(userMessage.slice(0, 80), result.agent, result.confidence, traceId);
  return result;
}, { name: "route_intent", tags: ["mcp-router"] });

/**
 * Get all available agents and their tools for the LLM to browse.
 */
export function getAgentDirectory(): Record<AgentName, { description: string; tools: string[] }> {
  const directory: Record<string, { description: string; tools: string[] }> = {};

  const agentDescriptions: Record<AgentName, string> = {
    configurator: "⚙️ Configurator — Generates Nosana JSON Job Definitions for Docker images",
    deployer: "🚀 Deploy Orchestrator — Handles submitting jobs to the Nosana GPU network",
    monitor: "📊 Monitor — Checks deployment status, streams logs, tracks events and health",
    doctor: "🩺 Debug Doctor — Diagnoses failures, suggests fixes, and performs auto-recovery",
  };

  // Build tool lists from INTENT_PATTERNS
  const toolsByAgent = new Map<AgentName, Set<string>>();
  for (const pattern of INTENT_PATTERNS) {
    if (!toolsByAgent.has(pattern.agent)) {
      toolsByAgent.set(pattern.agent, new Set());
    }
    for (const tool of pattern.suggestedTools) {
      toolsByAgent.get(pattern.agent)!.add(tool);
    }
  }

  for (const [agent, desc] of Object.entries(agentDescriptions)) {
    directory[agent] = {
      description: desc,
      tools: Array.from(toolsByAgent.get(agent as AgentName) || []),
    };
  }

  return directory as Record<AgentName, { description: string; tools: string[] }>;
}
