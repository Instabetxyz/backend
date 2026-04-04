import crypto from 'crypto';
import { db } from '../db/client';
import type { UserRow } from '../types';

export interface CreateApiKeyResult {
  api_key: string;
  wallet_address: string;
}

export async function createApiKeyForWallet(
  walletAddress: string,
): Promise<CreateApiKeyResult> {
  const normalizedAddress = walletAddress.toLowerCase();

  const { rows: existingKeys } = await db.query<{ key_hash: string; key_prefix: string }>(
    `SELECT key_hash, key_prefix FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE u.wallet_address = $1 AND ak.key_prefix = 'sk_user'`,
    [normalizedAddress],
  );

  if (existingKeys.length > 0) {
    throw new Error('API key already exists for this wallet. Delete existing key first.');
  }

  let userId: string;

  const { rows: userRows } = await db.query<{ id: string }>(
    `INSERT INTO users (wallet_address) VALUES ($1)
     ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
     RETURNING id`,
    [normalizedAddress],
  );
  userId = userRows[0].id;

  const rawKey = `sk_user_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  await db.query(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix) VALUES ($1, $2, 'sk_user')`,
    [userId, keyHash],
  );

  return { api_key: rawKey, wallet_address: normalizedAddress };
}

export async function listApiKeysForWallet(
  userId: string,
): Promise<Array<{ id: string; created_at: Date; last_used: Date | null }>> {
  const { rows } = await db.query<{ id: string; created_at: Date; last_used: Date | null }>(
    `SELECT id, created_at, last_used FROM api_keys 
     WHERE user_id = $1 AND key_prefix = 'sk_user'`,
    [userId],
  );
  return rows;
}

export async function deleteApiKey(
  userId: string,
  keyId: string,
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM api_keys WHERE id = $2 AND user_id = $1 AND key_prefix = 'sk_user'`,
    [userId, keyId],
  );
  return (result.rowCount ?? 0) > 0;
}
