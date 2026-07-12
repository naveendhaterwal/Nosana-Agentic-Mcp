import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: stop_deployment
 * description: Stops an active Nosana deployment.
 */
export async function stopDeployment(deploymentId: string) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    if (deployment.status === "STOPPED" || deployment.status === "STOPPING") {
      return JSON.stringify({
        success: true,
        message: `Deployment is already ${deployment.status}.`,
        deploymentId
      }, null, 2);
    }

    await deployment.stop();

    return JSON.stringify({
      success: true,
      message: `Deployment ${deploymentId} has been stopped.`,
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
