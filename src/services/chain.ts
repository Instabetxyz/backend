import { ethers, Contract, TransactionReceipt } from 'ethers';
import { config } from '../config';
import { contracts } from '../config/contracts';

// ─────────────────────────────────────────────────────────
// Provider & signer (module-level singletons)
// ─────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(config.chain.rpcUrl, {
  chainId: config.chain.chainId,
  name: '0g-testnet',
});

const signer = new ethers.Wallet(config.chain.deployerPrivateKey, provider);

// ─────────────────────────────────────────────────────────
// Contract instances — singleton PredictionMarket
// ─────────────────────────────────────────────────────────

// Read-only instance (provider) — for view calls
const predictionMarketRead = new Contract(
  contracts.predictionMarket.address,
  contracts.predictionMarket.abi,
  provider,
);

// Write instance (signer) — for state-changing calls
const predictionMarketWrite = new Contract(
  contracts.predictionMarket.address,
  contracts.predictionMarket.abi,
  signer,
);

const agentRegistry = new Contract(
  contracts.agentRegistry.address,
  contracts.agentRegistry.abi,
  signer,
);

// ─────────────────────────────────────────────────────────
// Outcome enum — mirrors Solidity `enum Outcome { Yes, No }`
// ─────────────────────────────────────────────────────────

export const Outcome = {
  Yes: 0,
  No: 1,
} as const;
export type OutcomeValue = (typeof Outcome)[keyof typeof Outcome];

function outcomeFromBool(yes: boolean): OutcomeValue {
  return yes ? Outcome.Yes : Outcome.No;
}

// ─────────────────────────────────────────────────────────
// On-chain Market struct shape
// ─────────────────────────────────────────────────────────

export interface OnChainMarket {
  marketId: bigint;
  streamUrl: string;
  question: string;
  creator: string;
  yesAmount: bigint;
  noAmount: bigint;
  totalAmount: bigint;
  feeAmount: bigint;
  resolved: boolean;
  cancelled: boolean;
  winningOutcome: OutcomeValue;
  createdAt: bigint;
}

export interface OnChainUserPosition {
  yesAmount: bigint;
  noAmount: bigint;
  claimed: boolean;
}

// ─────────────────────────────────────────────────────────
// PredictionMarket — reads
// ─────────────────────────────────────────────────────────

export async function getMarket(marketId: bigint): Promise<OnChainMarket> {
  const m = await predictionMarketRead.getMarket(marketId);
  return {
    marketId:      BigInt(m.marketId),
    streamUrl:     m.streamUrl as string,
    question:      m.question as string,
    creator:       m.creator as string,
    yesAmount:     BigInt(m.yesAmount),
    noAmount:      BigInt(m.noAmount),
    totalAmount:   BigInt(m.totalAmount),
    feeAmount:     BigInt(m.feeAmount),
    resolved:      Boolean(m.resolved),
    cancelled:     Boolean(m.cancelled),
    winningOutcome: Number(m.winningOutcome) as OutcomeValue,
    createdAt:     BigInt(m.createdAt),
  };
}

export async function getUserPosition(
  marketId: bigint,
  userAddress: string,
): Promise<OnChainUserPosition> {
  const p = await predictionMarketRead.getUserPosition(marketId, userAddress);
  return {
    yesAmount: BigInt(p.yesAmount),
    noAmount:  BigInt(p.noAmount),
    claimed:   Boolean(p.claimed),
  };
}

export async function calculatePayout(
  marketId: bigint,
  userAddress: string,
): Promise<bigint> {
  const payout = await predictionMarketRead.calculatePayout(marketId, userAddress);
  return BigInt(payout);
}

export async function getMarketCount(): Promise<bigint> {
  const count = await predictionMarketRead.getMarketCount();
  return BigInt(count);
}

// ─────────────────────────────────────────────────────────
// PredictionMarket — writes
// ─────────────────────────────────────────────────────────

export interface CreateMarketResult {
  /** On-chain marketId emitted by MarketCreated event */
  onChainMarketId: bigint;
  txHash: string;
}

/**
 * Call createMarket() on the singleton contract.
 * The server is the creator/relayer; feeAmount covers protocol fees.
 */
export async function createMarketOnChain(opts: {
  streamUrl: string;
  question: string;
  feeAmount: bigint;
}): Promise<CreateMarketResult> {
  const tx = await predictionMarketWrite.createMarket(
    opts.streamUrl,
    opts.question,
    opts.feeAmount,
  );
  const receipt: TransactionReceipt = await tx.wait(1);

  // Parse MarketCreated event to get the on-chain marketId
  const iface = new ethers.Interface(contracts.predictionMarket.abi);
  let onChainMarketId: bigint | null = null;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'MarketCreated') {
        onChainMarketId = BigInt(parsed.args.marketId);
        break;
      }
    } catch {
      // skip unparseable logs
    }
  }

  if (onChainMarketId === null) {
    throw new Error('MarketCreated event not found in tx receipt.');
  }

  return { onChainMarketId, txHash: receipt.hash };
}

export interface PlaceBetResult {
  txHash: string;
}

/**
 * Place a bet on behalf of a user via placeBetFor().
 * The user must have called approveRelayer() on the contract beforehand
 * (done in the mobile app, not via the server).
 * The server relayer wallet calls this; the token transfer comes from _user.
 */
export async function placeBetFor(opts: {
  userAddress: string;
  onChainMarketId: bigint;
  outcome: OutcomeValue;
  amount: bigint;
}): Promise<PlaceBetResult> {
  const tx = await predictionMarketWrite.placeBetFor(
    opts.userAddress,
    opts.onChainMarketId,
    opts.outcome,
    opts.amount,
  );
  const receipt: TransactionReceipt = await tx.wait(1);
  return { txHash: receipt.hash };
}

/**
 * Resolve a market with the winning outcome.
 * Called by the CRE workflow or directly as fallback.
 */
export async function resolveMarketOnChain(opts: {
  onChainMarketId: bigint;
  outcome: boolean; // true = YES wins, false = NO wins
}): Promise<string> {
  const tx = await predictionMarketWrite.resolveMarket(
    opts.onChainMarketId,
    outcomeFromBool(opts.outcome),
  );
  const receipt: TransactionReceipt = await tx.wait(1);
  return receipt.hash;
}

export async function cancelMarketOnChain(onChainMarketId: bigint): Promise<string> {
  const tx = await predictionMarketWrite.cancelMarket(onChainMarketId);
  const receipt: TransactionReceipt = await tx.wait(1);
  return receipt.hash;
}

// ─────────────────────────────────────────────────────────
// AgentRegistry — unchanged
// ─────────────────────────────────────────────────────────

export async function registerAgentOnChain(opts: {
  agentWalletAddress: string;
  inftTokenId: bigint;
}): Promise<{ txHash: string }> {
  const tx = await agentRegistry.registerAgent(
    opts.agentWalletAddress,
    opts.inftTokenId,
  );
  const receipt: TransactionReceipt = await tx.wait(1);
  return { txHash: receipt.hash };
}

export async function setFollowOnChain(opts: {
  followerWalletAddress: string;
  agentWalletAddress: string;
  mode: 0 | 1 | 2;
  copyFractionBps: bigint;
  maxBetWei: bigint;
}): Promise<{ txHash: string }> {
  const tx = await agentRegistry.setFollow(
    opts.agentWalletAddress,
    opts.mode,
    opts.copyFractionBps,
    opts.maxBetWei,
  );
  const receipt: TransactionReceipt = await tx.wait(1);
  return { txHash: receipt.hash };
}

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────

/**
 * Derive implied probability odds from pool totals.
 * yes_odds = noAmount / total  (price of a YES share)
 * no_odds  = yesAmount / total
 */
export function computeOdds(
  yesAmount: bigint,
  noAmount: bigint,
): { yes: number; no: number } {
  const total = yesAmount + noAmount;
  if (total === BigInt(0)) return { yes: 0.5, no: 0.5 };
  return {
    yes: Number(noAmount)  / Number(total),
    no:  Number(yesAmount) / Number(total),
  };
}

export { provider, signer };