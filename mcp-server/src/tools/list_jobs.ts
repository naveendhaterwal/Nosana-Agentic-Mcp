import { getNosanaClient } from "../nosana/client.js";
import { envConfig } from "../config.js";

/**
 * tool: list_jobs
 * description: Retrieves a list of recent jobs for the configured wallet address.
 */
export async function listJobs(options?: { limit?: number; state?: string; market?: string }) {
  try {
    const nosana = getNosanaClient();
    let walletAddress: string;
    
    // Some setups may not have a local wallet (e.g., API key only), but we can derive it from the client
    if (nosana.solana && nosana.solana.wallet && nosana.solana.wallet.publicKey) {
      walletAddress = nosana.solana.wallet.publicKey.toString();
    } else {
      throw new Error("A local wallet must be configured to list your jobs.");
    }

    const network = envConfig.solana.network;
    const indexerUrl = network.includes("devnet") ? "https://api.devnet.nosana.io" : "https://api.nosana.io";

    const params = new URLSearchParams();
    params.set('poster', walletAddress);
    
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.state) params.set('state', options.state);
    if (options?.market) params.set('market', options.market);

    const url = `${indexerUrl}/jobs/?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch jobs from indexer: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.jobs) {
      throw new Error("Invalid response format from indexer.");
    }

    const stateMap: Record<number, string> = {
      0: 'QUEUED',
      1: 'RUNNING',
      2: 'COMPLETED',
      3: 'STOPPED',
    };

    const formattedJobs = data.jobs.map((job: any) => ({
      address: job.address,
      state: typeof job.state === 'number' ? (stateMap[job.state] || String(job.state)) : job.state,
      market: job.market,
      timeStart: job.timeStart ? new Date(job.timeStart * 1000).toISOString() : null,
      timeEnd: job.timeEnd ? new Date(job.timeEnd * 1000).toISOString() : null,
      price: job.price ? job.price / 1e6 : 0,
    }));

    return JSON.stringify({
      success: true,
      count: formattedJobs.length,
      jobs: formattedJobs,
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
