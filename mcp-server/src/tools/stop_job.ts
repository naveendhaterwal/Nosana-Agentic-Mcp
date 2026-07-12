import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: stop_job
 * description: Stops an active Nosana job via the SDK.
 */
export async function stopJob(jobAddress: string) {
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
        success: true,
        message: `Job is already ${job.state}.`,
        jobAddress
      }, null, 2);
    }

    // Attempt to stop
    if (nosana.api) {
      await nosana.api.jobs.stop({ jobAddress });
    } else {
      if (job.state === "QUEUED") {
        await nosana.jobs.delist(jobAddress);
      } else if (job.state === "RUNNING") {
        await nosana.jobs.end(jobAddress);
      }
    }

    return JSON.stringify({
      success: true,
      message: `Job ${jobAddress} has been successfully stopped.`,
      jobAddress
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
