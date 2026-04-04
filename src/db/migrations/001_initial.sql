-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY DEFAULT 'usr_' || encode(gen_random_bytes(6), 'hex'),
  wallet_address   TEXT NOT NULL UNIQUE,
  is_agent         BOOLEAN NOT NULL DEFAULT FALSE,
  agent_id         TEXT,                     -- FK to agents.id, set if is_agent
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (wallet_address);

-- ─────────────────────────────────────────────────────────
-- agents
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY DEFAULT 'agent_' || encode(gen_random_bytes(6), 'hex'),
  name                TEXT NOT NULL,
  description         TEXT,
  wallet_address      TEXT NOT NULL UNIQUE,
  inft_id             TEXT NOT NULL UNIQUE,
  inft_tx_hash        TEXT NOT NULL,
  inft_metadata_uri   TEXT NOT NULL,
  og_storage_key      TEXT NOT NULL UNIQUE,
  registry_tx_hash    TEXT NOT NULL,
  strategy_config     JSONB NOT NULL DEFAULT '{}',
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents (wallet_address);
CREATE INDEX IF NOT EXISTS idx_agents_inft   ON agents (inft_id);

-- ─────────────────────────────────────────────────────────
-- markets
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markets (
  id                  TEXT PRIMARY KEY DEFAULT 'mkt_' || encode(gen_random_bytes(6), 'hex'),
  stream_id           TEXT NOT NULL DEFAULT 'strm_' || encode(gen_random_bytes(6), 'hex'),
  -- uint256 from PredictionMarket.createMarket(), stored as TEXT to avoid overflow
  on_chain_market_id  TEXT NOT NULL UNIQUE,
  trio_job_id         TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  condition           TEXT NOT NULL,
  stream_url          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'resolved', 'cancelled')),
  outcome             TEXT CHECK (outcome IN ('yes', 'no')),
  resolution_reason   TEXT CHECK (resolution_reason IN (
                        'condition_triggered', 'max_duration_reached', 'cancelled'
                      )),
  trio_explanation    TEXT,
  resolved_at         TIMESTAMPTZ,
  resolve_tx_hash     TEXT,
  yes_pool_wei        NUMERIC(78, 0) NOT NULL DEFAULT 0,
  no_pool_wei         NUMERIC(78, 0) NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL REFERENCES users (id),
  is_agent_stream     BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at             TIMESTAMPTZ NOT NULL,
  tx_hash             TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_status         ON markets (status);
CREATE INDEX IF NOT EXISTS idx_markets_created_by     ON markets (created_by);
CREATE INDEX IF NOT EXISTS idx_markets_ends_at        ON markets (ends_at);
CREATE INDEX IF NOT EXISTS idx_markets_on_chain_id    ON markets (on_chain_market_id);
CREATE INDEX IF NOT EXISTS idx_markets_trio_job       ON markets (trio_job_id);

-- ─────────────────────────────────────────────────────────
-- bets
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bets (
  id           TEXT PRIMARY KEY DEFAULT 'bet_' || encode(gen_random_bytes(6), 'hex'),
  market_id    TEXT NOT NULL REFERENCES markets (id),
  user_id      TEXT NOT NULL REFERENCES users (id),
  side         TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  amount_wei   NUMERIC(78, 0) NOT NULL,
  shares       NUMERIC(38, 18) NOT NULL,
  tx_hash      TEXT NOT NULL UNIQUE,
  placed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed      BOOLEAN NOT NULL DEFAULT FALSE,
  pnl_wei      NUMERIC(78, 0)         -- populated after resolution
);

CREATE INDEX IF NOT EXISTS idx_bets_market   ON bets (market_id);
CREATE INDEX IF NOT EXISTS idx_bets_user     ON bets (user_id);
CREATE INDEX IF NOT EXISTS idx_bets_placed   ON bets (placed_at);

-- ─────────────────────────────────────────────────────────
-- agent_follows
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_follows (
  follower_id    TEXT NOT NULL REFERENCES users (id),
  agent_id       TEXT NOT NULL REFERENCES agents (id),
  mode           TEXT NOT NULL CHECK (mode IN ('copy', 'short')),
  copy_fraction  NUMERIC(5, 4) NOT NULL DEFAULT 1.0,
  max_bet_wei    NUMERIC(78, 0),
  active_since   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_agent ON agent_follows (agent_id);

-- ─────────────────────────────────────────────────────────
-- api_keys  (agents get a long-lived key; humans use JWT)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT NOT NULL REFERENCES users (id) UNIQUE,
  key_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw key
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used   TIMESTAMPTZ
);