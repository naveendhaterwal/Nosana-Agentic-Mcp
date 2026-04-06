import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: list_deployments
 * description: Lists all Nosana deployments for the authenticated user.
 */
export async function listDeployments(params: { 
  status?: string, 
  limit?: number,
  sort_order?: "asc" | "desc"
} = {}) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("API client not initialized. NOSANA_API_KEY required.");
    }

    const { deployments, pagination } = await client.api.deployments.list({
      status: params.status,
      limit: params.limit as any,
      sort_order: params.sort_order
    });

    const results = deployments.map((d: any) => ({
      deploymentId: d.id,
      name: d.name,
      status: d.status,
      replicas: d.replicas,
      timeoutMinutes: d.timeout,
      strategy: d.strategy,
      dashboardUrl: `https://dashboard.nosana.com/deployments/${d.id}`,
      createdAt: d.created_at,
      updatedAt: d.updated_at
    }));

    return JSON.stringify({
      success: true,
      deployments: results,
      pagination: {
        total: pagination.total_items,
        nextCursor: pagination.cursor_next
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
