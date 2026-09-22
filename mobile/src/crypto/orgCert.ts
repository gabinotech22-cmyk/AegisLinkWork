/**
 * orgCert.ts — the organization's certificate chain (PROTOCOL.md §2).
 *
 *   Org signing key (Ed25519, held by owners — never by the relay)
 *      └─ signs → Admin certificate      (who may act as admin/owner)
 *            └─ signs → Membership certificate (who belongs, with which role)
 *            └─ signs → Device approval        (which device may speak for them)
 *
 * Everything an admin does is authorized by a signature that chains back to the
 * org key the member pinned at enrolment. That is what makes the relay
 * untrusted: it validates the chain to decide what to serve, but a client
 * NEVER takes the relay's word for it — it re-validates the same chain itself.
 * A relay that invents a membership, promotes a guest to admin, or back-dates a
 * revocation produces bytes no org key ever signed, and every client rejects it.
 *
 * Certificates are NOT `orgSig` actions: an action is a one-shot authorization
 * that expires in minutes and carries a nonce; a certificate is a statement of
 * standing valid for up to a year and deliberately replayable (that is what
 * "presenting your certificate" means). They share the canonical encoding and
 * the domain-separation prefix, so a certificate can never be replayed as an
 * action or vice versa: the prefixes differ (`cert.*` / `device.approve` vs a
 * mutating action name) and the bodies have different required fields.
 *
 * PURE module (tweetnacl + canonicalJson), duplicated in server, mobile and
 * desktop with shared golden vectors — golden rule #5.
 *
 * What this module deliberately does NOT do:
 *   - revocation lookup. A certificate can be valid and its subject revoked
 *     five minutes later; only the relay's live state knows. Callers check
 *     revocation separately (`verifyChain` takes `revokedKeyIds`).
 *   - role→action authorization. That table is `ADMIN-CONSOLE.md` §3 and lives
 *     where the action is executed.
 */

import nacl from 'tweetnacl';
import { canonicalBytes, type CanonicalValue } from './canonicalJson';
import { ORG_SIG_PREFIX, deriveOrgId, fromBase64, toBase64 } from './orgSig';

/** Roles that exist in an organization (`DATA-MODEL.md`). */
export type OrgRole = 'owner' | 'admin' | 'member' | 'guest';

/** Roles an admin certificate may grant. */
export type AdminRole = Extract<OrgRole, 'owner' | 'admin'>;

export type CertKind = 'cert.admin' | 'cert.membership' | 'device.approve';

/** Longest life a certificate may claim (PROTOCOL.md §2: ≤ 1 year). */
export const MAX_CERT_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

/** Clock skew tolerated at both ends of a validity window. */
export const CERT_CLOCK_SKEW_MS = 60 * 1000;

/** Fingerprint length (Crockford base32 chars) used for `issuerKeyId`. */
export const KEY_ID_CHARS = 16;

interface CertCommon {
  orgId: string;
  /** Epoch ms. */
  notBefore: number;
  /** Epoch ms. */
  notAfter: number;
}

/** "This identity may act as admin/owner of this org." Signed by the org key. */
export interface AdminCertBody extends CertCommon {
  aegisId: string;
  role: AdminRole;
  /** Base64 Ed25519 identity key of the admin — the key that signs actions. */
  identityPubKey: string;
}

/** "This identity belongs to this org, with this role." Signed by an admin. */
export interface MembershipCertBody extends CertCommon {
  aegisId: string;
  /** Visible only to org members (`THREAT-MODEL.md` §4). */
  displayName: string;
  role: OrgRole;
  teamIds: string[];
  identityPubKey: string;
}

/** "This device may speak for this member." Signed by an admin. */
export interface DeviceApprovalBody extends CertCommon {
  aegisId: string;
  deviceId: string;
  /** Base64 X25519 key the device receives sealed room keys on. */
  devicePubKey: string;
  /** Base64 Ed25519 key the device authenticates the socket with. */
  deviceSigKey: string;
}

export type CertBody = AdminCertBody | MembershipCertBody | DeviceApprovalBody;

export interface Certificate<B extends CertBody = CertBody> {
  kind: CertKind;
  body: B;
  /** Fingerprint of the signing key — for lookup and diagnostics only. */
  issuerKeyId: string;
  /** Base64 Ed25519 signature over `certSigningBytes`. */
  signature: string;
}

export type AdminCertificate = Certificate<AdminCertBody>;
export type MembershipCertificate = Certificate<MembershipCertBody>;
export type DeviceApproval = Certificate<DeviceApprovalBody>;

export type CertFailure =
  | 'malformed'
  | 'kind_mismatch'
  | 'org_mismatch'
  | 'window_invalid'
  | 'lifetime_too_long'
  | 'not_yet_valid'
  | 'expired'
  | 'bad_signature'
  | 'issuer_revoked'
  | 'issuer_not_admin'
  | 'subject_mismatch';

export type CertResult<B extends CertBody> =
  | { ok: true; body: B }
  | { ok: false; reason: CertFailure };

/**
 * Short fingerprint of a public key, for `issuerKeyId`.
 *
 * Only an index: verification always uses the key actually presented in the
 * chain, never a key looked up by this id. A collision therefore costs a
 * confusing log line, not a forged certificate.
 */
export function keyId(pubKey: Uint8Array): string {
  // Same derivation as `orgId` (base32 of sha256), truncated. Not a trust
  // anchor — see the note above.
  return deriveOrgId(pubKey).slice(0, KEY_ID_CHARS);
}

/**
 * The exact bytes a certificate is signed over.
 *
 * `aegiswork/v1/<kind>\n` + canonicalJson(body). The kind is inside the
 * domain-separated prefix, so an admin certificate's bytes can never verify as
 * a device approval even if their bodies were made to collide.
 */
export function certSigningBytes(kind: CertKind, body: CertBody): Uint8Array {
  const prefix = new TextEncoder().encode(`${ORG_SIG_PREFIX}${kind}\n`);
  const encoded = canonicalBytes(body as unknown as CanonicalValue);
  const out = new Uint8Array(prefix.length + encoded.length);
  out.set(prefix, 0);
  out.set(encoded, prefix.length);
  return out;
}

/** Sign a certificate body with the issuer's Ed25519 secret key. */
export function signCertificate<B extends CertBody>(
  kind: CertKind,
  body: B,
  issuerSecretKey: Uint8Array,
): Certificate<B> {
  if (issuerSecretKey.length !== nacl.sign.secretKeyLength) {
    throw new Error('signCertificate: expected a 64-byte Ed25519 secret key');
  }
  if (body.notAfter <= body.notBefore) {
    throw new Error('signCertificate: notAfter must be after notBefore');
  }
  if (body.notAfter - body.notBefore > MAX_CERT_LIFETIME_MS) {
    throw new Error('signCertificate: certificate lifetime exceeds one year');
  }
  const issuerPub = issuerSecretKey.slice(nacl.sign.secretKeyLength - nacl.sign.publicKeyLength);
  return {
    kind,
    body,
    issuerKeyId: keyId(issuerPub),
    signature: toBase64(nacl.sign.detached(certSigningBytes(kind, body), issuerSecretKey)),
  };
}

function checkCommon(
  cert: Certificate,
  kind: CertKind,
  orgId: string,
  now: number,
): CertFailure | null {
  if (!cert || typeof cert !== 'object' || !cert.body || typeof cert.signature !== 'string') {
    return 'malformed';
  }
  const { body } = cert;
  if (
    typeof body.orgId !== 'string' ||
    !body.orgId ||
    !Number.isSafeInteger(body.notBefore) ||
    !Number.isSafeInteger(body.notAfter)
  ) {
    return 'malformed';
  }
  if (cert.kind !== kind) return 'kind_mismatch';
  // The orgId the caller is acting under, never the one the certificate claims:
  // a certificate from another org must not authorize anything here.
  if (body.orgId !== orgId) return 'org_mismatch';
  if (body.notAfter <= body.notBefore) return 'window_invalid';
  if (body.notAfter - body.notBefore > MAX_CERT_LIFETIME_MS) return 'lifetime_too_long';
  if (now + CERT_CLOCK_SKEW_MS < body.notBefore) return 'not_yet_valid';
  if (now - CERT_CLOCK_SKEW_MS > body.notAfter) return 'expired';
  return null;
}

function checkSignature(cert: Certificate, kind: CertKind, issuerPubKey: Uint8Array): boolean {
  if (issuerPubKey.length !== nacl.sign.publicKeyLength) return false;
  let sig: Uint8Array;
  try {
    sig = fromBase64(cert.signature);
  } catch {
    return false;
  }
  if (sig.length !== nacl.sign.signatureLength) return false;
  let bytes: Uint8Array;
  try {
    bytes = certSigningBytes(kind, cert.body);
  } catch {
    // canonicalJson refused the body — it cannot be what the issuer signed.
    return false;
  }
  return nacl.sign.detached.verify(bytes, sig, issuerPubKey);
}

/**
 * Verify an admin certificate directly against the organization's public key.
 *
 * `orgPubKey` is the key the member pinned at enrolment after comparing the
 * fingerprint out of band — the single trust anchor. `orgId` is recomputed from
 * it rather than trusted from the certificate, so a certificate that names
 * another org's id cannot slip through.
 */
export function verifyAdminCertificate(
  cert: AdminCertificate,
  orgPubKey: Uint8Array,
  now: number = Date.now(),
): CertResult<AdminCertBody> {
  let orgId: string;
  try {
    orgId = deriveOrgId(orgPubKey);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const common = checkCommon(cert, 'cert.admin', orgId, now);
  if (common) return { ok: false, reason: common };

  const body = cert.body;
  if (typeof body.aegisId !== 'string' || !body.aegisId || typeof body.identityPubKey !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (body.role !== 'admin' && body.role !== 'owner') return { ok: false, reason: 'issuer_not_admin' };
  if (!checkSignature(cert, 'cert.admin', orgPubKey)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, body };
}

export interface ChainOptions {
  /** The pinned org key — the only trust anchor. */
  orgPubKey: Uint8Array;
  /** The issuing admin's certificate, signed by the org key. */
  adminCert: AdminCertificate;
  /**
   * `issuerKeyId`s known to be revoked. A certificate stays cryptographically
   * valid after its subject is thrown out; only live state knows that, so the
   * caller supplies it.
   */
  revokedKeyIds?: readonly string[];
  now?: number;
}

/**
 * Verify a membership certificate: org key → admin certificate → membership.
 *
 * Every link is checked, in this order, and any failure stops the chain: an
 * admin certificate that does not verify against the pinned org key makes the
 * membership it signed worthless, no matter how well-formed.
 */
export function verifyMembershipCertificate(
  cert: MembershipCertificate,
  options: ChainOptions,
): CertResult<MembershipCertBody> {
  const now = options.now ?? Date.now();
  const admin = verifyAdminCertificate(options.adminCert, options.orgPubKey, now);
  if (!admin.ok) return { ok: false, reason: admin.reason };
  if (options.revokedKeyIds?.includes(options.adminCert.issuerKeyId)) {
    return { ok: false, reason: 'issuer_revoked' };
  }
  if (options.revokedKeyIds?.includes(fingerprintOf(admin.body.identityPubKey))) {
    return { ok: false, reason: 'issuer_revoked' };
  }

  const common = checkCommon(cert, 'cert.membership', admin.body.orgId, now);
  if (common) return { ok: false, reason: common };

  const body = cert.body;
  if (
    typeof body.aegisId !== 'string' ||
    !body.aegisId ||
    typeof body.displayName !== 'string' ||
    typeof body.identityPubKey !== 'string' ||
    !Array.isArray(body.teamIds) ||
    body.teamIds.some((t) => typeof t !== 'string')
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (body.role !== 'owner' && body.role !== 'admin' && body.role !== 'member' && body.role !== 'guest') {
    return { ok: false, reason: 'malformed' };
  }
  // Only an owner may certify another owner or an admin: an admin that could
  // mint admins would make the owner-only rows of ADMIN-CONSOLE.md §3
  // unenforceable (it could promote itself by issuing its own certificate).
  if ((body.role === 'owner' || body.role === 'admin') && admin.body.role !== 'owner') {
    return { ok: false, reason: 'issuer_not_admin' };
  }

  let issuerKey: Uint8Array;
  try {
    issuerKey = fromBase64(admin.body.identityPubKey);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!checkSignature(cert, 'cert.membership', issuerKey)) return { ok: false, reason: 'bad_signature' };
  return { ok: true, body };
}

/**
 * Verify a device approval and bind it to the member it claims to belong to.
 *
 * `membership` must already be verified by the caller (pass the body returned
 * by `verifyMembershipCertificate`). Without the binding check an approval
 * issued for one member's device would authorize it to act for another.
 */
export function verifyDeviceApproval(
  approval: DeviceApproval,
  membership: MembershipCertBody,
  options: ChainOptions,
): CertResult<DeviceApprovalBody> {
  const now = options.now ?? Date.now();
  const admin = verifyAdminCertificate(options.adminCert, options.orgPubKey, now);
  if (!admin.ok) return { ok: false, reason: admin.reason };
  if (options.revokedKeyIds?.includes(options.adminCert.issuerKeyId)) {
    return { ok: false, reason: 'issuer_revoked' };
  }
  if (options.revokedKeyIds?.includes(fingerprintOf(admin.body.identityPubKey))) {
    return { ok: false, reason: 'issuer_revoked' };
  }

  const common = checkCommon(approval, 'device.approve', admin.body.orgId, now);
  if (common) return { ok: false, reason: common };

  const body = approval.body;
  if (
    typeof body.aegisId !== 'string' ||
    typeof body.deviceId !== 'string' ||
    !body.deviceId ||
    typeof body.devicePubKey !== 'string' ||
    typeof body.deviceSigKey !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (body.aegisId !== membership.aegisId) return { ok: false, reason: 'subject_mismatch' };
  if (options.revokedKeyIds?.includes(fingerprintOf(body.deviceSigKey))) {
    return { ok: false, reason: 'issuer_revoked' };
  }

  let issuerKey: Uint8Array;
  try {
    issuerKey = fromBase64(admin.body.identityPubKey);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!checkSignature(approval, 'device.approve', issuerKey)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true, body };
}

/** `keyId` of a base64-encoded public key; '' when it cannot be decoded. */
export function fingerprintOf(pubKeyB64: string): string {
  try {
    return keyId(fromBase64(pubKeyB64));
  } catch {
    return '';
  }
}
