import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: update_replicas
 * description: Updates the number of replicas for an existing Nosana deployment.
 */
export async function updateReplicas(deploymentId: string, replicas: number) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    if (deployment.replicas === replicas) {
      return JSON.stringify({
        success: true,
        message: `Deployment already has ${replicas} replicas. No changes made.`,
        deploymentId,
        replicas
      }, null, 2);
    }

    await deployment.updateReplicaCount(replicas);

    return JSON.stringify({
      success: true,
      message: `Updated replicas for ${deploymentId} to ${replicas}.`,
      deploymentId,
      replicas
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
