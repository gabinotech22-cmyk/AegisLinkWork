/**
 * authorize.ts — the relay's gate for a signed org action (PROTOCOL.md §3).
 *
 * The doc's verification list, in one place and in this order:
 *
 *   signature → actor's certificate chain → role sufficient for the action →
 *   orgId of the certificate == orgId of the payload → nonce not yet used
 *
 * Order matters. The nonce is consumed LAST, once everything else has passed:
 * consuming it earlier would let anyone with a malformed or unauthorized
 * payload burn a nonce that a legitimate admin is about to use, turning a
 * replay defence into a denial-of-service lever.
 *
 * The `orgId` compared is the one from the VERIFIED certificate chain, never
 * the one in the URL, the socket handshake or a field the caller supplies
 * (golden rule #7). A payload that names another org is refused even when its
 * signature is perfectly valid for that other org — otherwise a legitimate
 * admin of org A could act inside org B by pointing their action at it.
 *
 * What this does NOT decide: whether the action makes sense against live state
 * (does the member exist, is another owner left, is the room archived). That
 * is the handler's job, after this returns `ok`.
 */

import {
  verifyOrgAction,
  type OrgActionPayload,
  type SignedOrgAction,
  type OrgVerifyFailure,
} from '../crypto/orgSig.js';
import {
  verifyMembershipCertificate,
  type AdminCertificate,
  type CertFailure,
  type MembershipCertBody,
  type MembershipCertificate,
} from '../crypto/orgCert.js';
import { fromBase64 } from '../crypto/orgSig.js';
import { checkRole, isOrgAction, type OrgAction, type RoleFailure, type RoomRole } from './roles.js';
import { nonceRepo } from './nonceRepo.js';

export type AuthorizeFailure =
  | { stage: 'action'; reason: 'unknown_action' }
  | { stage: 'signature'; reason: OrgVerifyFailure }
  | { stage: 'certificate'; reason: CertFailure }
  | { stage: 'role'; reason: RoleFailure }
  | { stage: 'org'; reason: 'org_mismatch' }
  | { stage: 'nonce'; reason: 'already_used' };

export type AuthorizeResult =
  | { ok: true; actor: MembershipCertBody; payload: OrgActionPayload }
  | { ok: false; failure: AuthorizeFailure };

export interface AuthorizeInput {
  /** The signed action as it arrived on the wire. */
  signed: SignedOrgAction;
  /** The action the handler is about to execute — never taken from the payload. */
  expectedAction: string;
  /** Actor's membership certificate, presented with the action. */
  membership: MembershipCertificate;
  /** Certificate of the admin that issued `membership`. */
  adminCert: AdminCertificate;
  /** The org key this relay has for the org — the trust anchor. */
  orgPubKey: Uint8Array;
  /** Room role of the actor in the room the action names, when room-scoped. */
  roomRole?: RoomRole;
  /** True when the action targets the actor's own record. Derived, not supplied. */
  isSelf?: boolean;
  /** Key ids known to be revoked (live relay state). */
  revokedKeyIds?: readonly string[];
  now?: number;
}

/**
 * Run the full check and consume the nonce.
 *
 * On `ok: false` nothing was consumed and nothing happened, so the caller can
 * report the reason without worrying about partial state.
 */
export async function authorizeOrgAction(input: AuthorizeInput): Promise<AuthorizeResult> {
  const now = input.now ?? Date.now();

  // 0. Is this an action this build knows at all? An unknown name can never be
  //    "allowed by default" — it is refused before any crypto work.
  if (!isOrgAction(input.expectedAction)) {
    return { ok: false, failure: { stage: 'action', reason: 'unknown_action' } };
  }
  const action: OrgAction = input.expectedAction;

  // 1. Certificate chain first: an actor whose membership does not chain to the
  //    pinned org key has no standing, whatever they signed.
  const cert = verifyMembershipCertificate(input.membership, {
    orgPubKey: input.orgPubKey,
    adminCert: input.adminCert,
    revokedKeyIds: input.revokedKeyIds,
    now,
  });
  if (!cert.ok) return { ok: false, failure: { stage: 'certificate', reason: cert.reason } };
  const actor = cert.body;

  // 2. Signature over the complete canonical payload, by the actor's identity
  //    key as stated in that certificate — not by a key the payload names.
  let actorKey: Uint8Array;
  try {
    actorKey = fromBase64(actor.identityPubKey);
  } catch {
    return { ok: false, failure: { stage: 'certificate', reason: 'malformed' } };
  }
  const verified = verifyOrgAction(input.signed, actorKey, action, now);
  if (!verified.ok) return { ok: false, failure: { stage: 'signature', reason: verified.reason } };
  const payload = verified.payload;

  // 3. The payload must be about the org the certificate belongs to. Compared
  //    against the verified certificate, never against a socket or URL field.
  if (payload.orgId !== actor.orgId) {
    return { ok: false, failure: { stage: 'org', reason: 'org_mismatch' } };
  }

  // 4. Role. Room-scoped actions are decided by the room role and never fall
  //    back to the org role (ADMIN-CONSOLE.md §3).
  const role = checkRole({
    action,
    orgRole: actor.role,
    roomRole: input.roomRole,
    isSelf: input.isSelf,
  });
  if (!role.ok) return { ok: false, failure: { stage: 'role', reason: role.reason } };

  // 5. Nonce last: only a fully authorized action gets to spend one, so a
  //    rejected payload cannot burn the nonce of one that is about to arrive.
  const fresh = await nonceRepo.consume(actor.orgId, payload.nonce, payload.exp);
  if (!fresh) return { ok: false, failure: { stage: 'nonce', reason: 'already_used' } };

  return { ok: true, actor, payload };
}
