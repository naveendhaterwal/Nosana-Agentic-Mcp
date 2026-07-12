import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: post_job_definition
 * description: Submits a generic JobDefinition to a specified Nosana market.
 *              This is the "raw" version of deploy_model that doesn't inject templates.
 */
export async function postJobDefinition(
  jobDefinitionJson: string, 
  marketAddress: string, 
  timeout: number = 60,
  name: string = "Generic App Job",
  strategy: string = "SIMPLE"
) {
  const client = getNosanaClient();
  if (!client.api) {
    throw new Error("Nosana API client is required. Please set NOSANA_API_KEY.");
  }

  let jobDefinition;
  try {
    jobDefinition = JSON.parse(jobDefinitionJson);
    // Safety check: ensure strategy is not inside job_definition if it's top-level
    if (jobDefinition.strategy) delete jobDefinition.strategy;
  } catch (err: any) {
    throw new Error(`Invalid JobDefinition JSON: ${err.message}`);
  }

  try {
    // 1. Pin to IPFS for auditability
    const ipfsHash = await client.ipfs.pin(jobDefinition);

    // 2. Create the deployment
    const deploymentConfig: any = {
      name: name,
      market: marketAddress,
      replicas: 1, 
      timeout: Math.max(timeout, 15),
      strategy: strategy, 
      job_definition: jobDefinition
    };

    let res: any;
    try {
      res = await client.api.deployments.create(deploymentConfig);
    } catch (err: any) {
      // Automatic retry for 400 Bad Request
      if (err.message?.includes("400") || err.message?.toLowerCase().includes("bad request")) {
        console.error("⚠️ Bad Request detected. Retrying with SIMPLE strategy as fallback...");
        deploymentConfig.strategy = "SIMPLE";
        res = await client.api.deployments.create(deploymentConfig);
      } else {
        throw err;
      }
    }
    
    const deploymentId = res.address || res.id || "pending";
    const jobId = res.jobs?.[0]?.job?.address || "pending";
    const trackingUrl = `https://dashboard.nosana.com/deployments/${deploymentId}`;

    return JSON.stringify({
      success: true,
      deploymentId: deploymentId,
      jobId: jobId,
      ipfsHash: ipfsHash,
      trackingUrl: trackingUrl,
      strategy: deploymentConfig.strategy,
      message: `🚀 Job posted successfully to market ${marketAddress} with strategy ${deploymentConfig.strategy}.\n\n📊 Status: QUEUED\n🆔 Job ID: ${jobId}\n🌐 Tracking: ${trackingUrl}`
    }, null, 2);

  } catch (err: any) {
    let detail = err.message;
    const responseData = err.response?.data || err.data;
    
    if (responseData) {
      detail = JSON.stringify(responseData, null, 2);
    }
    
    // If it's a specific validation error, make it pretty
    if (responseData?.errors) {
      detail = responseData.errors.map((e: any) => `${e.path || "general"}: ${e.message}`).join("\n");
    } else if (responseData?.message) {
      detail = responseData.message;
    }

    return JSON.stringify({
      success: false,
      error: `Deployment rejected: ${err.message}`,
      details: responseData || err.message,
      formattedError: detail,
      message: `❌ Deployment failed.\n\nReason: ${detail}`
    }, null, 2);
  }
}
