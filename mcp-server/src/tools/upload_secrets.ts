import { getNosanaClient } from "../nosana/client.js";
import fs from "fs";

/**
 * tool: upload_secrets
 * description: Uploads a secrets file (like .env) to IPFS to be used in a job definition.
 */
export async function uploadSecrets(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
       throw new Error(`Path ${filePath} is a directory. Please provide a file.`);
    }

    const nosana = getNosanaClient();
    
    // Upload the file using the IPFS gateway configured in the SDK
    const ipfsHash = await nosana.ipfs.pinFile(filePath);
    const url = nosana.ipfs.config.gateway + ipfsHash;

    return JSON.stringify({
      success: true,
      message: `File successfully uploaded.`,
      ipfsHash,
      url
    }, null, 2);

  } catch (err: any) {
    return JSON.stringify({ 
      success: false, 
      error: err.message,
    }, null, 2);
  }
}
