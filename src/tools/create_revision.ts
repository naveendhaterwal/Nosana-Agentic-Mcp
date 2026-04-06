import { getNosanaClient } from "../nosana/client.js";
import { JobDefinition } from "@nosana/types";

/**
 * tool: create_revision
 * description: Creates a new revision for an existing Nosana deployment.
 *              You can provide a full job definition or a partial one to override fields.
 */
export async function createRevision(deploymentId: string, jobDefinition: any) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    // If jobDefinition is a string, parse it
    let newDefinition: JobDefinition;
    if (typeof jobDefinition === "string") {
      newDefinition = JSON.parse(jobDefinition);
    } else {
      newDefinition = jobDefinition;
    }

    // Optional: If the user provided a partial definition, we might want to merge with current.
    // However, the Nosana SDK's createRevision usually expects a full JobDefinition.
    // We'll trust the user or the agent to provide the full definition for now,
    // or we could fetch the latest job's definition to merge.
    
    // Fetch latest job definition to merge if necessary (improving developer UX)
    const jobsResult = await deployment.getJobs({ limit: 1 });
    if (jobsResult.jobs && jobsResult.jobs.length > 0) {
      const latestJob = await deployment.getJob(jobsResult.jobs[0].id);
      if (latestJob && latestJob.jobDefinition) {
        // Simple shallow merge of top-level fields if newDefinition is partial
        // Note: Real merging of nested job definitions is complex. 
        // We'll perform a basic merge of 'ops' and 'resources' if they are missing.
        newDefinition = {
          ...latestJob.jobDefinition,
          ...newDefinition
        };
      }
    }

    await deployment.createRevision(newDefinition);

    return JSON.stringify({
      success: true,
      message: `New revision created for deployment ${deploymentId}.`,
      deploymentId
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
