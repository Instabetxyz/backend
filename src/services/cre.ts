import axios from 'axios';
import { config } from '../config';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface ResolutionPayload {
  market_id: string;
  on_chain_market_id: string; // uint256 as decimal string
  outcome: boolean;
  trio_explanation: string | null;
  triggered_at: number;
}

// ─────────────────────────────────────────────────────────
// CRE workflow trigger
// ─────────────────────────────────────────────────────────

/**
 * POST the resolution payload to the Chainlink CRE workflow endpoint.
 *
 * The CRE workflow is responsible for:
 *   1. Validating the payload
 *   2. Calling resolve(outcome) on PredictionMarket.sol via the DON
 *
 * This function is fire-and-CRE-handles-it: the actual on-chain tx
 * is executed by the DON, not by our backend. The backend also has a
 * direct fallback in resolveMarketOnChain() for the hackathon demo.
 */
export async function triggerResolutionWorkflow(
  payload: ResolutionPayload,
): Promise<void> {
  try {
    await axios.post(config.cre.workflowEndpoint, payload, {
      headers: {
        Authorization: `Bearer ${config.cre.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
    console.log(
      `[CRE] Resolution workflow triggered for market ${payload.market_id} — outcome: ${payload.outcome ? 'YES' : 'NO'}`,
    );
  } catch (err) {
    // Log the error; the caller decides whether to fall back to direct chain call
    console.error('[CRE] Failed to trigger workflow:', err);
    throw err;
  }
}