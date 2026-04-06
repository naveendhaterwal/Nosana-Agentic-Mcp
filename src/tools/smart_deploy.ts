import fs from "fs";
import path from "path";
import { getGpuOptions } from "./get_gpu_options.js";
import { uploadArtifact } from "./upload_artifact.js";
import { postJobDefinition } from "./post_job_definition.js";
import { getDeploymentStatus } from "./get_deployment_status.js";
import { getNosanaClient } from "../nosana/client.js";
import { getJobLogs } from "./get_job_logs.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

import { validatePath } from "./path_utils.js";
import { detectAppType, getBucketedMarkets, GpuTier, DurationChoice } from "./get_deployment_options.js";

export interface SmartDeployOptions {
  projectPath: string;
  gpuTier: GpuTier;
  duration: DurationChoice;
  customTimeoutMinutes?: number;
  // Optional override for artifact URL (skips packaging step)
  artifactUrl?: string;
  // App name shown on Nosana dashboard
  appName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Note: detectAppType and getBucketedMarkets moved to get_deployment_options.ts

/** Build the proven, validated Streamlit job definition (minified). */
function buildStreamlitJobDef(
  artifactUrl: string,
  entryFile: string,
  requiresNewPython: boolean,
  requiredVram: number
): object {
  const image = "python:3.11-slim"; // Validated default for modern Streamlit
    const fallbackUrl = artifactUrl.replace("ipfs.nosana.com", "cloudflare-ipfs.com");
    const ipfsIoUrl = artifactUrl.replace("ipfs.nosana.com", "ipfs.io");
    const downloadScript = `attempt=1; while [ $attempt -le 3 ]; do echo "📦 Downloading artifact (attempt $attempt)..."; if curl -fL "${artifactUrl}" -o /tmp/app.tar.gz || curl -fL "${fallbackUrl}" -o /tmp/app.tar.gz || curl -fL "${ipfsIoUrl}" -o /tmp/app.tar.gz; then break; fi; echo "❌ Download failed."; if [ $attempt -lt 3 ]; then echo "Wait 10s and retry..."; sleep 10; else echo "❌ All attempts failed. Exiting."; exit 1; fi; attempt=$((attempt + 1)); done`;
  
  return {
    version: "0.1",
    type: "container",
    meta: {
      trigger: "cli",
      system_resources: { required_vram: requiredVram },
      app_type: "streamlit",
    },
    ops: [
      {
        id: "streamlit-ui",
        type: "container/run",
        args: {
          image,
          gpu: true,
          entrypoint: ["/bin/sh", "-c"],
          cmd: [
            `set -eu; echo "🚀 Starting Nosana Container..."; (command -v curl >/dev/null && command -v tar >/dev/null) || (apt-get update && apt-get install -y curl ca-certificates tar); mkdir -p /workspace/app && ${downloadScript} && echo "📂 Extracting..."; tar -xzf /tmp/app.tar.gz -C /workspace/app && cd /workspace/app && echo "🐍 Installing dependencies (this may take 2-4 mins)..."; pip install --no-cache-dir --upgrade pip && (if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi) && echo "✨ Starting Streamlit UI on port 8000..."; exec python -m streamlit run ${entryFile} --server.port 8000 --server.address 0.0.0.0 --server.headless true`,
          ],
          work_dir: "/workspace",
          expose: [{ port: 8000, type: "web" }],
          env: { PORT: "8000", TERM: "xterm" },
        },
      },
    ],
  };
}

/** Build a generic Python / FastAPI / Flask job definition. */
function buildGenericPythonJobDef(
  artifactUrl: string,
  appType: "fastapi" | "flask" | "python",
  entryFile: string,
  requiresNewPython: boolean,
  requiredVram: number
): object {
  const image = "python:3.11-slim";
  const fallbackUrl = artifactUrl.replace("ipfs.nosana.com", "cloudflare-ipfs.com");
  const ipfsIoUrl = artifactUrl.replace("ipfs.nosana.com", "ipfs.io");
  const downloadScript = `attempt=1; while [ $attempt -le 3 ]; do echo "📦 Downloading artifact (attempt $attempt)..."; if curl -fL "${artifactUrl}" -o /tmp/app.tar.gz || curl -fL "${fallbackUrl}" -o /tmp/app.tar.gz || curl -fL "${ipfsIoUrl}" -o /tmp/app.tar.gz; then break; fi; echo "❌ Download failed."; if [ $attempt -lt 3 ]; then echo "Wait 10s and retry..."; sleep 10; else echo "❌ All attempts failed. Exiting."; exit 1; fi; attempt=$((attempt + 1)); done`;

  let runCmd: string;
  if (appType === "fastapi") {
    runCmd = `uvicorn ${entryFile.replace(".py", "")}:app --host 0.0.0.0 --port 8000`;
  } else if (appType === "flask") {
    runCmd = `python ${entryFile}`;
  } else {
    runCmd = entryFile ? `python ${entryFile}` : `python -m http.server 8000`;
  }

  return {
    version: "0.1",
    type: "container",
    meta: {
      trigger: "cli",
      system_resources: { required_vram: requiredVram },
      app_type: appType,
    },
    ops: [
      {
        id: `${appType}-api`,
        type: "container/run",
        args: {
          image,
          gpu: false,
          entrypoint: ["/bin/sh", "-c"],
          cmd: [
            `set -eu; (command -v curl >/dev/null && command -v tar >/dev/null) || (apt-get update && apt-get install -y curl ca-certificates tar); mkdir -p /workspace/app && ${downloadScript} && echo "📂 Extracting..."; tar -xzf /tmp/app.tar.gz -C /workspace/app && cd /workspace/app && pip install --no-cache-dir --upgrade pip && (if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi) && exec ${runCmd}`,
          ],
          work_dir: "/workspace",
          expose: [{ port: 8000, type: "api" }],
          env: { PORT: "8000", TERM: "xterm" },
        },
      },
    ],
  };
}

/** Poll until HTTP 200 or timeout. Returns the url if reachable. */
async function pollEndpoint(
  url: string,
  maxWaitMs = 600_000,
  intervalMs = 15_000
): Promise<{ reachable: boolean; finalUrl: string; lastError?: string; lastStatus?: number }> {
  const deadline = Date.now() + maxWaitMs;
  let lastError = "";
  let lastStatus = 0;
  
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      lastStatus = res.status;
      if (res.status === 200 || res.status === 302) return { reachable: true, finalUrl: url, lastStatus };
      lastError = `Received status ${res.status}`;
    } catch (err: any) {
      lastError = err.message;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { reachable: false, finalUrl: url, lastError, lastStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tool: smart_deploy
 *
 * Performs the actual Nosana deployment once you have the mandatory answers 
 * from the user for GPU selection and Duration.
 */
export async function smartDeploy(opts: SmartDeployOptions): Promise<string> {
  const { projectPath, gpuTier, duration, customTimeoutMinutes, artifactUrl: overrideArtifactUrl, appName } = opts;

  if (!gpuTier || !duration) {
    throw new Error("Missing mandatory parameters: gpuTier and duration. You must ask the user these questions first using get_deployment_options.");
  }

  // ── Step 1: Detect App ────────────────────────────────────────────────────
  const { exists, absPath, errorResponse } = validatePath(projectPath);
  if (!exists) {
    return JSON.stringify(errorResponse, null, 2);
  }

  const app = detectAppType(absPath);

  if (app.type === "unsupported") {
    return JSON.stringify({
      success: false,
      phase: "detect",
      error: "Could not detect a supported app type. Ensure the project has a requirements.txt with streamlit, fastapi, flask, or other Python framework.",
    }, null, 2);
  }

  // ── PHASE 2: Full Deployment Pipeline ────────────────────────────────────

  // ── PHASE 2: Full Deployment Pipeline ────────────────────────────────────

  // 2a. Resolve market + strategy + timeout
  let markets: any;
  try {
    markets = await getBucketedMarkets();
  } catch (err: any) {
    return JSON.stringify({ success: false, phase: "market", error: err.message }, null, 2);
  }

  const selectedMarket =
    gpuTier === "cheapest" ? markets.cheapest
    : gpuTier === "balanced" ? markets.balanced
    : markets.performance;

  // NOTE: SIMPLE-EXTEND causes Nosana to spin up 2 workers simultaneously (one extending the other).
  // Always use SIMPLE to ensure only 1 job runs at a time.
  const strategy = "SIMPLE";

  const timeoutMinutes =
    duration === "custom" ? (customTimeoutMinutes ?? 60)
    : duration === "keep" ? 120
    : 60;

  const requiredVram = selectedMarket.memoryGb <= 8 ? 4 : selectedMarket.memoryGb <= 16 ? 8 : 16;

  // 2b. Package & upload artifact (unless overrideArtifactUrl provided)
  let artifactUri = overrideArtifactUrl ?? "";
  let artifactFallbackUri = "";

  if (!overrideArtifactUrl) {
    let uploadResult: any;
    try {
      const raw = await uploadArtifact(projectPath);
      uploadResult = JSON.parse(raw);
    } catch (err: any) {
      return JSON.stringify({ success: false, phase: "upload", error: `Artifact packaging failed: ${err.message}` }, null, 2);
    }

    if (!uploadResult.success) {
      return JSON.stringify({ success: false, phase: "upload", error: uploadResult.error || "Unknown upload failure" }, null, 2);
    }

    artifactUri = uploadResult.uri;
    artifactFallbackUri = uploadResult.fallbackUri ?? artifactUri.replace("ipfs.nosana.com", "cloudflare-ipfs.com");
  }

  // 2c. Build the validated job definition
  let jobDefinition: object;
  if (app.type === "streamlit") {
    jobDefinition = buildStreamlitJobDef(artifactUri, app.entryFile, app.requiresNewPython, requiredVram);
  } else if (app.type === "fastapi" || app.type === "flask" || app.type === "python") {
    jobDefinition = buildGenericPythonJobDef(artifactUri, app.type as any, app.entryFile, app.requiresNewPython, requiredVram);
  } else {
    return JSON.stringify({ success: false, phase: "compose", error: "App type not supported for automated deployment." }, null, 2);
  }

  const deploymentName = appName ?? `${app.type}-app-${Date.now()}`;

  // 2d. Submit deployment
  let postResult: any;
  try {
    const raw = await postJobDefinition(
      JSON.stringify(jobDefinition),
      selectedMarket.address,
      timeoutMinutes,
      deploymentName,
      strategy
    );
    postResult = JSON.parse(raw);
  } catch (err: any) {
    return JSON.stringify({ success: false, phase: "deploy", error: `Deployment submission failed: ${err.message}` }, null, 2);
  }

  if (!postResult.success) {
    return JSON.stringify({ 
      success: false, 
      phase: "deploy", 
      error: postResult.error || "Submission rejected",
      formattedError: postResult.formattedError,
      details: postResult.details
    }, null, 2);
  }

  const deploymentId = postResult.deploymentId;
  const jobId = postResult.jobId;

  // 2e. Poll deployment status until RUNNING
  let liveUrl = "";
  let jobStatus = "QUEUED";
  const pollDeadline = Date.now() + 300_000; // 5 min to get RUNNING

  while (Date.now() < pollDeadline && jobStatus !== "RUNNING") {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      const statusRaw = await getDeploymentStatus(deploymentId || jobId);
      const statusData = JSON.parse(statusRaw);
      jobStatus = statusData.status ?? statusData.jobStatus ?? "UNKNOWN";
      liveUrl = statusData.liveUrl ?? "";
      if (jobStatus === "FAILED" || jobStatus === "STOPPED") break;
    } catch {
      // keep polling
    }
  }

  if (!liveUrl && jobId && jobId !== "pending") {
    liveUrl = `https://${jobId}.node.k8s.prd.nos.ci`;
  }

  // 2f. If job reached a terminal failure, fetch logs immediately
  let failureLogs: string | undefined;
  if (jobStatus === "FAILED" || jobStatus === "STOPPED") {
    try {
      const logsRaw = await getJobLogs(jobId || deploymentId);
      const logsData = JSON.parse(logsRaw);
      if (logsData.logs) failureLogs = logsData.logs;
    } catch {
      // non-fatal
    }
  }

  // 2g. Poll the endpoint URL for HTTP 200
  let endpointReachable = false;
  let endpointLastError: string | undefined;
  let endpointLastStatus: number | undefined;

  if (liveUrl && jobStatus === "RUNNING") {
    const ping = await pollEndpoint(liveUrl, 600_000, 15_000);
    endpointReachable = ping.reachable;
    liveUrl = ping.finalUrl;
    endpointLastError = ping.lastError;
    endpointLastStatus = ping.lastStatus;
  }

  // 2h. If endpoint never became reachable, fetch container logs for diagnosis
  if (!endpointReachable && !failureLogs && (jobId || deploymentId)) {
    try {
      const logsRaw = await getJobLogs(jobId || deploymentId);
      const logsData = JSON.parse(logsRaw);
      // Only surface logs if job has actually finished (COMPLETED/FAILED/STOPPED)
      if (logsData.logs && logsData.status !== "RUNNING" && logsData.status !== "QUEUED") {
        failureLogs = logsData.logs;
      }
    } catch {
      // non-fatal
    }
  }

  // 2i. Final response
  const isSuccess = jobStatus === "RUNNING" || endpointReachable;
  return JSON.stringify({
    success: isSuccess,
    phase: "complete",
    liveUrl: endpointReachable ? liveUrl : (liveUrl || "Not reachable yet"),
    deploymentId: deploymentId || "unknown",
    jobId: jobId || "unknown",
    gpu: { tier: gpuTier, name: selectedMarket.name, vram: selectedMarket.memoryGb, market: selectedMarket.address },
    strategy,
    timeoutMinutes,
    appType: app.type,
    endpointReachable,
    jobStatus,
    trackingUrl: `https://dashboard.nosana.com/deployments/${deploymentId}`,
    failureReason: !isSuccess ? `Job ended in state: ${jobStatus}${endpointLastError ? ` | HTTP: ${endpointLastStatus} – ${endpointLastError}` : ""}` : undefined,
    failureLogs: failureLogs ?? undefined,
    message: endpointReachable
      ? `🎉 Your ${app.type} app is live!\n\n🌐 URL: ${liveUrl}\n🆔 Deployment: ${deploymentId}\n🖥️ GPU: ${selectedMarket.name} (${selectedMarket.memoryGb}GB)\n📊 Strategy: ${strategy} · Timeout: ${timeoutMinutes}min`
      : [
          `⏳ Deployment started but endpoint not yet reachable.`,
          ``,
          `🔗 Expected URL: ${liveUrl}`,
          `📊 Dashboard: https://dashboard.nosana.com/deployments/${deploymentId}`,
          `🩺 Job Status: ${jobStatus}`,
          failureLogs ? `\n📋 Container Logs:\n${"-".repeat(60)}\n${failureLogs.slice(0, 3000)}` : ``,
          ``,
          `Call get_job_logs with jobId for full logs, or get_deployment_status to monitor progress.`,
        ].filter(Boolean).join("\n"),
  }, null, 2);
}
