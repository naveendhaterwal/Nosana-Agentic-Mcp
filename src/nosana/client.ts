import { Keypair } from "@solana/web3.js";
import { Client } from "@nosana/sdk";
import fs from "fs";
import bs58 from "bs58";
import { envConfig } from "../config.js";
import { createNosanaClient, NosanaNetwork } from "@nosana/kit";

let nosanaClient: any = null;

// This returns either the standard SDK Client or the Kit Client based on what's configured
export function getNosanaClient() {
  if (nosanaClient) return nosanaClient;

  let wallet: Keypair | undefined;

  // Wallet auth setup
  let walletError: Error | null = null;
  
  try {
    if (envConfig.solana.keypairPath && envConfig.solana.keypairPath !== "/path/to/id.json") {
      const secret = JSON.parse(fs.readFileSync(envConfig.solana.keypairPath, "utf8"));
      wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
    } else if (envConfig.solana.privateKey && envConfig.solana.privateKey !== "your_private_key_here") {
      try {
        const secret = bs58.decode(envConfig.solana.privateKey);
        wallet = Keypair.fromSecretKey(secret);
      } catch {
        const arr = JSON.parse(envConfig.solana.privateKey);
        wallet = Keypair.fromSecretKey(Uint8Array.from(arr));
      }
    }
  } catch (err: any) {
    walletError = new Error(`Invalid wallet format provided: ${err.message}. Please provide a valid 64-byte JSON array or Base58 string.`);
  }

  // If we have an API key, @nosana/kit is highly recommended as it skips standard wallet tx signing
  if (envConfig.nosana.apiKey) {
    // Determine target network mapping correctly
    const network = envConfig.solana.network === "devnet" 
      ? NosanaNetwork.DEVNET 
      : NosanaNetwork.MAINNET;

    nosanaClient = createNosanaClient(network, {
      api: { apiKey: envConfig.nosana.apiKey },
      ...(wallet ? { wallet: wallet as any } : {})
    });
    
    return nosanaClient;
  }

  if (!wallet) {
    throw new Error("Missing both API Key and Wallet configuration. Supply NOSANA_API_KEY, KEYPAIR_PATH, or SOLANA_KEY.");
  }

  // Fallback to pure SDK if no API key is set
  nosanaClient = new Client(envConfig.solana.network as any, wallet);
  return nosanaClient;
}
