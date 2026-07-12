// ─────────────────────────────────────────────────────────────────────────────
// Nosana Agentic MCP — Aggregated Diagnosis Tool
// ─────────────────────────────────────────────────────────────────────────────
// Pulls status + logs + events for a deployment, then returns a structured
// diagnosis with root cause analysis and suggested recovery actions.

import { getNosanaClient } from "../nosana/client.js";
import { getJobLogs } from "./get_job_logs.js";

interface DiagnosisResult {
  deploymentId: string;
  status: string;
  rootCause: string;
  severity: "low" | "medium" | "high" | "critical";
  timeline: Array<{ timestamp: string; event: string }>;
  logExcerpt: string;
  suggestedActions: Array<{
    action: string;
    tool: string;
    description: string;
    priority: "immediate" | "recommended" | "optional";
  }>;
  dashboardUrl: string;
}

/**
 * Aggregated diagnostic tool that pulls deployment status, events, and logs
 * to produce a structured root cause analysis with recovery recommendations.
 */
export async function diagnoseDeployment(deploymentId: string): Promise<string> {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    // ── 1. Fetch deployment details ──────────────────────────────────────
    let deployment: any;
    try {
      deployment = await client.api.deployments.get(deploymentId);
    } catch (e: any) {
      // Try as a job ID fallback
      try {
        const job = await client.api.jobs.get(deploymentId);
        const statusMap = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "STOPPED"];
        const status = statusMap[job.state] || "UNKNOWN";

        // For jobs, do a simpler diagnosis
        let logs = "";
        if (status === "FAILED" || status === "COMPLETED" || status === "STOPPED") {
          try {
            const logRaw = await getJobLogs(deploymentId);
            const logData = JSON.parse(logRaw);
            logs = logData.logs || "";
          } catch {
            // non-fatal
          }
        }

        const result: DiagnosisResult = {
          deploymentId,
          status,
          rootCause: analyzeRootCause(status, logs, []),
          severity: getSeverity(status),
          timeline: [],
          logExcerpt: logs.slice(-2000),
          suggestedActions: getSuggestedActions(status, logs),
          dashboardUrl: `https://dashboard.nosana.com/jobs/${deploymentId}`,
        };

        return JSON.stringify(result, null, 2);
      } catch {
        throw new Error(`Could not find deployment or job with ID: ${deploymentId}. ${e.message}`);
      }
    }

    const status = deployment.status || "UNKNOWN";
    const dashboardUrl = `https://dashboard.nosana.com/deployments/${deploymentId}`;

    // ── 2. Fetch events timeline ─────────────────────────────────────────
    let events: any[] = [];
    try {
      const eventsResult = await deployment.getEvents({ limit: 20 });
      events = (eventsResult.events || []).map((e: any) => ({
        timestamp: e.created_at || "unknown",
        event: `${e.type}: ${e.message || ""}`,
      }));
    } catch {
      // non-fatal
    }

    // ── 3. Fetch logs from recent jobs ───────────────────────────────────
    let logs = "";
    try {
      const jobsResult = await deployment.getJobs({ limit: 3 });
      const jobs = jobsResult.jobs || [];

      for (const job of jobs) {
        try {
          const logRaw = await getJobLogs(job.id, { tailLimit: 100 });
          const logData = JSON.parse(logRaw);
          if (logData.logs) {
            logs += `\n═══ Job ${job.id} (${logData.status || "unknown"}) ═══\n`;
            logs += logData.logs;
          }
        } catch {
          // non-fatal
        }
      }
    } catch {
      // non-fatal
    }

    // ── 4. Build diagnosis ───────────────────────────────────────────────
    const result: DiagnosisResult = {
      deploymentId,
      status,
      rootCause: analyzeRootCause(status, logs, events),
      severity: getSeverity(status),
      timeline: events.slice(0, 10),
      logExcerpt: logs.slice(-3000),
      suggestedActions: getSuggestedActions(status, logs),
      dashboardUrl,
    };

    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: err.message,
      hint: "Ensure the deployment/job ID is correct and NOSANA_API_KEY is set.",
    }, null, 2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Helpers
// ─────────────────────────────────────────────────────────────────────────────

function analyzeRootCause(status: string, logs: string, events: any[]): string {
  const lower = logs.toLowerCase();

  // Check for common failure patterns in logs
  if (lower.includes("out of memory") || lower.includes("oom") || lower.includes("cuda out of memory")) {
    return "GPU Out of Memory (OOM). The model requires more VRAM than the allocated GPU provides.";
  }
  if (lower.includes("module not found") || lower.includes("modulenotfounderror") || lower.includes("no module named")) {
    return "Missing Python dependency. A required package is not listed in requirements.txt.";
  }
  if (lower.includes("connection refused") || lower.includes("econnrefused")) {
    return "Connection refused. The application may have crashed before it could start listening on its port.";
  }
  if (lower.includes("permission denied")) {
    return "Permission denied. The container may lack filesystem or network permissions.";
  }
  if (lower.includes("download failed") || lower.includes("all attempts failed")) {
    return "Artifact download failure. The IPFS artifact could not be retrieved from any gateway.";
  }
  if (lower.includes("syntax error") || lower.includes("syntaxerror")) {
    return "Python syntax error in the application code.";
  }
  if (lower.includes("port") && lower.includes("already in use")) {
    return "Port conflict. The specified port is already in use inside the container.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Execution timeout. The job exceeded its configured maximum runtime.";
  }
  if (lower.includes("image") && (lower.includes("not found") || lower.includes("pull"))) {
    return "Docker image pull failure. The specified base image could not be found or pulled.";
  }

  // Status-based fallbacks
  switch (status) {
    case "FAILED":
      return "Deployment failed. Check the log excerpt below for specific error messages.";
    case "STOPPED":
      return "Deployment was stopped (either manually or due to timeout expiry).";
    case "QUEUED":
      return "Deployment is still queued. No GPU nodes have picked it up yet — the market may be congested.";
    case "RUNNING":
      return "Deployment is running normally. If you're experiencing issues, the problem may be application-level.";
    default:
      return `Deployment is in an unexpected state: ${status}.`;
  }
}

function getSeverity(status: string): "low" | "medium" | "high" | "critical" {
  switch (status) {
    case "RUNNING":
      return "low";
    case "QUEUED":
      return "medium";
    case "STOPPED":
      return "medium";
    case "FAILED":
      return "high";
    default:
      return "critical";
  }
}

function getSuggestedActions(status: string, logs: string): DiagnosisResult["suggestedActions"] {
  const lower = logs.toLowerCase();
  const actions: DiagnosisResult["suggestedActions"] = [];

  if (status === "FAILED" || status === "STOPPED") {
    actions.push({
      action: "Restart deployment",
      tool: "doctor.restart",
      description: "Create a fresh deployment with the same configuration.",
      priority: "immediate",
    });
  }

  if (lower.includes("out of memory") || lower.includes("oom") || lower.includes("cuda out of memory")) {
    actions.push({
      action: "Upgrade GPU tier",
      tool: "deployer.get_gpu_markets",
      description: "Select a GPU market with more VRAM and redeploy.",
      priority: "immediate",
    });
  }

  if (lower.includes("module not found") || lower.includes("no module named")) {
    actions.push({
      action: "Fix requirements.txt",
      tool: "analyst.analyze_project",
      description: "Re-analyze the project to identify missing dependencies, then update requirements.txt.",
      priority: "immediate",
    });
  }

  if (lower.includes("download failed") || lower.includes("all attempts failed")) {
    actions.push({
      action: "Re-upload artifact",
      tool: "deployer.upload_artifact",
      description: "Re-package and upload the project artifact to IPFS.",
      priority: "immediate",
    });
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    actions.push({
      action: "Extend timeout",
      tool: "doctor.update_timeout",
      description: "Increase the deployment timeout to give the application more time to start.",
      priority: "recommended",
    });
  }

  if (status === "QUEUED") {
    actions.push({
      action: "Check market congestion",
      tool: "deployer.check_market",
      description: "Verify the GPU market isn't congested. Consider switching to a different market.",
      priority: "recommended",
    });
  }

  // Always suggest viewing full logs if not already
  if (status !== "RUNNING") {
    actions.push({
      action: "View full logs",
      tool: "monitor.deployment_logs",
      description: "Retrieve the complete execution logs for detailed analysis.",
      priority: "optional",
    });
  }

  return actions;
}
