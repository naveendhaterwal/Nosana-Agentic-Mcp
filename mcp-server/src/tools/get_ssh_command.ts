import { getNosanaClient } from "../nosana/client.js";

/**
 * tool: get_ssh_command
 * description: Retrieves the SSH command for a running job, enabling local debugging.
 */
export async function getSshCommand(jobAddress: string) {
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

    if (job.state !== "RUNNING") {
      return JSON.stringify({
        success: false,
        message: `Job must be RUNNING to SSH. Current state: ${job.state}`,
        jobAddress
      }, null, 2);
    }

    if (!job.node) {
       return JSON.stringify({
        success: false,
        message: `Job ${jobAddress} does not have an assigned node yet.`,
        jobAddress
      }, null, 2);
    }

    // Rather than dealing with ephemeral keys inside the MCP, we provide the CLI command
    // that the LLM/user can run in their local terminal to initialize the SSH session via nosana-cli
    const cliCommand = `npx @nosana/cli job ssh ${jobAddress}`;

    return JSON.stringify({
      success: true,
      message: `Run the following command in your terminal to SSH into the job.`,
      cliCommand,
      jobAddress
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
