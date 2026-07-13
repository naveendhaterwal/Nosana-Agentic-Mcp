// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — 🩺 Debug Doctor Agent
// ─────────────────────────────────────────────────────────────────────────────
// Diagnoses failures, suggests fixes, and performs auto-recovery actions.

import { BaseAgent } from "../base.js";
import type { AgentName } from "../../types.js";

// Import raw tool functions
import { diagnoseDeployment } from "../../tools/diagnose.js";
import { restartDeployment } from "../../tools/restart_deployment.js";
import { createRevision } from "../../tools/create_revision.js";
import { stopDeployment } from "../../tools/stop_deployment.js";
import { updateReplicas } from "../../tools/update_replicas.js";
import { updateTimeout } from "../../tools/update_timeout.js";
import { getJobLogs } from "../../tools/get_job_logs.js";
import { stopJob } from "../../tools/stop_job.js";
import { extendJob } from "../../tools/extend_job.js";
import { getSshCommand } from "../../tools/get_ssh_command.js";
import { z } from "zod";

export class DoctorAgent extends BaseAgent {
  readonly name: AgentName = "doctor";
  readonly displayName = "🩺 Debug Doctor";
  readonly description = "Diagnoses deployment failures, suggests fixes, and performs auto-recovery.";

  readonly systemPrompt = `You are the Debug Doctor agent for Nosana deployments.

Your expertise:
- Root cause analysis of failed or misbehaving deployments
- Pattern recognition in container logs (OOM, missing modules, port conflicts, IPFS failures)
- Automated recovery actions (restart, scale, timeout extension, config revision)
- Proactive recommendations to prevent future failures

Guidelines:
- ALWAYS run diagnose first before taking any recovery action
- Explain the root cause clearly to the user before suggesting fixes
- Present recovery options in order of priority (immediate → recommended → optional)
- For OOM failures, suggest a specific GPU upgrade (e.g., "You need 16GB+ VRAM, try the RTX 4090 market")
- For dependency errors, suggest specific packages to add to requirements.txt
- After a restart/fix, hand off to the Monitor agent to verify the deployment is healthy
- Never restart more than twice without user confirmation`;

  init(): void {
    // ── diagnose ─────────────────────────────────────────────────────────
    this.registerTool(
      "diagnose",
      "Aggregated diagnostic tool: pulls deployment status, events, and logs to produce a root cause analysis with recovery recommendations.",
      z.object({
        deploymentId: z.string().describe("Deployment ID or Job ID to diagnose"),
      }),
      async (args) => {
        const raw = await diagnoseDeployment(args.deploymentId);
        return JSON.parse(raw);
      }
    );

    // ── restart ──────────────────────────────────────────────────────────
    this.registerTool(
      "restart",
      "Restart a stopped or failed deployment by creating a new one with the same configuration.",
      z.object({
        deploymentId: z.string().describe("The deployment ID to restart"),
      }),
      async (args) => {
        const raw = await restartDeployment(args.deploymentId);
        return JSON.parse(raw);
      }
    );

    // ── create_revision ──────────────────────────────────────────────────
    this.registerTool(
      "create_revision",
      "Create a new revision for an existing deployment with a modified job definition (e.g., change image, ports, env vars).",
      z.object({
        deploymentId: z.string().describe("The deployment ID"),
        jobDefinition: z.any().describe("The new or partial JobDefinition object to apply"),
      }),
      async (args) => {
        const raw = await createRevision(
          args.deploymentId,
          args.jobDefinition
        );
        return JSON.parse(raw);
      }
    );

    // ── stop ─────────────────────────────────────────────────────────────
    this.registerTool(
      "stop",
      "Gracefully stop an active deployment.",
      z.object({
        deploymentId: z.string().describe("The deployment ID to stop"),
      }),
      async (args) => {
        const raw = await stopDeployment(args.deploymentId);
        return JSON.parse(raw);
      }
    );

    // ── scale_replicas ───────────────────────────────────────────────────
    this.registerTool(
      "scale_replicas",
      "Update the number of running instances (replicas) for a deployment.",
      z.object({
        deploymentId: z.string().describe("The deployment ID"),
        replicas: z.number().describe("New number of replicas"),
      }),
      async (args) => {
        const raw = await updateReplicas(
          args.deploymentId,
          args.replicas
        );
        return JSON.parse(raw);
      }
    );

    // ── update_timeout ───────────────────────────────────────────────────
    this.registerTool(
      "update_timeout",
      "Update the execution timeout (in HOURS) for a deployment.",
      z.object({
        deploymentId: z.string().describe("Deployment ID"),
        timeoutHours: z.number().describe("New timeout in HOURS (e.g., 1.0)"),
      }),
      async (args) => {
        const raw = await updateTimeout(
          args.deploymentId,
          args.timeoutHours
        );
        return JSON.parse(raw);
      }
    );

    // ── get_logs ─────────────────────────────────────────────────────────
    this.registerTool(
      "get_logs",
      "Retrieve execution logs for a specific job (shared capability for debugging context).",
      z.object({
        jobId: z.string().describe("The job ID to get logs for"),
        opName: z.string().optional().describe("Filter by operation name"),
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

    // ── stop_job ─────────────────────────────────────────────────────────
    this.registerTool(
      "stop_job",
      "Gracefully stop an active Nosana job using its job address.",
      z.object({
        jobAddress: z.string().describe("The job address to stop"),
      }),
      async (args) => {
        const raw = await stopJob(args.jobAddress);
        return JSON.parse(raw);
      }
    );

    // ── extend_job ───────────────────────────────────────────────────────
    this.registerTool(
      "extend_job",
      "Extend the timeout of a running Nosana job by a specified number of seconds.",
      z.object({
        jobAddress: z.string().describe("The job address to extend"),
        timeoutSeconds: z.number().describe("Additional seconds to extend the job by"),
      }),
      async (args) => {
        const raw = await extendJob(args.jobAddress, args.timeoutSeconds);
        return JSON.parse(raw);
      }
    );

    // ── get_ssh_command ──────────────────────────────────────────────────
    this.registerTool(
      "get_ssh_command",
      "Retrieve the local CLI command to establish an SSH connection to a running job container.",
      z.object({
        jobAddress: z.string().describe("The job address to SSH into"),
      }),
      async (args) => {
        const raw = await getSshCommand(args.jobAddress);
        return JSON.parse(raw);
      }
    );
  }
}
