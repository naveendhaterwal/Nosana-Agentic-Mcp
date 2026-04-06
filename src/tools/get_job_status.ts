import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: get_job_status
 * description: Checks the live status of a Nosana job and resolves the service URL.
 */
export async function getJobStatus(jobId: string) {
  const client = getNosanaClient();
  if (!client.api) {
    throw new Error("Nosana API client is required. Please set NOSANA_API_KEY.");
  }

  try {
    // 1. Fetch job data
    const res = await client.api.jobs.get(jobId);
    
    // Status resolution (Nosana uses numeric states often mapped to labels)
    // 0: QUEUED, 1: RUNNING, 2: COMPLETED, 3: FAILED
    const statusMap = ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "STOPPED"];
    const status = statusMap[res.state] || "UNKNOWN";
    
    // If RUNNING, calculate the public URL
    // Standard Nosana pattern: https://<job-id>.node.k8s.prd.nos.ci
    // Note: The port depends on the 'expose' config, but usually 8000
    const serviceUrl = status === "RUNNING" 
                       ? `https://${jobId}.node.k8s.prd.nos.ci` 
                       : "Not available yet";

    return JSON.stringify({
      success: true,
      jobId: jobId,
      status: status,
      node: res.node || "Pending assignment",
      serviceUrl: serviceUrl,
      timestamp: new Date().toISOString(),
      message: `📊 Job is currently **${status}**.` + 
               (status === "RUNNING" ? `\n\n🌐 Live UI/API: ${serviceUrl}` : `\n\n⏳ Waiting for node assignment...`)
    }, null, 2);

  } catch (err: any) {
    throw new Error(`Failed to fetch job status: ${err.message}`);
  }
}
