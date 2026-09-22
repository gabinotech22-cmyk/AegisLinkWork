/**
 * orgSig.test.ts — signed org actions (PROTOCOL.md §3).
 *
 * The SAME test body runs in server, mobile and desktop against each package's
 * own copy of the module (golden rule #5). It asserts:
 *   (a) the golden vectors reproduce exactly — no platform drifts;
 *   (b) canonicalJson is deterministic and refuses what it cannot encode;
 *   (c) verification is fail-closed on every tampered field, not just the body.
 */

import nacl from 'tweetnacl';
import { canonicalJson } from '../crypto/canonicalJson.js';
import {
  CLOCK_SKEW_MS,
  MAX_ACTION_TTL_MS,
  deriveOrgId,
  fromBase64,
  makeOrgNonce,
  orgActionSigningBytes,
  orgIdMatchesKey,
  signOrgAction,
  toBase64,
  verifyOrgAction,
  type SignedOrgAction,
} from '../crypto/orgSig.js';
import {
  ACTION,
  CANONICAL_CASES,
  CANONICAL_PAYLOAD,
  CANONICAL_REJECTS,
  EXP,
  NONCE,
  ORG_ID,
  ORG_PUB_B64,
  ORG_SEED,
  PARAMS,
  SIGNATURE,
  SIGNING_BYTES_LENGTH,
} from './orgSig.vectors.js';

const org = nacl.sign.keyPair.fromSeed(ORG_SEED);

/** Signing at the vectors' fixed nonce/exp — the only way to reproduce them. */
const signVector = (): SignedOrgAction =>
  signOrgAction(
    { orgId: ORG_ID, action: ACTION, params: PARAMS as never, nonce: NONCE, exp: EXP },
    org.secretKey,
  );

/** A time inside the vector payload's validity window. */
const AT_VECTOR_TIME = EXP - 1000;

describe('canonicalJson', () => {
  it.each(CANONICAL_CASES.map((c) => [c.label, c.value, c.expected] as const))(
    'canonicalizes: %s',
    (_label, value, expected) => {
      expect(canonicalJson(value as never)).toBe(expected);
    },
  );

  it.each(CANONICAL_REJECTS.map((c) => [c.label, c.value] as const))(
    'refuses: %s',
    (_label, value) => {
      expect(() => canonicalJson(value as never)).toThrow(/canonicalJson/);
    },
  );

  it('is independent of key insertion order', () => {
    const a = { alpha: 1, beta: [1, 2], gamma: { z: 'z', a: 'a' } };
    const b = { gamma: { a: 'a', z: 'z' }, beta: [1, 2], alpha: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('refuses a circular structure instead of hanging', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(() => canonicalJson(cyclic as never)).toThrow(/circular/);
  });

  it('names the offending path so a signer can see what it rejected', () => {
    expect(() => canonicalJson({ outer: { inner: [1, 1.5] } } as never)).toThrow(/outer\.inner\[1\]/);
  });
});

describe('orgId derivation (PROTOCOL.md §2)', () => {
  it('matches the golden vector', () => {
    expect(toBase64(org.publicKey)).toBe(ORG_PUB_B64);
    expect(deriveOrgId(org.publicKey)).toBe(ORG_ID);
  });

  it('is 20 Crockford-base32 characters', () => {
    expect(ORG_ID).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
  });

  it('binds the id to the key: another key derives another id', () => {
    const other = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(9));
    expect(deriveOrgId(other.publicKey)).not.toBe(ORG_ID);
    expect(orgIdMatchesKey(ORG_ID, other.publicKey)).toBe(false);
    expect(orgIdMatchesKey(ORG_ID, org.publicKey)).toBe(true);
  });

  it('never throws on malformed input', () => {
    expect(orgIdMatchesKey(ORG_ID, new Uint8Array(3))).toBe(false);
    expect(() => deriveOrgId(new Uint8Array(3))).toThrow();
  });
});

describe('golden vectors — the three platforms sign identical bytes', () => {
  it('canonicalizes the payload exactly as frozen', () => {
    const canonical = canonicalJson({
      orgId: ORG_ID,
      action: ACTION,
      params: PARAMS,
      nonce: NONCE,
      exp: EXP,
    } as never);
    expect(canonical).toBe(CANONICAL_PAYLOAD);
  });

  it('produces the frozen signing bytes', () => {
    const bytes = orgActionSigningBytes({
      orgId: ORG_ID,
      action: ACTION,
      params: PARAMS as never,
      nonce: NONCE,
      exp: EXP,
    });
    expect(bytes.length).toBe(SIGNING_BYTES_LENGTH);
    expect(new TextDecoder().decode(bytes)).toBe(`aegiswork/v1/${ACTION}\n${CANONICAL_PAYLOAD}`);
  });

  it('produces the frozen signature', () => {
    expect(signVector().signature).toBe(SIGNATURE);
  });

  it('verifies the frozen signature', () => {
    const signed: SignedOrgAction = {
      payload: { orgId: ORG_ID, action: ACTION, params: PARAMS as never, nonce: NONCE, exp: EXP },
      signature: SIGNATURE,
    };
    expect(verifyOrgAction(signed, org.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: true,
      payload: signed.payload,
    });
  });
});

describe('verifyOrgAction — fail closed', () => {
  it('accepts a freshly signed action', () => {
    const signed = signOrgAction({ orgId: ORG_ID, action: ACTION, params: PARAMS as never }, org.secretKey);
    expect(verifyOrgAction(signed, org.publicKey, ACTION).ok).toBe(true);
  });

  it('rejects a signature from a different key', () => {
    const impostor = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(4));
    expect(verifyOrgAction(signVector(), impostor.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['orgId', (p: SignedOrgAction['payload']) => ({ ...p, orgId: 'AAAAAAAAAAAAAAAAAAAA' })],
    ['action', (p: SignedOrgAction['payload']) => ({ ...p, action: 'member.remove' })],
    ['nonce', (p: SignedOrgAction['payload']) => ({ ...p, nonce: toBase64(new Uint8Array(16).fill(8)) })],
    ['exp', (p: SignedOrgAction['payload']) => ({ ...p, exp: EXP + 1 })],
    ['a param value', (p: SignedOrgAction['payload']) => ({ ...p, params: { ...PARAMS, role: 'owner' } })],
    ['a param removed', (p: SignedOrgAction['payload']) => ({ ...p, params: { ...PARAMS, note: 'x' } })],
    ['an array reordered', (p: SignedOrgAction['payload']) => ({ ...p, params: { ...PARAMS, teamIds: ['t1', 't2'] } })],
  ])('rejects a payload with a tampered %s', (_label, tamper) => {
    const signed = signVector();
    // A tampered `action` is caught by the expected-action check, everything
    // else by the signature itself — either way the action does not execute.
    const tampered: SignedOrgAction = {
      payload: tamper(signed.payload) as SignedOrgAction['payload'],
      signature: signed.signature,
    };
    expect(verifyOrgAction(tampered, org.publicKey, ACTION, AT_VECTOR_TIME).ok).toBe(false);
  });

  it('rejects an action the caller did not expect, even with a valid signature', () => {
    expect(verifyOrgAction(signVector(), org.publicKey, 'member.remove', AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'action_mismatch',
    });
  });

  it('rejects an expired action once the skew window closes', () => {
    expect(verifyOrgAction(signVector(), org.publicKey, ACTION, EXP + CLOCK_SKEW_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('still accepts inside the skew window', () => {
    expect(verifyOrgAction(signVector(), org.publicKey, ACTION, EXP + CLOCK_SKEW_MS - 1).ok).toBe(true);
  });

  it('refuses a signature that claims a longer life than policy allows', () => {
    const now = Date.now();
    const greedy = signOrgAction(
      { orgId: ORG_ID, action: ACTION, params: PARAMS as never, exp: now + 365 * 24 * 60 * 60 * 1000 },
      org.secretKey,
    );
    expect(verifyOrgAction(greedy, org.publicKey, ACTION, now)).toEqual({ ok: false, reason: 'ttl_too_long' });
  });

  it('defaults to the policy TTL when the caller does not set one', () => {
    const now = Date.now();
    const signed = signOrgAction({ orgId: ORG_ID, action: ACTION, params: PARAMS as never }, org.secretKey);
    expect(signed.payload.exp - now).toBeLessThanOrEqual(MAX_ACTION_TTL_MS + 50);
    expect(signed.payload.exp).toBeGreaterThan(now);
  });

  it.each([
    ['nonce of the wrong length', toBase64(new Uint8Array(8))],
    ['nonce that is not base64', 'not base64!!'],
  ])('rejects a %s', (_label, nonce) => {
    const signed = signVector();
    const mangled: SignedOrgAction = { ...signed, payload: { ...signed.payload, nonce } };
    expect(verifyOrgAction(mangled, org.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'bad_nonce',
    });
  });

  it.each([
    ['garbage signature', 'zzzz'],
    ['truncated signature', toBase64(new Uint8Array(32))],
  ])('rejects a %s', (_label, signature) => {
    const mangled: SignedOrgAction = { ...signVector(), signature };
    expect(verifyOrgAction(mangled, org.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it.each([
    ['missing payload', { signature: SIGNATURE }],
    ['null', null],
    ['exp as a string', { payload: { orgId: ORG_ID, action: ACTION, params: {}, nonce: NONCE, exp: '1' }, signature: SIGNATURE }],
    ['empty orgId', { payload: { orgId: '', action: ACTION, params: {}, nonce: NONCE, exp: EXP }, signature: SIGNATURE }],
  ])('rejects a malformed input: %s', (_label, input) => {
    expect(verifyOrgAction(input as unknown as SignedOrgAction, org.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects params it cannot canonicalize instead of verifying something else', () => {
    const signed = signVector();
    const poisoned: SignedOrgAction = {
      payload: { ...signed.payload, params: { a: 1.5 } },
      signature: signed.signature,
    };
    expect(verifyOrgAction(poisoned, org.publicKey, ACTION, AT_VECTOR_TIME)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('nonces', () => {
  it('are 16 bytes and do not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const n = makeOrgNonce();
      expect(fromBase64(n).length).toBe(16);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
    }
  });
});

describe('base64 helpers', () => {
  it('round-trip arbitrary bytes', () => {
    for (const len of [0, 1, 2, 3, 16, 31, 32, 64, 255]) {
      const bytes = nacl.randomBytes(len);
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('refuse non-canonical input', () => {
    expect(() => fromBase64('a')).toThrow();
    expect(() => fromBase64('****')).toThrow();
    expect(() => fromBase64('AA=A')).toThrow();
  });
});
