/**
 * orgSig.ts — signed organization actions (PROTOCOL.md §3).
 *
 * Every administrative action and every certificate in AegisLink Work is an
 * Ed25519 signature over a COMPLETE canonical payload:
 *
 *   msg = "aegiswork/v1/" + action + "\n" + canonicalJson({orgId, action, params, nonce, exp})
 *   sig = Ed25519.sign(msg, actorSigKey)
 *
 * Why the whole payload, not just an id: the audit trail IS the authorization
 * (`ADMIN-CONSOLE.md` §4). A signature that covered only "who did something to
 * whom" would let the relay — or a tampering admin — re-tell the story with
 * different parameters ("role: guest" becomes "role: owner") while the
 * signature still verified. Here every parameter the action mutates is inside
 * the signed bytes, so an auditor re-verifying the stored signature years later
 * re-derives exactly what was authorized.
 *
 * The action name appears TWICE — in the domain-separating prefix and inside
 * the payload — and `verifyOrgAction` requires them to match. That makes a
 * signature for `member.suspend` unusable as one for `member.remove` even if an
 * attacker could get the two payloads to collide.
 *
 * This module is PURE: tweetnacl + @noble/hashes + canonicalJson, no DB, no
 * socket, no Express. It is duplicated byte-for-byte in mobile and desktop
 * (golden rule #5, parity) — `orgSig.vectors.ts` holds the shared golden
 * vectors all three copies assert against, so the three can never drift.
 *
 * NOT this module's job: replay defence. `nonce` is returned for the caller to
 * consume in a store scoped to the org until `exp` (the relay's `used_nonces`
 * table). A pure module cannot know whether a nonce was seen before.
 */

import nacl from 'tweetnacl';
import { sha256 } from '@noble/hashes/sha2';
import { canonicalBytes, type CanonicalValue } from './canonicalJson';

/**
 * SHA-256 — the ONLY line that differs between the three copies of this file.
 * Each package uses the hash it already ships (`@noble/hashes` here,
 * `node:crypto` on the relay) instead of adding a dependency; the golden
 * vectors in `orgSig.vectors.ts` prove all three produce identical bytes.
 */

/** Domain-separation prefix. Bump `v1` on any wire-format change. */
export const ORG_SIG_PREFIX = 'aegiswork/v1/';

/** Nonce entropy. 16 bytes = 128 bits: collisions are not a concern. */
export const ORG_NONCE_BYTES = 16;

/**
 * Longest life an action signature may claim (PROTOCOL.md §3: `exp` ≤ 5 min).
 * Short on purpose: the window in which a leaked-but-unused signature is
 * replayable, and the span the relay must keep a nonce to notice the replay.
 */
export const MAX_ACTION_TTL_MS = 5 * 60 * 1000;

/**
 * Tolerated clock skew between the signer's device and the relay, applied to
 * both ends of the validity window. Mirrors the ±1 bucket the inherited socket
 * auth allows.
 */
export const CLOCK_SKEW_MS = 60 * 1000;

/** Length of an `orgId`: 20 Crockford-base32 chars ≈ 100 bits of the key hash. */
export const ORG_ID_CHARS = 20;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The payload that gets canonicalized and signed. */
export interface OrgActionPayload {
  orgId: string;
  action: string;
  /** Every parameter the action mutates. Must be canonicalizable. */
  params: CanonicalValue;
  /** Base64 of 16 random bytes; the relay consumes it until `exp`. */
  nonce: string;
  /** Expiry, epoch ms. */
  exp: number;
}

/** A payload plus the signature over its canonical bytes. */
export interface SignedOrgAction {
  payload: OrgActionPayload;
  /** Base64 Ed25519 signature. */
  signature: string;
}

export type OrgVerifyFailure =
  | 'malformed'
  | 'action_mismatch'
  | 'bad_nonce'
  | 'ttl_too_long'
  | 'expired'
  | 'not_yet_valid'
  | 'bad_signature';

export type OrgVerifyResult =
  | { ok: true; payload: OrgActionPayload }
  | { ok: false; reason: OrgVerifyFailure };

function encodeBase32(bytes: Uint8Array, charsOut: number): string {
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  const totalBits = BigInt(bytes.length * 8);
  const needed = BigInt(charsOut * 5);
  if (totalBits > needed) bits >>= totalBits - needed;
  else if (totalBits < needed) bits <<= needed - totalBits;
  let out = '';
  for (let i = charsOut - 1; i >= 0; i--) {
    out += CROCKFORD[Number((bits >> BigInt(i * 5)) & 0x1fn)];
  }
  return out;
}

/**
 * `orgId = base32(sha256(orgPubKey))[0:20]` (PROTOCOL.md §2).
 *
 * The id is a function of the key, so knowing an `orgId` never lets anyone act
 * as that org: an impostor would need a second preimage of the hash AND the
 * private key. The relay recomputes this instead of trusting a client-supplied
 * pairing of id and key.
 */
export function deriveOrgId(orgPubKey: Uint8Array): string {
  if (orgPubKey.length !== nacl.sign.publicKeyLength) {
    throw new Error('deriveOrgId: expected a 32-byte Ed25519 public key');
  }
  return encodeBase32(sha256(orgPubKey), ORG_ID_CHARS);
}

/** True iff `orgId` is the id that `orgPubKey` derives to. Never throws. */
export function orgIdMatchesKey(orgId: string, orgPubKey: Uint8Array): boolean {
  try {
    return deriveOrgId(orgPubKey) === orgId;
  } catch {
    return false;
  }
}

/** A fresh action nonce (base64 of 16 random bytes). */
export function makeOrgNonce(): string {
  return toBase64(nacl.randomBytes(ORG_NONCE_BYTES));
}

/**
 * The exact bytes signed for `payload`.
 *
 * Exported so a verifier never reconstructs them by hand — producer and
 * verifier call the same function or the signature is meaningless.
 */
export function orgActionSigningBytes(payload: OrgActionPayload): Uint8Array {
  const prefix = new TextEncoder().encode(`${ORG_SIG_PREFIX}${payload.action}\n`);
  const body = canonicalBytes({
    orgId: payload.orgId,
    action: payload.action,
    params: payload.params,
    nonce: payload.nonce,
    exp: payload.exp,
  });
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

/**
 * Sign an org action with the actor's Ed25519 secret key.
 *
 * `nonce` and `exp` default to a fresh nonce and now + `MAX_ACTION_TTL_MS`.
 * Pass them explicitly only to reproduce a payload (tests, vectors).
 */
export function signOrgAction(
  args: {
    orgId: string;
    action: string;
    params: CanonicalValue;
    nonce?: string;
    exp?: number;
  },
  actorSecretKey: Uint8Array,
): SignedOrgAction {
  if (actorSecretKey.length !== nacl.sign.secretKeyLength) {
    throw new Error('signOrgAction: expected a 64-byte Ed25519 secret key');
  }
  if (!args.action) throw new Error('signOrgAction: action is required');
  if (!args.orgId) throw new Error('signOrgAction: orgId is required');

  const payload: OrgActionPayload = {
    orgId: args.orgId,
    action: args.action,
    params: args.params,
    nonce: args.nonce ?? makeOrgNonce(),
    exp: args.exp ?? Date.now() + MAX_ACTION_TTL_MS,
  };
  const signature = toBase64(nacl.sign.detached(orgActionSigningBytes(payload), actorSecretKey));
  return { payload, signature };
}

/**
 * Verify a signed action against the actor's public key.
 *
 * Checks, in order: shape → the action the caller expected → nonce shape →
 * the claimed TTL is within policy → the window is open → the signature.
 *
 * `expectedAction` is REQUIRED: a verifier that accepts whatever action the
 * payload names has delegated its authorization decision to the attacker.
 * The caller still has to consume `payload.nonce` (replay) and check the
 * actor's certificate and role — this function only proves "this key signed
 * exactly these bytes, recently".
 */
export function verifyOrgAction(
  signed: SignedOrgAction,
  actorPubKey: Uint8Array,
  expectedAction: string,
  now: number = Date.now(),
): OrgVerifyResult {
  const payload = signed?.payload;
  if (
    !payload ||
    typeof payload.orgId !== 'string' ||
    typeof payload.action !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number' ||
    !Number.isSafeInteger(payload.exp) ||
    typeof signed.signature !== 'string' ||
    !payload.orgId
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.action !== expectedAction) return { ok: false, reason: 'action_mismatch' };

  let nonceBytes: Uint8Array;
  try {
    nonceBytes = fromBase64(payload.nonce);
  } catch {
    return { ok: false, reason: 'bad_nonce' };
  }
  if (nonceBytes.length !== ORG_NONCE_BYTES) return { ok: false, reason: 'bad_nonce' };

  // A signature may not claim a longer life than policy allows, even if it is
  // otherwise valid: without this an admin device could mint a year-long
  // authorization that survives its own certificate.
  if (payload.exp - now > MAX_ACTION_TTL_MS + CLOCK_SKEW_MS) {
    return { ok: false, reason: 'ttl_too_long' };
  }
  if (payload.exp + CLOCK_SKEW_MS < now) return { ok: false, reason: 'expired' };

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64(signed.signature);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (sigBytes.length !== nacl.sign.signatureLength) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (actorPubKey.length !== nacl.sign.publicKeyLength) {
    return { ok: false, reason: 'bad_signature' };
  }

  let bytes: Uint8Array;
  try {
    bytes = orgActionSigningBytes(payload);
  } catch {
    // canonicalJson refused the params (non-integer number, exotic object…).
    return { ok: false, reason: 'malformed' };
  }
  if (!nacl.sign.detached.verify(bytes, sigBytes, actorPubKey)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true, payload };
}

// ── base64 without tweetnacl-util ───────────────────────────────────────────
// Kept local so the three copies of this module (server, mobile, desktop) stay
// byte-identical in behaviour regardless of which base64 helper each package
// happens to ship.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : undefined;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : undefined;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw new Error('fromBase64: not canonical base64');
  }
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error('fromBase64: bad character');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
