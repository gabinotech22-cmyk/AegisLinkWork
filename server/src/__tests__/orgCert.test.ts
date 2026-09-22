/**
 * orgCert.test.ts — the org certificate chain (PROTOCOL.md §2).
 *
 * The SAME test body runs in server, mobile and desktop (golden rule #5).
 *
 * The chain is what makes the relay untrusted, so most of these tests are
 * attacks: an admin minting itself an owner certificate, a certificate from
 * another org, a device approval moved to a different member, an expired or
 * unreasonably long-lived certificate, a swapped `kind`. Every one must fail
 * closed with a specific reason — a chain that "mostly" verifies is a chain
 * that grants whatever the attacker asked for.
 */

import nacl from 'tweetnacl';
import {
  CERT_CLOCK_SKEW_MS,
  MAX_CERT_LIFETIME_MS,
  certSigningBytes,
  keyId,
  signCertificate,
  verifyAdminCertificate,
  verifyDeviceApproval,
  verifyMembershipCertificate,
  type AdminCertBody,
  type AdminCertificate,
  type DeviceApproval,
  type DeviceApprovalBody,
  type MembershipCertBody,
  type MembershipCertificate,
} from '../crypto/orgCert.js';
import { deriveOrgId, toBase64 } from '../crypto/orgSig.js';

const keyFrom = (fill: number) => nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(fill));

const ORG = keyFrom(1);
const OWNER = keyFrom(2);
const ADMIN = keyFrom(3);
const MEMBER = keyFrom(4);
const OUTSIDER = keyFrom(5);
const DEVICE_SIG = keyFrom(6);
const DEVICE_BOX = nacl.box.keyPair.fromSecretKey(new Uint8Array(32).fill(7));

const ORG_ID = deriveOrgId(ORG.publicKey);
const NOW = 1_800_000_000_000;
const YEAR = MAX_CERT_LIFETIME_MS;

const window = (from = NOW - 1000, to = NOW + YEAR - 1000) => ({ notBefore: from, notAfter: to });

const adminBody = (over: Partial<AdminCertBody> = {}): AdminCertBody => ({
  orgId: ORG_ID,
  aegisId: 'ADM-1111-2222',
  role: 'admin',
  identityPubKey: toBase64(ADMIN.publicKey),
  ...window(),
  ...over,
});

const ownerBody = (over: Partial<AdminCertBody> = {}): AdminCertBody =>
  adminBody({ aegisId: 'OWN-1111-2222', role: 'owner', identityPubKey: toBase64(OWNER.publicKey), ...over });

const membershipBody = (over: Partial<MembershipCertBody> = {}): MembershipCertBody => ({
  orgId: ORG_ID,
  aegisId: 'MEM-3333-4444',
  displayName: 'Alice',
  role: 'member',
  teamIds: ['eng'],
  identityPubKey: toBase64(MEMBER.publicKey),
  ...window(),
  ...over,
});

const deviceBody = (over: Partial<DeviceApprovalBody> = {}): DeviceApprovalBody => ({
  orgId: ORG_ID,
  aegisId: 'MEM-3333-4444',
  deviceId: 'dev-1',
  devicePubKey: toBase64(DEVICE_BOX.publicKey),
  deviceSigKey: toBase64(DEVICE_SIG.publicKey),
  ...window(),
  ...over,
});

/** Admin certificate signed by the org key — the normal starting point. */
const adminCert = (over: Partial<AdminCertBody> = {}): AdminCertificate =>
  signCertificate('cert.admin', adminBody(over), ORG.secretKey);

const ownerCert = (over: Partial<AdminCertBody> = {}): AdminCertificate =>
  signCertificate('cert.admin', ownerBody(over), ORG.secretKey);

const membershipCert = (over: Partial<MembershipCertBody> = {}, signer = ADMIN.secretKey): MembershipCertificate =>
  signCertificate('cert.membership', membershipBody(over), signer);

const deviceApproval = (over: Partial<DeviceApprovalBody> = {}, signer = ADMIN.secretKey): DeviceApproval =>
  signCertificate('device.approve', deviceBody(over), signer);

const chain = (over: Partial<Parameters<typeof verifyMembershipCertificate>[1]> = {}) => ({
  orgPubKey: ORG.publicKey,
  adminCert: adminCert(),
  now: NOW,
  ...over,
});

describe('signing bytes', () => {
  it('domain-separate each certificate kind', () => {
    const body = adminBody();
    const asAdmin = new TextDecoder().decode(certSigningBytes('cert.admin', body));
    const asDevice = new TextDecoder().decode(certSigningBytes('device.approve', body));
    expect(asAdmin.startsWith('aegiswork/v1/cert.admin\n')).toBe(true);
    expect(asDevice.startsWith('aegiswork/v1/device.approve\n')).toBe(true);
    expect(asAdmin).not.toBe(asDevice);
  });

  it('are independent of field insertion order', () => {
    const a = certSigningBytes('cert.admin', adminBody());
    const reordered: AdminCertBody = {
      notAfter: adminBody().notAfter,
      identityPubKey: adminBody().identityPubKey,
      role: 'admin',
      aegisId: 'ADM-1111-2222',
      notBefore: adminBody().notBefore,
      orgId: ORG_ID,
    };
    expect(new TextDecoder().decode(certSigningBytes('cert.admin', reordered))).toBe(
      new TextDecoder().decode(a),
    );
  });
});

describe('signCertificate', () => {
  it('records the issuer key id', () => {
    expect(adminCert().issuerKeyId).toBe(keyId(ORG.publicKey));
    expect(membershipCert().issuerKeyId).toBe(keyId(ADMIN.publicKey));
  });

  it('refuses a window that ends before it starts', () => {
    expect(() => signCertificate('cert.admin', adminBody({ notBefore: NOW, notAfter: NOW - 1 }), ORG.secretKey)).toThrow(
      /notAfter/,
    );
  });

  it('refuses a lifetime longer than a year', () => {
    expect(() =>
      signCertificate('cert.admin', adminBody({ notBefore: NOW, notAfter: NOW + YEAR + 1 }), ORG.secretKey),
    ).toThrow(/lifetime/);
  });
});

describe('verifyAdminCertificate — anchored on the pinned org key', () => {
  it('accepts a certificate signed by the org key', () => {
    const res = verifyAdminCertificate(adminCert(), ORG.publicKey, NOW);
    expect(res.ok).toBe(true);
  });

  it('rejects one signed by anybody else, including a valid admin', () => {
    const forged = signCertificate('cert.admin', adminBody(), ADMIN.secretKey);
    expect(verifyAdminCertificate(forged, ORG.publicKey, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a certificate whose orgId is not the one the key derives to', () => {
    const otherOrg = signCertificate('cert.admin', adminBody({ orgId: 'AAAAAAAAAAAAAAAAAAAA' }), ORG.secretKey);
    expect(verifyAdminCertificate(otherOrg, ORG.publicKey, NOW)).toEqual({ ok: false, reason: 'org_mismatch' });
  });

  it('rejects a member certificate presented as an admin one', () => {
    const asAdmin = { ...membershipCert(), kind: 'cert.admin' } as unknown as AdminCertificate;
    expect(verifyAdminCertificate(asAdmin, ORG.publicKey, NOW).ok).toBe(false);
  });

  it('rejects a role that is not admin or owner', () => {
    const demoted = signCertificate('cert.admin', { ...adminBody(), role: 'member' } as unknown as AdminCertBody, ORG.secretKey);
    expect(verifyAdminCertificate(demoted, ORG.publicKey, NOW)).toEqual({ ok: false, reason: 'issuer_not_admin' });
  });

  it.each([
    ['expired', NOW + YEAR + CERT_CLOCK_SKEW_MS, 'expired'],
    ['not yet valid', NOW - YEAR, 'not_yet_valid'],
  ])('rejects a certificate %s', (_label, at, reason) => {
    expect(verifyAdminCertificate(adminCert(), ORG.publicKey, at as number)).toEqual({ ok: false, reason });
  });

  it('still accepts inside the skew window', () => {
    const cert = adminCert({ notBefore: NOW, notAfter: NOW + 1000 });
    expect(verifyAdminCertificate(cert, ORG.publicKey, NOW + 1000 + CERT_CLOCK_SKEW_MS - 1).ok).toBe(true);
  });

  it('rejects a lifetime longer than a year even if it verifies', () => {
    // Forged directly, bypassing signCertificate's own guard.
    const body = adminBody({ notBefore: NOW, notAfter: NOW + YEAR + 60_000 });
    const cert: AdminCertificate = {
      kind: 'cert.admin',
      body,
      issuerKeyId: keyId(ORG.publicKey),
      signature: toBase64(nacl.sign.detached(certSigningBytes('cert.admin', body), ORG.secretKey)),
    };
    expect(verifyAdminCertificate(cert, ORG.publicKey, NOW)).toEqual({ ok: false, reason: 'lifetime_too_long' });
  });

  it.each([
    ['null', null],
    ['no body', { kind: 'cert.admin', signature: 'x', issuerKeyId: 'y' }],
    ['orgId missing', { kind: 'cert.admin', body: { ...adminBody(), orgId: '' }, signature: 'x', issuerKeyId: 'y' }],
    ['notAfter as string', { kind: 'cert.admin', body: { ...adminBody(), notAfter: 'later' }, signature: 'x', issuerKeyId: 'y' }],
  ])('rejects malformed input: %s', (_label, input) => {
    expect(verifyAdminCertificate(input as unknown as AdminCertificate, ORG.publicKey, NOW).ok).toBe(false);
  });
});

describe('verifyMembershipCertificate — org key → admin → membership', () => {
  it('accepts a membership signed by a certified admin', () => {
    const res = verifyMembershipCertificate(membershipCert(), chain());
    expect(res).toEqual({ ok: true, body: membershipBody() });
  });

  it('rejects a membership signed by someone with no admin certificate', () => {
    const forged = membershipCert({}, OUTSIDER.secretKey);
    expect(verifyMembershipCertificate(forged, chain())).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects the whole chain when the admin certificate does not verify', () => {
    const fakeAdmin = signCertificate('cert.admin', adminBody(), OUTSIDER.secretKey);
    expect(verifyMembershipCertificate(membershipCert(), chain({ adminCert: fakeAdmin }))).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects a membership from another org even with a valid signature', () => {
    const otherOrgId = deriveOrgId(OUTSIDER.publicKey);
    const cert = membershipCert({ orgId: otherOrgId });
    expect(verifyMembershipCertificate(cert, chain())).toEqual({ ok: false, reason: 'org_mismatch' });
  });

  it('refuses an admin minting an admin — only an owner may (ADMIN-CONSOLE.md §3)', () => {
    const selfPromotion = membershipCert({ role: 'admin' });
    expect(verifyMembershipCertificate(selfPromotion, chain())).toEqual({ ok: false, reason: 'issuer_not_admin' });
  });

  it('refuses an admin minting an owner', () => {
    expect(verifyMembershipCertificate(membershipCert({ role: 'owner' }), chain())).toEqual({
      ok: false,
      reason: 'issuer_not_admin',
    });
  });

  it('lets an owner certify an admin', () => {
    const byOwner = membershipCert({ role: 'admin' }, OWNER.secretKey);
    expect(verifyMembershipCertificate(byOwner, chain({ adminCert: ownerCert() })).ok).toBe(true);
  });

  it('rejects a membership whose issuer key is revoked', () => {
    const opts = chain({ revokedKeyIds: [keyId(ADMIN.publicKey)] });
    expect(verifyMembershipCertificate(membershipCert(), opts)).toEqual({ ok: false, reason: 'issuer_revoked' });
  });

  it('rejects an expired membership under a still-valid admin', () => {
    const stale = membershipCert({ notBefore: NOW - YEAR, notAfter: NOW - CERT_CLOCK_SKEW_MS - 1000 });
    expect(verifyMembershipCertificate(stale, chain())).toEqual({ ok: false, reason: 'expired' });
  });

  it.each([
    ['teamIds not an array', { teamIds: 'eng' as unknown as string[] }],
    ['a team id that is not a string', { teamIds: [1 as unknown as string] }],
    ['an unknown role', { role: 'superuser' as unknown as MembershipCertBody['role'] }],
  ])('rejects a body with %s', (_label, over) => {
    const cert = membershipCert(over as Partial<MembershipCertBody>);
    expect(verifyMembershipCertificate(cert, chain()).ok).toBe(false);
  });

  it('rejects a tampered field even when every other check passes', () => {
    const cert = membershipCert();
    const tampered: MembershipCertificate = {
      ...cert,
      body: { ...cert.body, teamIds: ['eng', 'finance'] },
    };
    expect(verifyMembershipCertificate(tampered, chain())).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('verifyDeviceApproval — bound to its member', () => {
  const membership = membershipBody();

  it('accepts an approval signed by a certified admin', () => {
    expect(verifyDeviceApproval(deviceApproval(), membership, chain())).toEqual({ ok: true, body: deviceBody() });
  });

  it('refuses an approval issued for a different member', () => {
    const otherMember = deviceApproval({ aegisId: 'MEM-9999-0000' });
    expect(verifyDeviceApproval(otherMember, membership, chain())).toEqual({ ok: false, reason: 'subject_mismatch' });
  });

  it('refuses an approval signed by a non-admin', () => {
    const forged = deviceApproval({}, MEMBER.secretKey);
    expect(verifyDeviceApproval(forged, membership, chain())).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses an approval whose device signing key is revoked', () => {
    const opts = chain({ revokedKeyIds: [keyId(DEVICE_SIG.publicKey)] });
    expect(verifyDeviceApproval(deviceApproval(), membership, opts)).toEqual({ ok: false, reason: 'issuer_revoked' });
  });

  it('refuses a membership certificate replayed as a device approval', () => {
    const replayed = { ...membershipCert(), kind: 'device.approve' } as unknown as DeviceApproval;
    expect(verifyDeviceApproval(replayed, membership, chain()).ok).toBe(false);
  });

  it('refuses an expired approval', () => {
    const stale = deviceApproval({ notBefore: NOW - YEAR, notAfter: NOW - CERT_CLOCK_SKEW_MS - 1000 });
    expect(verifyDeviceApproval(stale, membership, chain())).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a tampered device key', () => {
    const approval = deviceApproval();
    const swapped: DeviceApproval = {
      ...approval,
      body: { ...approval.body, deviceSigKey: toBase64(OUTSIDER.publicKey) },
    };
    expect(verifyDeviceApproval(swapped, membership, chain())).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('keyId', () => {
  it('is 16 Crockford-base32 characters and key-specific', () => {
    expect(keyId(ORG.publicKey)).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(keyId(ORG.publicKey)).not.toBe(keyId(ADMIN.publicKey));
  });

  it('is the orgId truncated — same derivation, no second scheme', () => {
    expect(deriveOrgId(ORG.publicKey).startsWith(keyId(ORG.publicKey))).toBe(true);
  });
});
