import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: restart_deployment
 * description: Restarts a stopped or failed deployment by creating a new one with the same configuration.
 */
export async function restartDeployment(deploymentId: string) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    // 1. Fetch the existing deployment metadata
    let deployment: any;
    try {
      deployment = await client.api.deployments.get(deploymentId);
    } catch (e) {
      // If get fails (e.g. invalid ID format), try searching by name
      const { deployments } = await client.api.deployments.list();
      const found = deployments.find((d: any) => d.name === deploymentId);
      if (found) {
        // Fetch full instance to ensure methods like getJobs() are available
        deployment = await client.api.deployments.get(found.id);
      }
    }

    if (!deployment) {
      throw new Error(`Deployment or Name '${deploymentId}' not found.`);
    }

    // 2. Resolve the Job Definition
    // Start with whatever is on the top-level deployment object
    let jobDefinition = deployment.job_definition;

    // If it's not explicitly on the top level (SDK version dependent), fetch from the latest job
    if (!jobDefinition) {
      const jobsResult = await deployment.getJobs({ limit: 1 });
      if (jobsResult.jobs && jobsResult.jobs.length > 0) {
        const latestJob = await deployment.getJob(jobsResult.jobs[0].id);
        if (latestJob && latestJob.jobDefinition) {
          jobDefinition = latestJob.jobDefinition;
        }
      }
    }

    if (!jobDefinition) {
      throw new Error(`Could not retrieve job definition for deployment ${deploymentId}. It may have been archived or deleted.`);
    }

    // 3. Create a fresh deployment with the same settings
    const deploymentConfig = {
      name: `${deployment.name} (Restarted)`,
      market: deployment.market,
      replicas: deployment.replicas,
      strategy: deployment.strategy,
      timeout: deployment.timeout, // Minutes
      job_definition: jobDefinition
    };

    const res = await client.api.deployments.create(deploymentConfig as any);

    const newDeploymentId = res.address || res.id || "pending";
    const trackingUrl = `https://dashboard.nosana.com/deployments/${newDeploymentId}`;

    return JSON.stringify({
      success: true,
      message: `✅ Deployment restarted successfully!`,
      originalDeploymentId: deploymentId,
      newDeploymentId: newDeploymentId,
      name: deploymentConfig.name,
      dashboardUrl: trackingUrl
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
