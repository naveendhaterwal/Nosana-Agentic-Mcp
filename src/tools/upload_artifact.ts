import { getNosanaClient } from "../nosana/client.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";

/**
 * tool: upload_artifact
 * description: Packages a local directory as a .tar.gz and pins it to Nosana IPFS.
 * returns: The IPFS CID of the uploaded artifact.
 */
export async function uploadArtifact(folderPath: string) {
  const absolutePath = path.resolve(folderPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Path ${absolutePath} does not exist.`);
  }

  const client = getNosanaClient();
  
  // Create a project-local temporary directory
  const localTmpDir = path.join(absolutePath, ".nosana-tmp");
  if (!fs.existsSync(localTmpDir)) {
    fs.mkdirSync(localTmpDir, { recursive: true });
  }

  const tarName = `nosana-artifact-${Date.now()}.tar.gz`;
  const tarPath = path.join(localTmpDir, tarName);

  try {
    console.error(`📦 Packaging ${absolutePath}...`);
    
    // We use -C to change directory so the tarball doesn't contain the full path
    // We also exclude node_modules, .git, and common cache folders
    execSync(
      `tar -czf "${tarPath}" -C "${absolutePath}" --exclude='.nosana-tmp' --exclude='node_modules' --exclude='.git' --exclude='.next' --exclude='__pycache__' .`,
      { stdio: "inherit" }
    );

    console.error(`🚀 Uploading ${tarName} to Nosana IPFS...`);
    
    // Use the official pinFile method from Nosana SDK
    const ipfsHash = await client.ipfs.pinFile(tarPath);
    
    // Cleanup local temp file
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }
    // Cleanup local temp directory if empty
    try {
      if (fs.readdirSync(localTmpDir).length === 0) {
        fs.rmdirSync(localTmpDir);
      }
    } catch {
      // ignore
    }

    return JSON.stringify({
      success: true,
      cid: ipfsHash,
      uri: `https://ipfs.nosana.com/ipfs/${ipfsHash}`,
      fallbackUri: `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
      ipfsIoUri: `https://ipfs.io/ipfs/${ipfsHash}`,
      filename: tarName,
      message: `✅ Artifact uploaded successfully. Primary: https://ipfs.nosana.com/ipfs/${ipfsHash}`
    }, null, 2);

  } catch (err: any) {
    // Attempt cleanup even on failure
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }
    try {
      if (fs.existsSync(localTmpDir) && fs.readdirSync(localTmpDir).length === 0) {
        fs.rmdirSync(localTmpDir);
      }
    } catch {
      // ignore
    }
    throw new Error(`Failed to upload artifact: ${err.message}`);
  }
}
