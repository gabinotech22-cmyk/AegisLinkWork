/**
 * orgAuthorize.test.ts — the relay's gate for signed org actions.
 *
 * Covers the three pieces that decide whether an admin action executes:
 *   - `roles.ts`: the ADMIN-CONSOLE.md §3 matrix, especially that an org role
 *     never substitutes for a room role (zero-knowledge admin is structural);
 *   - `nonceRepo`: consume-once, atomic under concurrency, org-isolated;
 *   - `authorize.ts`: the full chain in order, failing closed at each stage and
 *     never burning a nonce for an action it refused.
 */

process.env['AEGIS_DB_PATH'] = ':memory:';

import nacl from 'tweetnacl';
import { initDb, closeDb } from '../db/client.js';
import { nonceRepo } from '../org/nonceRepo.js';
import { authorizeOrgAction } from '../org/authorize.js';
import {
  ACTION_RULES,
  checkRole,
  isOrgAction,
  isRoomScoped,
  roleChangeNeedsOwner,
  type OrgAction,
} from '../org/roles.js';
import {
  signCertificate,
  type AdminCertBody,
  type AdminCertificate,
  type MembershipCertBody,
  type MembershipCertificate,
} from '../crypto/orgCert.js';
import { deriveOrgId, makeOrgNonce, signOrgAction, toBase64 } from '../crypto/orgSig.js';

const keyFrom = (fill: number) => nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(fill));

const ORG = keyFrom(1);
const OWNER = keyFrom(2);
const ADMIN = keyFrom(3);
const MEMBER = keyFrom(4);
const OTHER_ORG = keyFrom(9);

const ORG_ID = deriveOrgId(ORG.publicKey);
const YEAR = 365 * 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await initDb();
});
afterAll(async () => {
  await closeDb();
});

const window = (now: number) => ({ notBefore: now - 1000, notAfter: now + YEAR - 1000 });

const adminCertFor = (now: number, role: 'admin' | 'owner' = 'admin'): AdminCertificate => {
  const key = role === 'owner' ? OWNER : ADMIN;
  const body: AdminCertBody = {
    orgId: ORG_ID,
    aegisId: role === 'owner' ? 'OWN-0000-0000' : 'ADM-0000-0000',
    role,
    identityPubKey: toBase64(key.publicKey),
    ...window(now),
  };
  return signCertificate('cert.admin', body, ORG.secretKey);
};

const membershipFor = (
  now: number,
  over: Partial<MembershipCertBody> = {},
  signer = ADMIN.secretKey,
): MembershipCertificate => {
  const body: MembershipCertBody = {
    orgId: ORG_ID,
    aegisId: 'MEM-1111-2222',
    displayName: 'Alice',
    role: 'member',
    teamIds: [],
    identityPubKey: toBase64(MEMBER.publicKey),
    ...window(now),
    ...over,
  };
  return signCertificate('cert.membership', body, signer);
};

/** An action signed by the identity the membership certificate names. */
const signedAction = (
  action: string,
  secretKey: Uint8Array,
  over: { orgId?: string; nonce?: string; exp?: number } = {},
) =>
  signOrgAction(
    {
      orgId: over.orgId ?? ORG_ID,
      action,
      params: { target: 'dev-1' },
      nonce: over.nonce,
      exp: over.exp,
    },
    secretKey,
  );

describe('roles matrix (ADMIN-CONSOLE.md §3)', () => {
  it('every action in the table is recognized, and nothing else is', () => {
    for (const action of Object.keys(ACTION_RULES)) expect(isOrgAction(action)).toBe(true);
    expect(isOrgAction('member.promote_self')).toBe(false);
    expect(isOrgAction('')).toBe(false);
  });

  it('refuses an unknown action instead of letting it through', () => {
    expect(checkRole({ action: 'room.nuke' as OrgAction, orgRole: 'owner' })).toEqual({
      ok: false,
      reason: 'unknown_action',
    });
  });

  it.each([
    ['org.key_rotated', 'owner', true],
    ['org.key_rotated', 'admin', false],
    ['org.limits_set', 'admin', false],
    ['policy.updated', 'admin', true],
    ['policy.updated', 'member', false],
    ['member.approved', 'admin', true],
    ['member.approved', 'member', false],
    ['audit.exported', 'admin', true],
    ['audit.exported', 'member', false],
    ['invite.created', 'guest', false],
  ] as const)('%s by %s → %s', (action, orgRole, allowed) => {
    expect(checkRole({ action, orgRole }).ok).toBe(allowed);
  });

  describe('an org role never grants room powers', () => {
    it.each(['owner', 'admin'] as const)('%s cannot add a room member without a room role', (orgRole) => {
      expect(checkRole({ action: 'room.member_added', orgRole })).toEqual({
        ok: false,
        reason: 'room_role_required',
      });
    });

    it.each(['owner', 'admin'] as const)('%s who is only a participant cannot remove one', (orgRole) => {
      expect(checkRole({ action: 'room.member_removed', orgRole, roomRole: 'participant' })).toEqual({
        ok: false,
        reason: 'room_role_insufficient',
      });
    });

    it('a plain member who moderates the room can', () => {
      expect(checkRole({ action: 'room.member_added', orgRole: 'member', roomRole: 'moderator' }).ok).toBe(true);
    });

    it('marks exactly the room-scoped actions as such', () => {
      const roomScoped = (Object.keys(ACTION_RULES) as OrgAction[]).filter(isRoomScoped).sort();
      expect(roomScoped).toEqual(['room.archived', 'room.member_added', 'room.member_removed', 'room.rekeyed']);
    });
  });

  describe('acting on your own record', () => {
    it('a member may revoke their own device', () => {
      expect(checkRole({ action: 'device.revoked', orgRole: 'member', isSelf: true }).ok).toBe(true);
    });

    it('but not someone else’s', () => {
      expect(checkRole({ action: 'device.revoked', orgRole: 'member', isSelf: false })).toEqual({
        ok: false,
        reason: 'org_role_insufficient',
      });
    });

    it('a guest may leave the org; nobody may remove a member without being an admin', () => {
      expect(checkRole({ action: 'member.left', orgRole: 'guest', isSelf: true }).ok).toBe(true);
      expect(checkRole({ action: 'member.removed', orgRole: 'member', isSelf: true }).ok).toBe(false);
    });
  });

  describe('role changes that need an owner', () => {
    it.each([
      ['member', 'admin', true],
      ['member', 'owner', true],
      ['admin', 'member', true],
      ['owner', 'admin', true],
      ['member', 'guest', false],
      ['guest', 'member', false],
    ] as const)('%s → %s needs owner: %s', (from, to, needs) => {
      expect(roleChangeNeedsOwner(from, to)).toBe(needs);
    });
  });
});

describe('nonceRepo — consume once', () => {
  it('spends a nonce the first time and refuses it afterwards', async () => {
    const nonce = makeOrgNonce();
    expect(await nonceRepo.consume(ORG_ID, nonce, Date.now() + 60_000)).toBe(true);
    expect(await nonceRepo.consume(ORG_ID, nonce, Date.now() + 60_000)).toBe(false);
    expect(await nonceRepo.isUsed(ORG_ID, nonce)).toBe(true);
  });

  it('is atomic: only one of many concurrent replays wins', async () => {
    const nonce = makeOrgNonce();
    const exp = Date.now() + 60_000;
    const results = await Promise.all(Array.from({ length: 8 }, () => nonceRepo.consume(ORG_ID, nonce, exp)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('isolates organizations: the same nonce is spendable once per org', async () => {
    const nonce = makeOrgNonce();
    const otherOrgId = deriveOrgId(OTHER_ORG.publicKey);
    expect(await nonceRepo.consume(ORG_ID, nonce, Date.now() + 60_000)).toBe(true);
    expect(await nonceRepo.consume(otherOrgId, nonce, Date.now() + 60_000)).toBe(true);
    expect(await nonceRepo.isUsed(otherOrgId, makeOrgNonce())).toBe(false);
  });

  it('purges rows whose window has closed, and keeps live ones', async () => {
    const stale = makeOrgNonce();
    const live = makeOrgNonce();
    const now = Date.now();
    await nonceRepo.consume(ORG_ID, stale, now - 1000);
    await nonceRepo.consume(ORG_ID, live, now + 60_000);
    const purged = await nonceRepo.purgeExpired(now);
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await nonceRepo.isUsed(ORG_ID, stale)).toBe(false);
    expect(await nonceRepo.isUsed(ORG_ID, live)).toBe(true);
  });
});

describe('authorizeOrgAction — the full gate, in order', () => {
  const base = (now: number) => ({
    expectedAction: 'device.revoked',
    membership: membershipFor(now, { role: 'admin' }, OWNER.secretKey),
    adminCert: adminCertFor(now, 'owner'),
    orgPubKey: ORG.publicKey,
    now,
  });

  it('authorizes a well-formed action from a certified admin and spends its nonce', async () => {
    const now = Date.now();
    const signed = signedAction('device.revoked', MEMBER.secretKey);
    const res = await authorizeOrgAction({ ...base(now), signed });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.actor.aegisId).toBe('MEM-1111-2222');
      expect(await nonceRepo.isUsed(ORG_ID, res.payload.nonce)).toBe(true);
    }
  });

  it('refuses the same action replayed, even though the signature is still valid', async () => {
    const now = Date.now();
    const signed = signedAction('device.revoked', MEMBER.secretKey);
    expect((await authorizeOrgAction({ ...base(now), signed })).ok).toBe(true);
    const replay = await authorizeOrgAction({ ...base(now), signed });
    expect(replay).toEqual({ ok: false, failure: { stage: 'nonce', reason: 'already_used' } });
  });

  it('refuses an action this build does not know, before doing any crypto', async () => {
    const now = Date.now();
    const signed = signedAction('member.promote_self', MEMBER.secretKey);
    const res = await authorizeOrgAction({ ...base(now), signed, expectedAction: 'member.promote_self' });
    expect(res).toEqual({ ok: false, failure: { stage: 'action', reason: 'unknown_action' } });
  });

  it('refuses an actor whose membership does not chain to the pinned org key', async () => {
    const now = Date.now();
    const foreign = membershipFor(now, { role: 'admin' }, OTHER_ORG.secretKey);
    const signed = signedAction('device.revoked', MEMBER.secretKey);
    const res = await authorizeOrgAction({ ...base(now), membership: foreign, signed });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.stage).toBe('certificate');
  });

  it('refuses a signature made by a key other than the one the certificate names', async () => {
    const now = Date.now();
    const signed = signedAction('device.revoked', ADMIN.secretKey); // admin signs for the member
    const res = await authorizeOrgAction({ ...base(now), signed });
    expect(res).toEqual({ ok: false, failure: { stage: 'signature', reason: 'bad_signature' } });
  });

  it('refuses an action aimed at another org, however valid its signature', async () => {
    const now = Date.now();
    const otherOrgId = deriveOrgId(OTHER_ORG.publicKey);
    const signed = signedAction('device.revoked', MEMBER.secretKey, { orgId: otherOrgId });
    const res = await authorizeOrgAction({ ...base(now), signed });
    // The signature covers orgId, so the mismatch surfaces at the signature
    // stage when the payload was signed for another org — either way it never
    // reaches the role check or the nonce.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(['org', 'signature']).toContain(res.failure.stage);
    expect(await nonceRepo.isUsed(ORG_ID, signed.payload.nonce)).toBe(false);
  });

  it('refuses an action the actor’s role does not allow', async () => {
    const now = Date.now();
    const signed = signedAction('audit.exported', MEMBER.secretKey);
    const res = await authorizeOrgAction({
      ...base(now),
      membership: membershipFor(now), // plain member
      adminCert: adminCertFor(now),
      signed,
      expectedAction: 'audit.exported',
    });
    expect(res).toEqual({ ok: false, failure: { stage: 'role', reason: 'org_role_insufficient' } });
  });

  it('refuses a room action from an admin who is not a moderator of that room', async () => {
    const now = Date.now();
    const signed = signedAction('room.member_added', MEMBER.secretKey);
    const res = await authorizeOrgAction({
      ...base(now),
      signed,
      expectedAction: 'room.member_added',
    });
    expect(res).toEqual({ ok: false, failure: { stage: 'role', reason: 'room_role_required' } });
  });

  it('never burns a nonce for an action it refused', async () => {
    const now = Date.now();
    const nonce = makeOrgNonce();
    const signed = signedAction('audit.exported', MEMBER.secretKey, { nonce });
    await authorizeOrgAction({
      ...base(now),
      membership: membershipFor(now),
      adminCert: adminCertFor(now),
      signed,
      expectedAction: 'audit.exported',
    });
    expect(await nonceRepo.isUsed(ORG_ID, nonce)).toBe(false);
    // …and the legitimate admin can still use it afterwards.
    const legit = signOrgAction(
      { orgId: ORG_ID, action: 'audit.exported', params: { target: 'dev-1' }, nonce },
      MEMBER.secretKey,
    );
    const res = await authorizeOrgAction({ ...base(now), signed: legit, expectedAction: 'audit.exported' });
    expect(res.ok).toBe(true);
  });

  it('refuses an expired action', async () => {
    const now = Date.now();
    const signed = signedAction('device.revoked', MEMBER.secretKey, { exp: now - 10 * 60 * 1000 });
    const res = await authorizeOrgAction({ ...base(now), signed });
    expect(res).toEqual({ ok: false, failure: { stage: 'signature', reason: 'expired' } });
  });

  it('refuses an actor whose issuing admin is revoked', async () => {
    const now = Date.now();
    const signed = signedAction('device.revoked', MEMBER.secretKey);
    const res = await authorizeOrgAction({
      ...base(now),
      signed,
      revokedKeyIds: [adminCertFor(now, 'owner').issuerKeyId],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toEqual({ stage: 'certificate', reason: 'issuer_revoked' });
  });
});
