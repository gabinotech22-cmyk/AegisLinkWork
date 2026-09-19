# Security Policy

AegisLink Work's value rests entirely on its security properties: the organization
administers membership and devices, but can never read content (zero-knowledge admin). If you believe
you have found a vulnerability, we want to know — and we will treat your
report seriously and credit you if you wish.

## Reporting a vulnerability

- **Email:** gabinotech22+security@gmail.com
- Please include: affected component (`mobile/`, `desktop/`, `server/`, protocol design, admin console),
  steps to reproduce or a proof of concept, and the impact as you understand it.
- You will receive an acknowledgement within **72 hours**.

Please use **coordinated disclosure**: give us up to **90 days** to ship a fix
before publishing details. We will keep you informed of progress and agree on
a publication date together.

You can also report privately via GitHub's **"Report a vulnerability"** button
on the Security tab. Our internal handling process (triage, SLAs, fix, CVE/GHSA)
is documented in [`docs/SECURITY-RESPONSE.md`](docs/SECURITY-RESPONSE.md).

## Scope

In scope:

- Cryptographic design and implementation (Double Ratchet, X3DH, sealed
  signaling, encrypted backups, attachment encryption).
- The Work relay: anything that lets the server (or a multi-tenant operator)
  learn message content, DM social-graph metadata, cross-organization data, or
  impersonate members or organizations.
- The admin model: anything that lets an organization admin (or the relay on
  their behalf) read content, replay or forge signed admin actions, or add a
  device/member to a room without every member being able to see it.
- The mobile and desktop apps: key extraction, lock-screen bypass, panic-mode
  bypass, policy bypass, message disclosure.

Out of scope:

- Denial of service against the public relay.
- Attacks requiring a rooted/jailbroken device or physical access to an
  unlocked phone.
- Social engineering.

## No warranty — pre-release software

AegisLink Work has **not yet undergone an independent security audit** and is
in its design phase (see `docs/ROADMAP.md`). The code is
published precisely so it can be reviewed. Until a formal audit is completed,
treat the software accordingly.
