import { getNosanaClient } from "../nosana/client.js";

export async function checkMarketQueue(marketAddress: string) {
  try {
    const client = getNosanaClient();
    if (!client.api) {
      throw new Error("Nosana API client not initialized. Require NOSANA_API_KEY.");
    }
    
    // We fetch jobs in the QUEUED state for the selected market
    const queuedQuery = await fetch(`https://dashboard.k8s.prd.nos.ci/api/jobs?market=${marketAddress}&state=QUEUED`);
    if (!queuedQuery.ok) {
       throw new Error(`Failed to query market history: ${queuedQuery.status}`);
    }
    
    const queuedData = await queuedQuery.json();
    
    // Some APIs wrap it in 'data', others just return the array
    const queuedJobs = Array.isArray(queuedData) ? queuedData : (queuedData.data || []);
    
    const queueLength = queuedJobs.length;

    return JSON.stringify({
      marketAddress,
      isCongested: queueLength > 2,
      queueLength,
      message: queueLength === 0 
        ? "✅ Market is fully available for immediate execution. Highly recommended."
        : queueLength > 2
          ? `⚠️ Market is highly congested with ${queueLength} active jobs waiting. Consider falling back to another market if speed is critical.`
          : `⏳ Market has a small waiting queue (${queueLength} jobs).`
    }, null, 2);

  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message }, null, 2);
  }
}
