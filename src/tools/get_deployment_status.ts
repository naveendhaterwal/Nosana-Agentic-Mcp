import { getNosanaClient } from "../nosana/client.js";

const STATE_MAP: Record<number, string> = {
  0: "QUEUED",
  1: "RUNNING",
  2: "COMPLETED",
  3: "STOPPED",
  4: "FAILED"
};

export async function getDeploymentStatus(id: string, checkHealth: boolean = false) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }
    
    let result: any;
    let isDeployment = false;

    try {
      // Try fetching as a deployment first (new Enterprise path)
      result = await client.api.deployments.get(id);
      isDeployment = true;
    } catch (e) {
      // Fallback to Job fetch
      result = await client.api.jobs.get(id);
    }

    if (isDeployment) {
      const deployment = result;
      const status = deployment.status || "UNKNOWN";
      const dashboardUrl = `https://dashboard.nosana.com/deployments/${id}`;
      const runningJobs = deployment.jobs?.filter((j: any) => j.job?.state === 1) || [];

      let apiUrl = "";
      if (runningJobs.length > 0) {
        apiUrl = `https://${runningJobs[0].job.address}.node.k8s.prd.nos.ci`;
      }

      let healthStatus: any = undefined;
      if (checkHealth && apiUrl && status === "RUNNING") {
        try {
          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
          healthStatus = { status: res.status, ok: res.ok };
        } catch (err: any) {
          healthStatus = { ok: false, error: err.message };
        }
      }

      let message = `Deployment "${deployment.name}" is ${status}.\n📊 Dashboard: ${dashboardUrl}\n👥 Replicas: ${deployment.replicas}\n🏃 Running Jobs: ${runningJobs.length}`;
      if (apiUrl) message += `\n🔗 Live API: ${apiUrl}`;
      if (healthStatus) message += healthStatus.ok ? `\n✅ Health Check: HTTP ${healthStatus.status}` : `\n❌ Health Check: ${healthStatus.error || `HTTP ${healthStatus.status}`}`;

      return JSON.stringify({
        success: true,
        type: "deployment",
        deploymentId: id,
        status,
        replicas: deployment.replicas,
        activeJobs: runningJobs.length,
        dashboardUrl,
        apiUrl,
        health: healthStatus,
        message
      }, null, 2);

    } else {
      // Logic for single Job ID
      const job = result;
      const status = typeof job.state === 'number' ? (STATE_MAP[job.state] || "UNKNOWN") : job.state;
      const dashboardUrl = `https://dashboard.nosana.com/jobs/${id}`;

      let apiUrl = "";
      if (status === "RUNNING") {
        apiUrl = `https://${id}.node.k8s.prd.nos.ci`;
      }

      let healthStatus: any = undefined;
      if (checkHealth && apiUrl && status === "RUNNING") {
        try {
          const res = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
          healthStatus = { status: res.status, ok: res.ok };
        } catch (err: any) {
          healthStatus = { ok: false, error: err.message };
        }
      }

      let message = `Job is currently ${status}.\n📊 Dashboard: ${dashboardUrl}`;
      if (apiUrl) message += `\n🔗 Live API: ${apiUrl}`;
      if (healthStatus) message += healthStatus.ok ? `\n✅ Health Check: HTTP ${healthStatus.status}` : `\n❌ Health Check: ${healthStatus.error || `HTTP ${healthStatus.status}`}`;

      return JSON.stringify({
        success: true,
        type: "job",
        jobId: id,
        status,
        dashboardUrl,
        apiUrl,
        health: healthStatus,
        message
      }, null, 2);
    }

  } catch (err: any) {
    return JSON.stringify({ success: false, error: err.message }, null, 2);
  }
}
