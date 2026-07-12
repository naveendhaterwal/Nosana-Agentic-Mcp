import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: extend_job
 * description: Extends the timeout of an active Nosana job via the SDK.
 */
export async function extendJob(jobAddress: string, timeoutSeconds: number) {
  try {
    const nosana = getNosanaClient();
    let job;
    try {
      job = await nosana.jobs.get(jobAddress);
    } catch (e: any) {
      throw new Error(`Failed to retrieve job ${jobAddress}: ${e.message}`);
    }

    if (!job) {
      throw new Error(`Job ${jobAddress} not found.`);
    }

    if (job.state === "COMPLETED" || job.state === "STOPPED") {
      return JSON.stringify({
        success: false,
        message: `Job is already ${job.state}. Cannot extend.`,
        jobAddress
      }, null, 2);
    }

    // Attempt to extend
    if (nosana.api) {
      await nosana.api.jobs.extend({
        jobAddress,
        seconds: timeoutSeconds,
      });
    } else {
      await nosana.jobs.extend(jobAddress, timeoutSeconds);
    }

    return JSON.stringify({
      success: true,
      message: `Job ${jobAddress} has been successfully extended by ${timeoutSeconds} seconds.`,
      jobAddress
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
