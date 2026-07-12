import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: get_deployment
 * description: Retrieves full details of a Nosana deployment by ID.
 */
export async function getDeployment(deploymentId: string) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    // Fetch active jobs to derive public URL and active count
    const jobsResult = await deployment.getJobs({ state: "RUNNING" });
    const activeJobs = jobsResult.jobs || [];

    const dashboardUrl = `https://dashboard.nosana.com/deployments/${deploymentId}`;
    let publicUrl = "";
    if (activeJobs.length > 0 && activeJobs[0].node) {
      // Standard Nosana node URL pattern
      publicUrl = `https://${activeJobs[0].node}.node.k8s.prd.nos.ci`;
    }

    return JSON.stringify({
      success: true,
      deploymentId,
      name: deployment.name,
      status: deployment.status,
      replicas: deployment.replicas,
      timeoutMinutes: deployment.timeout,
      strategy: deployment.strategy,
      activeJobs: activeJobs.length,
      dashboardUrl,
      publicUrl,
      createdAt: deployment.created_at,
      updatedAt: deployment.updated_at,
      raw: deployment // Include full raw data for machine reading
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
