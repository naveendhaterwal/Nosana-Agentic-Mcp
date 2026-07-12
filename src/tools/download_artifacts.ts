import { getNosanaClient } from "../nosana/client.js";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import * as tar from "tar";
import { Readable } from "stream";

/**
 * tool: download_artifacts
 * description: Downloads and extracts the output artifacts of a completed job.
 */
export async function downloadArtifacts(jobAddress: string, outputPath?: string) {
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

    if (job.state !== "COMPLETED") {
      throw new Error(`Job is not COMPLETED. Current state: ${job.state}`);
    }

    if (!job.ipfsResult) {
      throw new Error(`Job ${jobAddress} has no ipfsResult. It may not have uploaded any artifacts.`);
    }

    const ipfsHash = job.ipfsResult;
    
    // Download from IPFS
    const data = await nosana.ipfs.retrieve(ipfsHash, {
      responseType: 'arraybuffer',
    });

    const output = zlib.gunzipSync(data);
    const readable = new Readable();
    readable.push(output);
    readable.push(null);
    
    const outputFolder = outputPath || path.join(process.cwd(), `output-${ipfsHash}`);
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }
    
    // Await stream completion
    await new Promise((resolve, reject) => {
      const extract = tar.extract({ cwd: outputFolder });
      readable.pipe(extract);
      extract.on('finish', resolve);
      extract.on('error', reject);
    });

    return JSON.stringify({
      success: true,
      message: `Artifacts successfully downloaded and extracted to ${outputFolder}`,
      outputFolder,
      ipfsHash
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
