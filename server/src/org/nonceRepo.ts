/**
 * nonceRepo.ts — consume-once storage for signed action nonces (PROTOCOL.md §3).
 *
 * A signed action is valid until its `exp` (≤ 5 min). Without this table the
 * same signature could be replayed for that whole window by anyone who saw it:
 * "approve this device" executed five times, "remove this member" replayed
 * after the admin changed their mind. The row IS the proof that this exact
 * nonce was already spent.
 *
 * The critical property is that consuming is **atomic**: check-then-insert
 * would let two concurrent replays both see "unused" and both execute. So the
 * insert itself decides — `ON CONFLICT DO NOTHING` (Postgres) / `INSERT OR
 * IGNORE` (SQLite) and the caller wins only if the row was actually written.
 *
 * `orgId` is part of the primary key, not a column filtered later: in
 * `TENANCY=multi` two organizations must never be able to burn each other's
 * nonces, and that isolation has to be structural (`DEPLOYMENT-MODES.md`).
 *
 * The relay learns only that an action happened and when its window closes —
 * never what the action said. Already declared in `THREAT-MODEL.md` §4.
 */

import { USE_PG, dbRun, dbGet } from '../db/driver.js';

export interface UsedNonceRow {
  org_id: string;
  nonce: string;
  expires_at: number;
}

export const nonceRepo = {
  /**
   * Spend `nonce` for `orgId`. Returns true the FIRST time only.
   *
   * Atomic by construction: the uniqueness of the primary key decides the
   * race, not a read the caller performed earlier. A caller must treat `false`
   * as "this action was already executed" and refuse it.
   */
  async consume(orgId: string, nonce: string, expiresAt: number): Promise<boolean> {
    const result = USE_PG
      ? await dbRun(
          `INSERT INTO used_nonces (org_id, nonce, expires_at) VALUES (?, ?, ?)
           ON CONFLICT (org_id, nonce) DO NOTHING`,
          [orgId, nonce, expiresAt],
        )
      : await dbRun(`INSERT OR IGNORE INTO used_nonces (org_id, nonce, expires_at) VALUES (?, ?, ?)`, [
          orgId,
          nonce,
          expiresAt,
        ]);
    return result.changes > 0;
  },

  /**
   * Whether a nonce is already spent. Diagnostics and tests only — an
   * authorization path must call `consume`, because anything that checks first
   * and acts later has a window where two replays both pass.
   */
  async isUsed(orgId: string, nonce: string): Promise<boolean> {
    const row = await dbGet<{ nonce: string }>(
      `SELECT nonce FROM used_nonces WHERE org_id = ? AND nonce = ? LIMIT 1`,
      [orgId, nonce],
    );
    return row !== undefined && row !== null;
  },

  /**
   * Drop rows whose window has closed. A nonce only has to outlive the
   * signature that carried it: once `exp` passes, the signature is refused on
   * its own and the row is dead weight (and one more metadata row than needed).
   */
  async purgeExpired(now: number = Date.now()): Promise<number> {
    // Deliberately org-wide: this is TTL maintenance over every organization's
    // dead rows, not a lookup on behalf of a caller, so there is no org to
    // scope it to and no cross-org read to leak.
    // nosemgrep: aegislink-org-table-needs-org-id
    const result = await dbRun(`DELETE FROM used_nonces WHERE expires_at <= ?`, [now]);
    return result.changes;
  },
};
