import { getNosanaClient } from "../nosana/client.js";
import { getJobLogs } from "./get_job_logs.js";

/**
 * tool: get_deployment_logs
 * description: Fetches logs for a Nosana deployment by aggregating logs from its jobs.
 */
export async function getDeploymentLogs(deploymentId: string, filters: { 
  jobId?: string, 
  opName?: string, 
  logLevel?: string, 
  searchText?: string, 
  tailLimit?: number 
} = {}) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    // 1. Identify jobs to fetch logs for
    let jobs: string[] = [];
    if (filters.jobId) {
      jobs = [filters.jobId];
    } else {
      // Get the 3 most recent jobs (active/failed/completed)
      const jobsResult = await deployment.getJobs({ limit: 3 });
      jobs = (jobsResult.jobs || []).map((j: any) => j.id);
    }

    if (jobs.length === 0) {
      return JSON.stringify({
        success: true,
        message: "No jobs found for this deployment.",
        logs: "",
        deploymentId
      }, null, 2);
    }

    // 2. Fetch logs for each job
    const allLogsLines: string[] = [];
    for (const id of jobs) {
      try {
        const logRes = await getJobLogs(id, filters);
        const parsed = JSON.parse(logRes);
        if (parsed.success && parsed.logs) {
          allLogsLines.push(`\n═══ Job ID: ${id} ═══`);
          allLogsLines.push(parsed.logs);
        }
      } catch (err: any) {
        allLogsLines.push(`\n═══ Job ID: ${id} ═══\nError fetching logs: ${err.message}`);
      }
    }

    return JSON.stringify({
      success: true,
      deploymentId,
      logs: allLogsLines.join("\n"),
      jobCount: jobs.length
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
