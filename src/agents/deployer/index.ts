// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — 🚀 Deploy Orchestrator Agent
// ─────────────────────────────────────────────────────────────────────────────
// Handles the full deployment pipeline: packaging → upload → market selection → deploy → verify.

import { BaseAgent } from "../base.js";
import type { AgentName } from "../../types.js";

// Import raw tool functions

import { postJobDefinition } from "../../tools/post_job_definition.js";
import { deployModel } from "../../tools/deploy_model.js";
import { getGpuOptions } from "../../tools/get_gpu_options.js";
import { checkMarketQueue } from "../../tools/check_market_queue.js";
import { uploadSecrets } from "../../tools/upload_secrets.js";
import { z } from "zod";

export class DeployerAgent extends BaseAgent {
  readonly name: AgentName = "deployer";
  readonly displayName = "🚀 Deploy Orchestrator";
  readonly description = "Handles end-to-end deployment pipeline to the Nosana GPU network.";

  readonly systemPrompt = `You are the Deploy Orchestrator agent for Nosana.

Your expertise:
- End-to-end deployment of apps and models to decentralized GPUs
- Packaging local projects into IPFS artifacts
- Selecting optimal GPU markets based on price, VRAM, and queue congestion
- Managing deployment strategies (SIMPLE, INFINITE, SIMPLE-EXTEND)
- Verifying deployments are live and reachable

Guidelines:
- When a user asks to deploy a project, you MUST follow this exact sequence:
  1. List available GPU options (use get_gpu_markets) and recommend the best one for their specific project.
  2. Ask which kind of deployment strategy they want to use (SIMPLE, INFINITE, SIMPLE-EXTEND).
  3. Ask how long they want to deploy for. IMPORTANT: You must ALWAYS ask for and deal with the timeout in HOURS only (e.g., 2 hours, 0.5 hours).
- NEVER deploy without explicit user confirmation of the GPU tier, strategy, and timeout.
- For ML models, verify VRAM requirements match the selected market.
- Monitor deployment status after submission and report the live URL.
- If deployment fails, hand off to the Debug Doctor agent for diagnosis.`;

  init(): void {
    // ── post_job ─────────────────────────────────────────────────────────
    this.registerTool(
      "post_job",
      "Submit a raw JobDefinition JSON to a Nosana market. Use this AFTER the configurator generates a config.",
      z.object({
        jobDefinitionJson: z.string().describe("Valid Nosana JobDefinition as JSON string"),
        marketAddress: z.string().describe("Target GPU market address"),
        name: z.string().optional().describe("Deployment name"),
        strategy: z.enum(["SIMPLE", "SIMPLE-EXTEND", "INFINITE"]).optional().describe("Deployment strategy (default: SIMPLE)"),
        timeout: z.number().optional().describe("Timeout in HOURS (e.g., 2.0). The system will convert this internally."),
      }),
      async (args) => {
        const raw = await postJobDefinition(
          args.jobDefinitionJson,
          args.marketAddress,
          args.timeout,
          args.name,
          args.strategy
        );
        return JSON.parse(raw);
      }
    );

    // ── deploy_model ─────────────────────────────────────────────────────
    this.registerTool(
      "deploy_model",
      "Deploy an ML model to Nosana using the Enterprise Deployment API. For inference/serving workloads specifically.",
      z.object({
        modelPath: z.string().describe("Local path to the model directory"),
        marketAddress: z.string().describe("Nosana market address"),
        baseImage: z.string().describe("Docker base image (e.g. python:3.10-slim)"),
        requiredVram: z.number().describe("Required GPU VRAM in GB"),
        name: z.string().optional().describe("Deployment name"),
        replicas: z.number().optional().describe("Number of parallel GPU instances (default 1)"),
        strategy: z.string().optional().describe("Deployment strategy (default SIMPLE)"),
        timeout: z.number().describe("Timeout in HOURS (e.g., 2.0). The system will convert this internally."),
      }),
      async (args) => {
        const raw = await deployModel(
          args.modelPath,
          args.marketAddress,
          args.baseImage,
          args.name,
          args.replicas,
          args.strategy,
          args.timeout,
          args.requiredVram
        );
        return JSON.parse(raw);
      }
    );

    // ── get_gpu_markets ──────────────────────────────────────────────────
    this.registerTool(
      "get_gpu_markets",
      "List currently available GPU markets on Nosana with VRAM, pricing, queue depth, and fleet capacity.",
      z.object({
        recommendedVram: z.number().optional().describe("Optional minimum VRAM in GB to filter markets"),
      }),
      async (args) => {
        const raw = await getGpuOptions(args.recommendedVram);
        // getGpuOptions returns a formatted string, not JSON
        return { formatted: raw };
      }
    );

    // ── check_market ─────────────────────────────────────────────────────
    this.registerTool(
      "check_market",
      "Check live queue health and congestion of a specific Nosana GPU market before deploying.",
      z.object({
        marketAddress: z.string().describe("The base58 address of the market to check"),
      }),
      async (args) => {
        const raw = await checkMarketQueue(args.marketAddress);
        return JSON.parse(raw);
      }
    );

    // ── upload_secrets ───────────────────────────────────────────────────
    this.registerTool(
      "upload_secrets",
      "Uploads a secrets file (like .env) to IPFS to be injected into a Nosana job securely.",
      z.object({
        filePath: z.string().describe("Local absolute path to the secrets file"),
      }),
      async (args) => {
        const raw = await uploadSecrets(args.filePath);
        return JSON.parse(raw);
      }
    );
  }
}
