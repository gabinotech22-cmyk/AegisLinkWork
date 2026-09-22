/**
 * roles.ts — who may perform which org action (ADMIN-CONSOLE.md §3).
 *
 * The matrix in the doc, as a closed table the relay and both clients read
 * from. Three properties it exists to enforce:
 *
 *  1. **An org role never grants access to content.** Owner and admin can
 *     manage members, devices, policies and retention; nothing in this table
 *     lets them read a room they are not a member of. Room-scoped actions are
 *     decided by the ROOM role and explicitly refuse to fall back to the org
 *     role (`orgRoleIsNotEnough`), which is what makes "zero-knowledge admin"
 *     structural instead of a promise.
 *  2. **Only an owner touches ownership.** Naming admins, rotating the org key
 *     and setting policy `limits` are owner-only; an admin able to do any of
 *     them could promote itself and the distinction would be decorative.
 *  3. **A member may act on their own record.** Revoking their own device
 *     ("I lost my phone") and leaving the org must not need an admin — the
 *     `self` exception, checked against the authenticated actor, never against
 *     an id the caller supplies.
 *
 * Adding an action here means adding it to the closed audit-event table in
 * `DATA-MODEL.md` too: every authorized action becomes an audit entry, because
 * the signature that authorized it IS the entry (`PROTOCOL.md` §3).
 */

import type { OrgRole } from '../crypto/orgCert.js';

/** Roles inside a room — deliberately not the org roles (`DATA-MODEL.md`). */
export type RoomRole = 'moderator' | 'participant';

/**
 * Every action a signed payload may name. Mirrors the closed audit-event table
 * (`DATA-MODEL.md`); an action outside this union is refused before any
 * signature check, so an unknown action can never be "allowed by default".
 */
export type OrgAction =
  | 'org.key_rotated'
  | 'org.limits_set'
  | 'policy.updated'
  | 'invite.created'
  | 'invite.revoked'
  | 'member.approved'
  | 'member.role_changed'
  | 'member.suspended'
  | 'member.removed'
  | 'member.left'
  | 'device.approved'
  | 'device.revoked'
  | 'room.created'
  | 'room.archived'
  | 'room.member_added'
  | 'room.member_removed'
  | 'room.rekeyed'
  | 'audit.exported';

interface ActionRule {
  /** Org roles allowed to perform it. Empty = nobody, by org role alone. */
  readonly orgRoles: readonly OrgRole[];
  /**
   * Room roles allowed, for actions scoped to one room. When present, the org
   * role alone is NEVER sufficient: an owner who is not in the room cannot
   * add members to it or force its rekey.
   */
  readonly roomRoles?: readonly RoomRole[];
  /** The actor may perform it on their own record regardless of org role. */
  readonly self?: boolean;
}

const OWNER_ONLY: readonly OrgRole[] = ['owner'];
const ADMINS: readonly OrgRole[] = ['owner', 'admin'];
const NOBODY: readonly OrgRole[] = [];

/** The matrix. Every row traces to a line of `ADMIN-CONSOLE.md` §3. */
export const ACTION_RULES: Readonly<Record<OrgAction, ActionRule>> = {
  // Ownership and the limits that bound every other policy: owner only.
  'org.key_rotated': { orgRoles: OWNER_ONLY },
  'org.limits_set': { orgRoles: OWNER_ONLY },
  // Editing a policy within those limits is delegated to admins.
  'policy.updated': { orgRoles: ADMINS },

  'invite.created': { orgRoles: ADMINS },
  'invite.revoked': { orgRoles: ADMINS },

  'member.approved': { orgRoles: ADMINS },
  // Promoting to admin/owner is owner-only; the caller checks the TARGET role
  // separately (see `roleChangeNeedsOwner`), since the same action name covers
  // demotions an admin may perform.
  'member.role_changed': { orgRoles: ADMINS },
  'member.suspended': { orgRoles: ADMINS },
  'member.removed': { orgRoles: ADMINS },
  // Anyone may walk out; an owner only if another owner remains (checked by
  // the caller against live state, not by a role table).
  'member.left': { orgRoles: NOBODY, self: true },

  'device.approved': { orgRoles: ADMINS },
  // Admins revoke anyone's device; a member revokes their OWN.
  'device.revoked': { orgRoles: ADMINS, self: true },

  'room.created': { orgRoles: ADMINS },
  'room.archived': { orgRoles: ADMINS, roomRoles: ['moderator'] },
  // Membership of a room is the room's business. An owner who wants in has to
  // be added like anybody else, and the whole room sees it.
  'room.member_added': { orgRoles: NOBODY, roomRoles: ['moderator'] },
  'room.member_removed': { orgRoles: NOBODY, roomRoles: ['moderator'] },
  'room.rekeyed': { orgRoles: ADMINS, roomRoles: ['moderator'] },

  'audit.exported': { orgRoles: ADMINS },
};

const ACTION_NAMES = new Set<string>(Object.keys(ACTION_RULES));

/** True iff `action` is one this build knows. Unknown actions are refused. */
export function isOrgAction(action: string): action is OrgAction {
  return ACTION_NAMES.has(action);
}

/** True iff the action is decided by a room role rather than the org role. */
export function isRoomScoped(action: OrgAction): boolean {
  return ACTION_RULES[action].roomRoles !== undefined;
}

export interface RoleCheck {
  action: OrgAction;
  /** Org role from the actor's verified membership certificate. */
  orgRole: OrgRole;
  /** Room role from the room's member list, when the action names a room. */
  roomRole?: RoomRole;
  /**
   * True when the action targets the actor's own record (their device, their
   * membership). Derived from the authenticated actor, never from a field the
   * caller supplies — golden rule #7.
   */
  isSelf?: boolean;
}

export type RoleFailure =
  | 'unknown_action'
  | 'org_role_insufficient'
  | 'room_role_required'
  | 'room_role_insufficient';

export type RoleResult = { ok: true } | { ok: false; reason: RoleFailure };

/**
 * Decide whether `orgRole` (plus a room role, when the action is room-scoped)
 * may perform `action`.
 *
 * Fails closed: an unknown action, a missing room role for a room-scoped
 * action, or a role that is not on the list all return a reason instead of a
 * permissive default.
 */
export function checkRole(check: RoleCheck): RoleResult {
  if (!isOrgAction(check.action)) return { ok: false, reason: 'unknown_action' };
  const rule = ACTION_RULES[check.action];

  if (rule.roomRoles) {
    // Room-scoped: the org role is not a substitute. An owner who is not a
    // moderator of THIS room gets nothing here.
    if (check.roomRole === undefined) return { ok: false, reason: 'room_role_required' };
    if (!rule.roomRoles.includes(check.roomRole)) {
      return { ok: false, reason: 'room_role_insufficient' };
    }
    return { ok: true };
  }

  if (rule.self && check.isSelf) return { ok: true };
  if (rule.orgRoles.includes(check.orgRole)) return { ok: true };
  return { ok: false, reason: 'org_role_insufficient' };
}

/**
 * True when a `member.role_changed` needs an owner: granting or taking away
 * `admin`/`owner`.
 *
 * Separate from the table because one action name covers two very different
 * changes — an admin demoting a member to guest, and an admin trying to make
 * itself an owner. The certificate chain refuses to issue the resulting
 * certificate either way (`orgCert.verifyMembershipCertificate`); this is the
 * matching check at the action layer, so the attempt is refused before it is
 * recorded as authorized.
 */
export function roleChangeNeedsOwner(fromRole: OrgRole, toRole: OrgRole): boolean {
  const privileged = (r: OrgRole) => r === 'admin' || r === 'owner';
  return privileged(fromRole) || privileged(toRole);
}
