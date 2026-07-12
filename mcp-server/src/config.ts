export const envConfig = {
  solana: {
    keypairPath: process.env.KEYPAIR_PATH,
    privateKey: process.env.SOLANA_KEY,
    network: process.env.SOLANA_NETWORK || "mainnet-beta",
  },
  nosana: {
    apiKey: process.env.NOSANA_API_KEY,
  },
  logging: {
    /** Controls logging verbosity: "debug" | "info" | "warn" | "error" */
    level: process.env.LOG_LEVEL || "info",
  },
  features: {
    /** If true, register old flat tool names (e.g., "smart_deploy") as aliases alongside namespaced names */
    enableBackwardCompat: process.env.ENABLE_BACKWARD_COMPAT === "true",
  },
} as const;
