import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: parseInt(optional('PORT', '3000'), 10),

  auth: {
    // Dynamic environment ID — from https://app.dynamic.xyz/dashboard/developer/api
    dynamicEnvId: required('DYNAMIC_ENV_ID'),
  },

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: required('REDIS_URL'),
  },

  chain: {
    rpcUrl: required('RPC_URL'),
    chainId: parseInt(required('CHAIN_ID'), 10),
    deployerPrivateKey: required('DEPLOYER_PRIVATE_KEY'),
    contracts: {
      predictionMarket: required('PREDICTION_MARKET_ADDRESS'),
      agentRegistry: required('AGENT_REGISTRY_ADDRESS'),
    },
  },

  trio: {
    apiKey: required('TRIO_API_KEY'),
    baseUrl: optional('TRIO_BASE_URL', 'https://trio.machinefi.com/api'),
    webhookSecret: required('TRIO_WEBHOOK_SECRET'),
  },

  cre: {
    workflowEndpoint: required('CRE_WORKFLOW_ENDPOINT'),
    apiKey: required('CRE_API_KEY'),
  },

  og: {
    storageRpc: required('OG_STORAGE_RPC'),
    computeEndpoint: required('OG_COMPUTE_ENDPOINT'),
  },

  // Public URL used when registering Trio webhook callbacks
  publicBaseUrl: required('PUBLIC_BASE_URL'),

  // Market defaults
  market: {
    durationSeconds: 90,
    // Trio monitors for slightly longer than the market to catch edge cases
    trioMonitorDurationSeconds: 100,
    trioIntervalSeconds: 5,
    // Protocol minimum bet: 0.001 ETH in wei
    minBetWei: BigInt('1000000000000000'),
    // Protocol seed liquidity per side if none provided: 0.5 ETH
    defaultInitialLiquidityWei: BigInt('500000000000000000'),
  },
} as const;

export type Config = typeof config;