import crypto from 'crypto';
import { PoolClient } from 'pg';
import { db } from '../db/client';
import * as chainService from './chain';
import { Errors, AppError } from '../middleware/errorHandler';
import type {
  AgentRow,
  AgentFollowRow,
  RegisterAgentBody,
  FollowAgentBody,
  ListAgentsQuery,
} from '../types';
import { FollowMode } from '../types';

// ─────────────────────────────────────────────────────────
// Types returned to routes
// ─────────────────────────────────────────────────────────

export interface AgentStats {
  pnl_wei: string;
  pnl_7d_wei: string;
  win_rate: number;
  total_bets: number;
  total_volume_wei: string;
  avg_bet_wei: string;
  markets_created: number;
  best_win_wei: string;
}

export interface AgentProfile extends AgentRow {
  stats: AgentStats;
  followers: {
    total: number;
    copy_count: number;
    short_count: number;
  };
  pnl_history: { ts: number; cumulative_pnl_wei: string }[];
  recent_bets: unknown[];
}

export interface AgentSummary extends AgentRow {
  pnl_wei: string;
  win_rate: number;
  total_bets: number;
  followers_count: number;
  total_volume_wei: string;
}

// ─────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────

export interface RegisterAgentResult {
  agent: AgentRow;
  apiKey: string;
}

export async function registerAgent(
  body: RegisterAgentBody,
): Promise<RegisterAgentResult> {
  // 1. Register on-chain via AgentRegistry
  //    For hackathon simplicity we use token ID = timestamp-based bigint
  const createResp = await chainService.createAIAgent(body.public_key, body.wallet_address);
  
  const inftTokenId = BigInt(createResp.tokenId)
  const { txHash: registryTxHash } = await chainService.registerAgentOnChain({
    agentWalletAddress: body.wallet_address,
    inftTokenId,
  });

  // 2. Compose iNFT metadata (stored on 0G Storage in the agent service;
  //    here we just record the URI)
  const agentIdPlaceholder = `agent_${crypto.randomBytes(4).toString('hex')}`;
  const metadataUri =
    createResp.rootHash;
  const ogStorageKey = `agent_memory:${agentIdPlaceholder}`;

  // 3. Persist agent + user row in DB (transaction)
  const { agent, apiKey } = await db.transaction(async (client: PoolClient) => {
    // Create agent record
    const { rows: agentRows } = await client.query<AgentRow>(
      `INSERT INTO agents
         (name, description, wallet_address, inft_id, inft_tx_hash,
          inft_metadata_uri, og_storage_key, registry_tx_hash, strategy_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        body.name,
        body.description ?? null,
        body.wallet_address,
        inftTokenId.toString(),
        registryTxHash,
        metadataUri,
        ogStorageKey,
        registryTxHash,
        JSON.stringify(body.strategy_config ?? {}),
      ],
    );
    const agent = agentRows[0];

    // Create corresponding user row
    const { rows: userRows } = await client.query<{ id: string }>(
      `INSERT INTO users (wallet_address, is_agent, agent_id)
       VALUES ($1, TRUE, $2)
       RETURNING id`,
      [body.wallet_address, agent.id],
    );
    const userId = userRows[0].id;

    // Generate API key
    const rawKey = `sk_agent_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await client.query(
      `INSERT INTO api_keys (user_id, key_hash) VALUES ($1, $2)`,
      [userId, keyHash],
    );

    return { agent, apiKey: rawKey };
  });

  return { agent, apiKey };
}

// ─────────────────────────────────────────────────────────
// Follow / unfollow
// ─────────────────────────────────────────────────────────

export interface FollowResult {
  follow: AgentFollowRow;
  registryTxHash: string;
}

export async function followAgent(
  followerId: string,
  followerWalletAddress: string,
  agentId: string,
  body: FollowAgentBody,
): Promise<FollowResult> {
  // Load agent
  const { rows: agentRows } = await db.query<AgentRow>(
    'SELECT * FROM agents WHERE id = $1',
    [agentId],
  );
  const agent = agentRows[0];
  if (!agent) throw Errors.notFound('Agent');

  // Unfollow path
  if (body.mode === FollowMode.None) {
    await db.query(
      'DELETE FROM agent_follows WHERE follower_id = $1 AND agent_id = $2',
      [followerId, agentId],
    );
    // Unfollow on-chain
    const { txHash } = await chainService.setFollowOnChain({
      followerWalletAddress,
      agentWalletAddress: agent.wallet_address,
      mode: 0,
      copyFractionBps: BigInt(0),
      maxBetWei: BigInt(0),
    });
    return {
      follow: {
        follower_id: followerId,
        agent_id: agentId,
        mode: FollowMode.None,
        copy_fraction: '0',
        max_bet_wei: null,
        active_since: new Date(),
      },
      registryTxHash: txHash,
    };
  }

  // Check existing follow
  const { rows: existing } = await db.query<AgentFollowRow>(
    'SELECT * FROM agent_follows WHERE follower_id = $1 AND agent_id = $2',
    [followerId, agentId],
  );
  if (existing.length > 0 && existing[0].mode !== body.mode) {
    // Allow mode change — update rather than error
  } else if (existing.length > 0) {
    throw Errors.alreadyFollowing(existing[0].mode);
  }

  const copyFraction = body.copy_fraction ?? 1.0;
  const maxBetWei = body.max_bet_wei ?? null;
  const copyFractionBps = BigInt(Math.round(copyFraction * 10_000));
  const modeNum: 1 | 2 = body.mode === FollowMode.Copy ? 1 : 2;

  // Register on-chain
  const { txHash } = await chainService.setFollowOnChain({
    followerWalletAddress,
    agentWalletAddress: agent.wallet_address,
    mode: modeNum,
    copyFractionBps,
    maxBetWei: maxBetWei ? BigInt(maxBetWei) : BigInt(0),
  });

  // Upsert in DB
  const { rows: followRows } = await db.query<AgentFollowRow>(
    `INSERT INTO agent_follows
       (follower_id, agent_id, mode, copy_fraction, max_bet_wei)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (follower_id, agent_id) DO UPDATE
       SET mode = EXCLUDED.mode,
           copy_fraction = EXCLUDED.copy_fraction,
           max_bet_wei = EXCLUDED.max_bet_wei,
           active_since = NOW()
     RETURNING *`,
    [followerId, agentId, body.mode, copyFraction.toString(), maxBetWei],
  );

  return { follow: followRows[0], registryTxHash: txHash };
}

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

export async function listAgents(query: ListAgentsQuery): Promise<{
  agents: AgentSummary[];
  nextCursor: string | null;
  total: number;
}> {
  const sortBy = query.sort_by ?? 'pnl';
  const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);

  const orderMap: Record<string, string> = {
    pnl:       'pnl_wei DESC',
    win_rate:  'win_rate DESC',
    followers: 'followers_count DESC',
    volume:    'total_volume_wei DESC',
  };
  const orderClause = orderMap[sortBy] ?? orderMap.pnl;

  // cursor is base64-encoded JSON { id }
  const cursorCondition = query.cursor
    ? `WHERE a.id > '${JSON.parse(Buffer.from(query.cursor, 'base64').toString()).id}'`
    : '';

  const { rows } = await db.query<AgentSummary>(
    `SELECT
       a.*,
       COALESCE(SUM(b.pnl_wei), 0)::TEXT       AS pnl_wei,
       COALESCE(SUM(b.amount_wei), 0)::TEXT     AS total_volume_wei,
       COALESCE(AVG(b.amount_wei), 0)::TEXT     AS avg_bet_wei,
       COUNT(b.id)::INT                          AS total_bets,
       ROUND(
         COUNT(b.id) FILTER (WHERE b.pnl_wei > 0)::NUMERIC /
         NULLIF(COUNT(b.id), 0), 4
       )                                         AS win_rate,
       COUNT(DISTINCT af.follower_id)::INT        AS followers_count
     FROM agents a
     LEFT JOIN users u ON u.agent_id = a.id
     LEFT JOIN bets b ON b.user_id = u.id
     LEFT JOIN agent_follows af ON af.agent_id = a.id
     ${cursorCondition}
     GROUP BY a.id
     ORDER BY ${orderClause}
     LIMIT $1`,
    [limit + 1],
  );

  const hasMore = rows.length > limit;
  const agents = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = agents[agents.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ id: last.id })).toString('base64');
  }

  const { rows: countRows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) FROM agents',
  );

  return {
    agents,
    nextCursor,
    total: parseInt(countRows[0].count, 10),
  };
}

export async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  const { rows } = await db.query<AgentRow>(
    'SELECT * FROM agents WHERE id = $1',
    [agentId],
  );
  const agent = rows[0];
  if (!agent) throw Errors.notFound('Agent');

  // Load user row for this agent
  const { rows: userRows } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE agent_id = $1',
    [agentId],
  );
  const userId = userRows[0]?.id;

  // Aggregate stats
  const { rows: statsRows } = await db.query<{
    pnl_wei: string;
    pnl_7d_wei: string;
    total_volume_wei: string;
    avg_bet_wei: string;
    total_bets: string;
    best_win_wei: string;
    win_rate: string;
  }>(
    `SELECT
       COALESCE(SUM(pnl_wei), 0)::TEXT            AS pnl_wei,
       COALESCE(SUM(pnl_wei) FILTER (
         WHERE placed_at > NOW() - INTERVAL '7 days'
       ), 0)::TEXT                                AS pnl_7d_wei,
       COALESCE(SUM(amount_wei), 0)::TEXT          AS total_volume_wei,
       COALESCE(AVG(amount_wei), 0)::TEXT          AS avg_bet_wei,
       COUNT(*)::TEXT                              AS total_bets,
       COALESCE(MAX(pnl_wei) FILTER (WHERE pnl_wei > 0), 0)::TEXT AS best_win_wei,
       ROUND(
         COUNT(*) FILTER (WHERE pnl_wei > 0)::NUMERIC /
         NULLIF(COUNT(*), 0), 4
       )::TEXT                                    AS win_rate
     FROM bets
     WHERE user_id = $1`,
    [userId],
  );

  const { rows: marketsCreated } = await db.query<{ count: string }>(
    'SELECT COUNT(*)::TEXT AS count FROM markets WHERE created_by = $1',
    [userId],
  );

  const stats: AgentStats = {
    pnl_wei: statsRows[0].pnl_wei,
    pnl_7d_wei: statsRows[0].pnl_7d_wei,
    win_rate: parseFloat(statsRows[0].win_rate ?? '0'),
    total_bets: parseInt(statsRows[0].total_bets, 10),
    total_volume_wei: statsRows[0].total_volume_wei,
    avg_bet_wei: statsRows[0].avg_bet_wei,
    markets_created: parseInt(marketsCreated[0].count, 10),
    best_win_wei: statsRows[0].best_win_wei,
  };

  // Follower breakdown
  const { rows: followerRows } = await db.query<{
    total: string;
    copy_count: string;
    short_count: string;
  }>(
    `SELECT
       COUNT(*)::TEXT                                       AS total,
       COUNT(*) FILTER (WHERE mode = 'copy')::TEXT         AS copy_count,
       COUNT(*) FILTER (WHERE mode = 'short')::TEXT        AS short_count
     FROM agent_follows
     WHERE agent_id = $1`,
    [agentId],
  );

  const followers = {
    total: parseInt(followerRows[0].total, 10),
    copy_count: parseInt(followerRows[0].copy_count, 10),
    short_count: parseInt(followerRows[0].short_count, 10),
  };

  // PnL history (hourly buckets, last 24 h)
  const { rows: pnlHistory } = await db.query<{
    ts: string;
    cumulative_pnl_wei: string;
  }>(
    `SELECT
       EXTRACT(EPOCH FROM date_trunc('hour', placed_at))::BIGINT AS ts,
       SUM(SUM(pnl_wei)) OVER (ORDER BY date_trunc('hour', placed_at))::TEXT
         AS cumulative_pnl_wei
     FROM bets
     WHERE user_id = $1 AND placed_at > NOW() - INTERVAL '24 hours'
     GROUP BY date_trunc('hour', placed_at)
     ORDER BY 1`,
    [userId],
  );

  // Recent bets with market title
  const { rows: recentBets } = await db.query(
    `SELECT b.*, m.title AS market_title,
       CASE WHEN b.pnl_wei > 0 THEN 'won'
            WHEN b.pnl_wei < 0 THEN 'lost'
            ELSE 'pending' END AS outcome
     FROM bets b
     JOIN markets m ON m.id = b.market_id
     WHERE b.user_id = $1
     ORDER BY b.placed_at DESC
     LIMIT 10`,
    [userId],
  );

  return {
    ...agent,
    stats,
    followers,
    pnl_history: pnlHistory.map((r) => ({
      ts: parseInt(r.ts, 10),
      cumulative_pnl_wei: r.cumulative_pnl_wei,
    })),
    recent_bets: recentBets,
  };
}

export async function getAgentByWallet(
  walletAddress: string,
): Promise<AgentRow | null> {
  const { rows } = await db.query<AgentRow>(
    'SELECT * FROM agents WHERE wallet_address = $1',
    [walletAddress],
  );
  return rows[0] ?? null;
}