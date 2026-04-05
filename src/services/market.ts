import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { db } from '../db/client';
import {
  redis,
  setTrioJobMapping,
  setMarketExpiry,
  acquireResolutionLock,
  cacheMarketOdds,
  getCachedMarketOdds,
} from '../db/redis';
import { keys } from '../db/redis';
import * as trioService from './trio';
import * as chainService from './chain';
import * as creService from './cre';
import { broadcastToMarket } from '../websocket/server';
import { config } from '../config';
import { AppError, Errors } from '../middleware/errorHandler';
import {
  MarketRow,
  BetRow,
  BetSide,
  OddsSnapshot,
  Outcome,
  ResolutionReason,
  CreateStreamBody,
  PlaceBetBody,
  ListMarketsQuery,
  WsOddsUpdate,
  WsBetPlaced,
  WsMarketResolved,
} from '../types';
import { MarketStatus } from '../types';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function computeOddsSnapshot(
  yesPoolWei: string,
  noPoolWei: string,
): OddsSnapshot {
  const yes = BigInt(yesPoolWei);
  const no = BigInt(noPoolWei);
  const odds = chainService.computeOdds(yes, no);
  return {
    yes_odds: odds.yes,
    no_odds: odds.no,
    yes_pool_wei: yesPoolWei,
    no_pool_wei: noPoolWei,
    total_volume_wei: (yes + no).toString(),
  };
}

function secondsRemaining(endsAt: Date): number {
  return Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
}

// ─────────────────────────────────────────────────────────
// Create stream + market
// ─────────────────────────────────────────────────────────

export async function createStream(
  body: CreateStreamBody,
  createdBy: string,
  isAgentStream: boolean,
): Promise<MarketRow> {
  // 1. Validate stream liveness via Trio
  const validation = await trioService.validateStream(body.stream_url);
  if (!validation.reachable) {
    throw Errors.streamInvalid(validation.reason ?? 'Unknown reason');
  }

  const title =
    body.title ??
    (body.condition.length > 80
      ? body.condition.slice(0, 77) + '...'
      : body.condition);

  // feeAmount: use provided value or default to 0 (contract handles fee logic)
  const feeAmount = body.initial_liquidity_wei
    ? BigInt(body.initial_liquidity_wei)
    : BigInt(0);

  // 2. Create market on the singleton PredictionMarket contract
  const { onChainMarketId, txHash } = await chainService.createMarketOnChain({
    streamUrl: body.stream_url,
    question: body.condition,
    feeAmount,
  });

  // 3. Start Trio live-monitor job
  const trioJob = await trioService.startLiveMonitor({
    streamUrl: body.stream_url,
    condition: body.condition,
  });

  const endsAt = new Date(Date.now() + config.market.durationSeconds * 1000);

  // 4. Persist to DB — pools start at 0 and grow as bets come in
  const market = await db.transaction(async (client: PoolClient) => {
    const { rows } = await client.query<MarketRow>(
      `INSERT INTO markets
         (on_chain_market_id, trio_job_id, title, condition, stream_url,
          yes_pool_wei, no_pool_wei, created_by, is_agent_stream, ends_at, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        onChainMarketId.toString(),
        trioJob.job_id,
        title,
        body.condition,
        body.stream_url,
        '0',
        '0',
        createdBy,
        isAgentStream,
        endsAt,
        txHash,
      ],
    );
    return rows[0];
  });

  // 5. Store Redis mappings + expiry sentinel
  await Promise.all([
    setTrioJobMapping(trioJob.job_id, market.id),
    setMarketExpiry(market.id, config.market.durationSeconds),
    cacheMarketOdds(market.id, computeOddsSnapshot('0', '0')),
  ]);

  // 6. Subscribe to Redis keyspace expiry for the NO fallback path
  subscribeMarketExpiry(market.id);

  return market;
}

export async function createStreamMock(
  body: CreateStreamBody,
  createdBy: string,
  isAgentStream: boolean,
): Promise<MarketRow> {
  const title =
    body.title ??
    (body.condition.length > 80
      ? body.condition.slice(0, 77) + '...'
      : body.condition);

  // feeAmount: use provided value or default to 0 (contract handles fee logic)
  const feeAmount = body.initial_liquidity_wei
    ? BigInt(body.initial_liquidity_wei)
    : BigInt(0);

  // 2. Create market on the singleton PredictionMarket contract
  const { onChainMarketId, txHash } = await chainService.createMarketOnChain({
    streamUrl: body.stream_url,
    question: body.condition,
    feeAmount: BigInt(0),
  });

  const trioJob = {
    job_id: randomUUID()
  }

  console.log("on chain market id: ", onChainMarketId.toString())

  const endsAt = new Date(Date.now() + config.market.durationSeconds * 1000);

  // 4. Persist to DB — pools start at 0 and grow as bets come in
  const market = await db.transaction(async (client: PoolClient) => {
    const { rows } = await client.query<MarketRow>(
      `INSERT INTO markets
         (on_chain_market_id, trio_job_id, title, condition, stream_url,
          yes_pool_wei, no_pool_wei, created_by, is_agent_stream, ends_at, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        onChainMarketId.toString(),
        trioJob.job_id,
        title,
        body.condition,
        body.stream_url,
        '0',
        '0',
        createdBy,
        isAgentStream,
        endsAt,
        txHash,
      ],
    );
    return rows[0];
  });

  // 5. Store Redis mappings + expiry sentinel
  await Promise.all([
    setTrioJobMapping(trioJob.job_id, market.id),
    setMarketExpiry(market.id, config.market.durationSeconds),
    cacheMarketOdds(market.id, computeOddsSnapshot('0', '0')),
  ]);

  // 6. Subscribe to Redis keyspace expiry for the NO fallback path
  subscribeMarketExpiry(market.id);

  return market;
}

// ─────────────────────────────────────────────────────────
// Keyspace expiry — NO resolution fallback
// ─────────────────────────────────────────────────────────

/**
 * We use a dedicated Redis subscriber connection listening for
 * keyspace events on market expiry keys. When the key expires
 * (i.e. the 90s window is up), we trigger a NO resolution —
 * unless the market was already resolved by Trio.
 */
let expirySubscriberBooted = false;

export function subscribeMarketExpiry(marketId: string): void {
  if (!expirySubscriberBooted) {
    bootExpirySubscriber();
    expirySubscriberBooted = true;
  }
  void marketId;
}

function bootExpirySubscriber(): void {
  // Redis keyspace notifications require a *separate* connection
  // because subscribe() monopolises the connection.
  const sub = redis.duplicate();

  sub.config('SET', 'notify-keyspace-events', 'Ex').then(() => {
    sub.subscribe('__keyevent@0__:expired', (err) => {
      if (err) console.error('[Redis] Expiry subscribe error:', err);
    });

    sub.on('message', (_channel: string, expiredKey: string) => {
      // Only handle our market expiry keys
      if (!expiredKey.startsWith('market:expiry:')) return;
      const marketId = expiredKey.replace('market:expiry:', '');
      handleMarketTimeout(marketId).catch((err) => {
        console.error(`[Market] Timeout resolution error for ${marketId}:`, err);
      });
    });
  }).catch(console.error);
}

async function handleMarketTimeout(marketId: string): Promise<void> {
  const locked = await acquireResolutionLock(marketId);
  if (!locked) return;

  const { rows } = await db.query<MarketRow>(
    'SELECT * FROM markets WHERE id = $1',
    [marketId],
  );
  const market = rows[0];
  if (!market || market.status !== MarketStatus.Active) return;

  console.log(`[Market] Timeout — resolving ${marketId} as NO`);
  await resolveMarket({
    marketId,
    onChainMarketId: BigInt(market.on_chain_market_id),
    outcome: false,
    reason: ResolutionReason.MaxDurationReached,
    trioExplanation: null,
  });
}

// ─────────────────────────────────────────────────────────
// Resolve a market
// ─────────────────────────────────────────────────────────

export async function resolveMarket(opts: {
  marketId: string;
  onChainMarketId: bigint;
  outcome: boolean;
  reason: ResolutionReason;
  trioExplanation: string | null;
}): Promise<void> {
  const outcomeStr = opts.outcome ? Outcome.Yes : Outcome.No;

  // Try CRE workflow first; fall back to direct chain call
  let txHash: string;
  try {
    await creService.triggerResolutionWorkflow({
      market_id: opts.marketId,
      on_chain_market_id: opts.onChainMarketId.toString(),
      outcome: opts.outcome,
      trio_explanation: opts.trioExplanation,
      triggered_at: Math.floor(Date.now() / 1000),
    });
    // For the hackathon, also call directly so we have a confirmed txHash
    txHash = await chainService.resolveMarketOnChain({
      onChainMarketId: opts.onChainMarketId,
      outcome: opts.outcome,
    });
  } catch {
    console.warn('[Market] CRE unavailable, falling back to direct chain call');
    txHash = await chainService.resolveMarketOnChain({
      onChainMarketId: opts.onChainMarketId,
      outcome: opts.outcome,
    });
  }

  // Update DB
  const { rows } = await db.query<MarketRow>(
    `UPDATE markets
     SET status = 'resolved',
         outcome = $1,
         resolution_reason = $2,
         trio_explanation = $3,
         resolved_at = NOW(),
         resolve_tx_hash = $4
     WHERE id = $5
     RETURNING *`,
    [outcomeStr, opts.reason, opts.trioExplanation, txHash, opts.marketId],
  );

  const market = rows[0];

  // Update PnL for bets on the winning side
  await db.query(
    `UPDATE bets
     SET pnl_wei = CASE
       WHEN side = $1 THEN
         FLOOR(amount_wei::NUMERIC * $2::NUMERIC / $3::NUMERIC) - amount_wei::NUMERIC
       ELSE -amount_wei::NUMERIC
     END
     WHERE market_id = $4`,
    [
      outcomeStr,
      (outcomeStr === 'yes' ? market.yes_pool_wei : market.no_pool_wei),
      (outcomeStr === 'yes' ? market.no_pool_wei : market.yes_pool_wei), // approximation
      opts.marketId,
    ],
  );

  // Broadcast resolution via WebSocket
  const event: WsMarketResolved = {
    type: 'market_resolved',
    market_id: opts.marketId,
    outcome: outcomeStr,
    resolution_reason: opts.reason,
    trio_explanation: opts.trioExplanation,
    resolved_at: Math.floor(Date.now() / 1000),
    tx_hash: txHash,
    winning_pool_wei: opts.outcome
      ? market.yes_pool_wei.toString()
      : market.no_pool_wei.toString(),
    total_pot_wei: (
      BigInt(market.yes_pool_wei) + BigInt(market.no_pool_wei)
    ).toString(),
  };
  broadcastToMarket(opts.marketId, event);
}

// ─────────────────────────────────────────────────────────
// Place a bet
// ─────────────────────────────────────────────────────────

export interface PlaceBetResult {
  bet: BetRow;
  updatedOdds: OddsSnapshot;
  mirroredBets: BetRow[];
}

export async function placeBet(
  marketId: string,
  userId: string,
  userWalletAddress: string,
  isAgent: boolean,
  agentId: string | null,
  body: PlaceBetBody,
): Promise<PlaceBetResult> {
  // 1. Load market
  const { rows: mRows } = await db.query<MarketRow>(
    'SELECT * FROM markets WHERE id = $1',
    [marketId],
  );
  const market = mRows[0];
  if (!market) throw Errors.notFound('Market');
  if (market.status !== MarketStatus.Active) {
    throw Errors.marketClosed(Math.floor(market.ends_at.getTime() / 1000));
  }
  if (new Date() > market.ends_at) {
    throw Errors.marketClosed(Math.floor(market.ends_at.getTime() / 1000));
  }

  const amountWei = BigInt(body.amount_wei);
  if (amountWei < config.market.minBetWei) {
    throw new AppError(
      400,
      'BET_TOO_SMALL',
      `Minimum bet is ${config.market.minBetWei.toString()} wei.`,
    );
  }

  // Outcome: 0 = Yes, 1 = No
  const onChainOutcome = body.side === 'yes'
    ? chainService.Outcome.Yes
    : chainService.Outcome.No;

  // 2. Call placeBetFor on the singleton contract
  //    The user has pre-approved the relayer via approveRelayer() on the mobile app.
  const { txHash } = await chainService.placeBetFor({
    userAddress: userWalletAddress,
    onChainMarketId: BigInt(market.on_chain_market_id),
    outcome: onChainOutcome,
    amount: amountWei,
  });

  // 3. Read back updated pool state from chain to keep DB accurate
  const onChainMarket = await chainService.getMarket(BigInt(market.on_chain_market_id));
  const newYesPool = onChainMarket.yesAmount.toString();
  const newNoPool  = onChainMarket.noAmount.toString();

  // 4. Persist bet + sync pool in DB (transaction)
  const bet = await db.transaction(async (client: PoolClient) => {
    const { rows: bRows } = await client.query<BetRow>(
      `INSERT INTO bets (market_id, user_id, side, amount_wei, shares, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      // shares = amount for this contract (no AMM share token; amount IS the position)
      [marketId, userId, body.side, body.amount_wei, body.amount_wei, txHash],
    );

    // Sync pools from on-chain truth
    await client.query(
      `UPDATE markets SET yes_pool_wei = $1, no_pool_wei = $2 WHERE id = $3`,
      [newYesPool, newNoPool, marketId],
    );

    return bRows[0];
  });

  const updatedOdds = computeOddsSnapshot(newYesPool, newNoPool);

  // 5. Update Redis odds cache
  await cacheMarketOdds(marketId, updatedOdds);

  // 6. Broadcast WebSocket events
  const now = Math.floor(Date.now() / 1000);

  const betEvent: WsBetPlaced = {
    type: 'bet_placed',
    market_id: marketId,
    bet_id: bet.id,
    user_id: userId,
    is_agent: isAgent,
    side: body.side as BetSide,
    amount_wei: body.amount_wei,
    shares: Number(amountWei),
    tx_hash: txHash,
    ts: now,
  };
  broadcastToMarket(marketId, betEvent);

  const oddsEvent: WsOddsUpdate = {
    type: 'odds_update',
    market_id: marketId,
    yes_odds: updatedOdds.yes_odds,
    no_odds: updatedOdds.no_odds,
    yes_pool_wei: updatedOdds.yes_pool_wei,
    no_pool_wei: updatedOdds.no_pool_wei,
    total_volume_wei: updatedOdds.total_volume_wei,
    last_bet_by: userId,
    seconds_remaining: secondsRemaining(market.ends_at),
    ts: now,
  };
  broadcastToMarket(marketId, oddsEvent);

  // 7. Handle copy/short mirroring for followers of this agent
  let mirroredBets: BetRow[] = [];
  if (isAgent && agentId) {
    mirroredBets = await executeMirrorBets({
      agentId,
      marketId,
      originalSide: body.side as BetSide,
      originalAmountWei: amountWei,
      market,
    });
  }

  return { bet, updatedOdds, mirroredBets };
}

// ─────────────────────────────────────────────────────────
// Copy / Short mirroring
// ─────────────────────────────────────────────────────────

async function executeMirrorBets(opts: {
  agentId: string;
  marketId: string;
  originalSide: BetSide;
  originalAmountWei: bigint;
  market: MarketRow;
}): Promise<BetRow[]> {
  const { rows: follows } = await db.query<{
    follower_id: string;
    mode: string;
    copy_fraction: string;
    max_bet_wei: string | null;
    wallet_address: string;
  }>(
    `SELECT af.follower_id, af.mode, af.copy_fraction, af.max_bet_wei,
            u.wallet_address
     FROM agent_follows af
     JOIN users u ON u.id = af.follower_id
     WHERE af.agent_id = $1`,
    [opts.agentId],
  );

  const mirroredBets: BetRow[] = [];

  for (const follow of follows) {
    try {
      const mirrorSide: BetSide =
        follow.mode === 'short'
          ? (opts.originalSide === 'yes' ? 'no' : 'yes') as BetSide
          : opts.originalSide;

      let mirrorAmount = BigInt(
        Math.floor(Number(opts.originalAmountWei) * parseFloat(follow.copy_fraction)),
      );
      if (follow.max_bet_wei) {
        const cap = BigInt(follow.max_bet_wei);
        if (mirrorAmount > cap) mirrorAmount = cap;
      }
      if (mirrorAmount < config.market.minBetWei) continue;

      const result = await placeBet(
        opts.marketId,
        follow.follower_id,
        follow.wallet_address,
        false,
        null,
        { side: mirrorSide, amount_wei: mirrorAmount.toString() },
      );
      mirroredBets.push(result.bet);
    } catch (err) {
      console.warn(`[Market] Mirror bet failed for follower ${follow.follower_id}:`, err);
    }
  }

  return mirroredBets;
}

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

export async function listMarkets(query: ListMarketsQuery): Promise<{
  markets: MarketRow[];
  nextCursor: string | null;
  total: number;
}> {
  const status = query.status ?? 'active';
  const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
  const agentOnly = query.agent_only === 'true';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (status !== 'all') {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (query.created_by) {
    conditions.push(`created_by = $${paramIdx++}`);
    params.push(query.created_by);
  }
  if (agentOnly) {
    conditions.push(`is_agent_stream = TRUE`);
  }
  if (query.cursor) {
    // cursor is base64-encoded JSON { id, ends_at }
    const decoded = JSON.parse(
      Buffer.from(query.cursor, 'base64').toString(),
    ) as { ends_at: string };
    conditions.push(`ends_at > $${paramIdx++}`);
    params.push(decoded.ends_at);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    db.query<MarketRow>(
      `SELECT * FROM markets ${where} ORDER BY ends_at ASC LIMIT $${paramIdx}`,
      [...params, limit + 1],
    ),
    db.query<{ count: string }>(`SELECT COUNT(*) FROM markets ${where}`, params),
  ]);

  const rows = dataResult.rows;
  const hasMore = rows.length > limit;
  const markets = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = markets[markets.length - 1];
    nextCursor = Buffer.from(
      JSON.stringify({ ends_at: last.ends_at }),
    ).toString('base64');
  }

  return {
    markets,
    nextCursor,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function getMarketById(id: string): Promise<{
  market: MarketRow;
  agentPositions: unknown[];
  recentBets: BetRow[];
}> {
  // Accept both mkt_* internal ID and numeric on-chain market ID
  const isOnChainId = /^\d+$/.test(id);
  const { rows } = await db.query<MarketRow>(
    isOnChainId
      ? 'SELECT * FROM markets WHERE on_chain_market_id = $1'
      : 'SELECT * FROM markets WHERE id = $1',
    [id],
  );
  const market = rows[0];
  if (!market) throw Errors.notFound('Market');

  // Fetch agent positions
  const { rows: agentPos } = await db.query(
    `SELECT b.id, b.user_id, a.id as agent_id, a.name as agent_name,
            b.side, b.amount_wei, b.placed_at
     FROM bets b
     JOIN users u ON u.id = b.user_id
     JOIN agents a ON a.id = u.agent_id
     WHERE b.market_id = $1 AND u.is_agent = TRUE
     ORDER BY b.placed_at DESC`,
    [market.id],
  );

  // Fetch recent bets (last 20)
  const { rows: recentBets } = await db.query<BetRow>(
    `SELECT * FROM bets WHERE market_id = $1 ORDER BY placed_at DESC LIMIT 20`,
    [market.id],
  );

  return { market, agentPositions: agentPos, recentBets };
}

export async function getMarketOdds(marketId: string): Promise<OddsSnapshot | null> {
  return (await getCachedMarketOdds(marketId)) as OddsSnapshot | null;
}

// Silence unused import warning for `keys`
void keys;