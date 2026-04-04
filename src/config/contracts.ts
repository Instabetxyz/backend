import PredictionMarketAbi from '../abis/PredictionMarket.json';
import AgentRegistryAbi from '../abis/AgentRegistry.json';
import INftAbi from "../abis/INFT.json";
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

  inft: {
    address: config.chain.contracts.iNft,
    abi: INftAbi,
  },
} as const;