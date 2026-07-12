import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: get_deployment_events
 * description: Retrieves a timeline of events (state changes, errors) for a specific Nosana deployment.
 */
export async function getDeploymentEvents(deploymentId: string, limit: number = 20) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const deployment = await client.api.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found.`);
    }

    const eventsResult = await deployment.getEvents({ limit: limit as any });
    const events = eventsResult.events || [];

    return JSON.stringify({
      success: true,
      deploymentId,
      events: events.map((e: any) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        payload: e.payload,
        createdAt: e.created_at
      })),
      pagination: {
        total: eventsResult.total_items,
        nextCursor: eventsResult.nextPage ? true : false
      }
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
      code: err.status || err.code 
    }, null, 2);
  }
}
