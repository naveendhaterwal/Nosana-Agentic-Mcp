export const envConfig = {
  solana: {
    keypairPath: process.env.KEYPAIR_PATH,
    privateKey: process.env.SOLANA_KEY,
    network: process.env.SOLANA_NETWORK || "mainnet-beta",
  },
  nosana: {
    apiKey: process.env.NOSANA_API_KEY,
  }
} as const;
