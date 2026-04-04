import PredictionMarketAbi from '../abis/PredictionMarket.json';
import AgentRegistryAbi from '../abis/AgentRegistry.json';
import { config } from './index';

export const contracts = {
  predictionMarket: {
    address: config.chain.contracts.predictionMarket,
    abi: PredictionMarketAbi,
  },
  agentRegistry: {
    address: config.chain.contracts.agentRegistry,
    abi: AgentRegistryAbi,
  },
} as const;