import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: update_timeout
 * description: Updates the timeout (in hours) for an existing Nosana deployment.
 */
export async function updateTimeout(deploymentId: string, timeoutHours: number) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    const timeoutMinutes = Math.floor(timeoutHours * 60);

    if (deployment.timeout === timeoutMinutes) {
      return JSON.stringify({
        success: true,
        message: `Deployment already has a timeout of ${timeoutHours} hours (${timeoutMinutes} minutes). No changes made.`,
        deploymentId,
        timeoutHours,
        timeoutMinutes
      }, null, 2);
    }

    await deployment.updateTimeout(timeoutMinutes); // Pass minutes directly

    return JSON.stringify({
      success: true,
      message: `Updated timeout for ${deploymentId} to ${timeoutHours} hours (${timeoutMinutes} minutes).`,
      deploymentId,
      timeoutHours,
      timeoutMinutes
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
