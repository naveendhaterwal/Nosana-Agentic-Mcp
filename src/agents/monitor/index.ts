// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — 📊 Monitor Agent
// ─────────────────────────────────────────────────────────────────────────────
// Read-only monitoring: status checks, logs, events, and health pings.

import { BaseAgent } from "../base.js";
import type { AgentName } from "../../types.js";

// Import raw tool functions
import { getDeploymentStatus } from "../../tools/get_deployment_status.js";
import { getJobStatus } from "../../tools/get_job_status.js";
import { getDeployment } from "../../tools/get_deployment.js";
import { listDeployments } from "../../tools/list_deployments.js";
import { getDeploymentEvents } from "../../tools/get_deployment_events.js";
import { getJobLogs } from "../../tools/get_job_logs.js";
import { getDeploymentLogs } from "../../tools/get_deployment_logs.js";
import { listJobs } from "../../tools/list_jobs.js";
import { downloadArtifacts } from "../../tools/download_artifacts.js";
import { z } from "zod";

export class MonitorAgent extends BaseAgent {
  readonly name: AgentName = "monitor";
  readonly displayName = "📊 Monitor";
  readonly description = "Checks deployment status, streams logs, tracks events and health.";

  readonly systemPrompt = `You are the Monitor agent for Nosana deployments.

Your expertise:
- Checking real-time deployment and job status
- Streaming and filtering execution logs from IPFS
- Tracking deployment event timelines (state transitions)
- Performing HTTP health checks on live endpoints
- Listing all user deployments with status summaries

Guidelines:
- Always include the dashboard URL in status reports
- When checking status, also check endpoint health if the job is RUNNING
- For log retrieval, use filters (opName, searchText, tailLimit) to avoid overwhelming output
- Summarize deployment lists concisely with key metrics (status, replicas, uptime)
- If you detect a failure, suggest handing off to the Debug Doctor agent`;

  init(): void {
    // ── deployment_status ─────────────────────────────────────────────────
    this.registerTool(
      "deployment_status",
      "Check the real-time status of a deployment or job, including live API URL and optional health check.",
      z.object({
        id: z.string().describe("Deployment ID or Job ID"),
        checkHealth: z.boolean().optional().describe("If true, pings the live URL to verify HTTP 200 readiness"),
      }),
      async (args) => {
        const raw = await getDeploymentStatus(
          args.id,
          args.checkHealth
        );
        return JSON.parse(raw);
      }
    );

    // ── job_status ────────────────────────────────────────────────────────
    this.registerTool(
      "job_status",
      "Poll the live status and resolve the public URL of a specific Nosana job.",
      z.object({
        jobId: z.string().describe("The job ID to check"),
      }),
      async (args) => {
        const raw = await getJobStatus(args.jobId);
        return JSON.parse(raw);
      }
    );

    // ── get_deployment ────────────────────────────────────────────────────
    this.registerTool(
      "get_deployment",
      "Retrieve full details of a Nosana deployment including status, replicas, strategy, and active jobs.",
      z.object({
        deploymentId: z.string().describe("The unique deployment ID"),
      }),
      async (args) => {
        const raw = await getDeployment(args.deploymentId);
        return JSON.parse(raw);
      }
    );

    // ── list_deployments ──────────────────────────────────────────────────
    this.registerTool(
      "list_deployments",
      "List all Nosana deployments for the authenticated user, optionally filtered by status.",
      z.object({
        status: z.string().optional().describe("Filter by status: RUNNING, STOPPED, STARTING, etc."),
        limit: z.number().optional().describe("Max number of deployments to return"),
      }),
      async (args) => {
        const raw = await listDeployments({
          status: args.status,
          limit: args.limit,
        });
        return JSON.parse(raw);
      }
    );

    // ── deployment_events ─────────────────────────────────────────────────
    this.registerTool(
      "deployment_events",
      "Retrieve timeline of state changes and events for a deployment (QUEUED → STARTING → RUNNING → etc.).",
      z.object({
        deploymentId: z.string().describe("The deployment ID"),
        limit: z.number().optional().describe("Max number of events to return (default: 20)"),
      }),
      async (args) => {
        const raw = await getDeploymentEvents(
          args.deploymentId,
          args.limit
        );
        return JSON.parse(raw);
      }
    );

    // ── job_logs ──────────────────────────────────────────────────────────
    this.registerTool(
      "job_logs",
      "Retrieve execution logs for a Nosana job from IPFS with optional filtering by operation, text search, or tail limit.",
      z.object({
        jobId: z.string().describe("The job ID to get logs for"),
        opName: z.string().optional().describe("Filter logs by operation name"),
        searchText: z.string().optional().describe("Search text to filter lines"),
        tailLimit: z.number().optional().describe("Limit number of lines from the end"),
      }),
      async (args) => {
        const raw = await getJobLogs(args.jobId, {
          opName: args.opName,
          searchText: args.searchText,
          tailLimit: args.tailLimit,
        });
        return JSON.parse(raw);
      }
    );

    // ── deployment_logs ───────────────────────────────────────────────────
    this.registerTool(
      "deployment_logs",
      "Fetch and aggregate logs from jobs associated with a deployment.",
      z.object({
        deploymentId: z.string().describe("The deployment ID"),
        jobId: z.string().optional().describe("Optional: specific job ID in the deployment"),
        searchText: z.string().optional().describe("Search text to filter log lines"),
        tailLimit: z.number().optional().describe("Limit number of lines from the end"),
      }),
      async (args) => {
        const raw = await getDeploymentLogs(args.deploymentId, {
          jobId: args.jobId,
          searchText: args.searchText,
          tailLimit: args.tailLimit,
        });
        return JSON.parse(raw);
      }
    );

    // ── list_jobs ─────────────────────────────────────────────────────────
    this.registerTool(
      "list_jobs",
      "List recent Nosana jobs for the configured wallet address.",
      z.object({
        limit: z.number().optional().describe("Max number of jobs to return"),
        state: z.string().optional().describe("Filter by state: QUEUED, RUNNING, COMPLETED, STOPPED"),
        market: z.string().optional().describe("Filter by market address"),
      }),
      async (args) => {
        const raw = await listJobs({
          limit: args.limit,
          state: args.state,
          market: args.market,
        });
        return JSON.parse(raw);
      }
    );

    // ── download_artifacts ────────────────────────────────────────────────
    this.registerTool(
      "download_artifacts",
      "Download and extract the output artifacts of a completed job from IPFS.",
      z.object({
        jobAddress: z.string().describe("The job address to download artifacts for"),
        outputPath: z.string().optional().describe("Local output directory path (optional)"),
      }),
      async (args) => {
        const raw = await downloadArtifacts(args.jobAddress, args.outputPath);
        return JSON.parse(raw);
      }
    );
  }
}
