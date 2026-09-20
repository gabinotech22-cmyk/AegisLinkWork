/**
 * web3.ts — AegisLink Work relay payment endpoints (Lightning stub)
 *
 * Work keeps only the per-seat subscription stub here (docs/ROADMAP.md §17).
 * DID resolution and DID-based device revocation from the personal edition
 * are gone: in Work, devices are revoked by org admins (docs/PROTOCOL.md).
 *
 * Privacy contract for all endpoints in this file:
 *   - No IP addresses are logged or stored.
 *   - No aegisId is accepted, required, or stored in Web3 tables.
 *   - Subscription activation is keyed on paymentHash only.
 *   - All validation errors return generic messages (no oracle leakage).
 */

import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import nacl from 'tweetnacl';
import { z } from 'zod';
import { web3Repo } from '../db/client.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

// ── POST /web3/subscription/invoice ──────────────────────────────────────────
// Generates a mock Lightning invoice. In production, replace the mock body
// with a real LND/CLN gRPC call. The server does not know who is requesting —
// no identity data is accepted or stored.

const PLAN_CONFIG: Record<number, { amountSats: number }> = {
  30:  { amountSats: 5_000 },
  90:  { amountSats: 12_000 },
  365: { amountSats: 40_000 },
};

const InvoiceBody = z.object({
  planDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  clientNonce: z.string().max(64).optional(),
});

router.post('/subscription/invoice', async (req, res) => {
  const parsed = InvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { planDays } = parsed.data;
  const plan = PLAN_CONFIG[planDays];

  const preimageBytes = nacl.randomBytes(32);
  const preimageHex = Buffer.from(preimageBytes).toString('hex');
  const paymentHash = sha256Hex(hexToBuffer(preimageHex));

  const createdAt = Date.now();
  const TTL_MS = 10 * 60 * 1000;
  const expiresAt = createdAt + TTL_MS;

  const bolt11 = `lnbc${plan.amountSats}n1mock_${paymentHash.slice(0, 16)}`;

  await web3Repo.insertInvoice({
    payment_hash: paymentHash,
    bolt11,
    amount_sats: plan.amountSats,
    plan_days: planDays,
    created_at: createdAt,
    expires_at: expiresAt,
  });

  res.status(201).json({
    bolt11,
    paymentHash,
    expiresAt,
    amountSats: plan.amountSats,
  });
});

// ── POST /web3/subscription/activate ─────────────────────────────────────────
// Verifies preimage against paymentHash using SHA-256, then activates the sub.
// No user identity is accepted. Activation is keyed only on paymentHash.

const ActivateBody = z.object({
  preimage: z.string().length(64).regex(/^[0-9a-f]+$/i, 'preimage must be hex'),
  paymentHash: z.string().length(64).regex(/^[0-9a-f]+$/i, 'paymentHash must be hex'),
});

router.post('/subscription/activate', async (req, res) => {
  const parsed = ActivateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }

  const { preimage, paymentHash } = parsed.data;

  const computed = sha256Hex(hexToBuffer(preimage));
  const match = timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(paymentHash.toLowerCase(), 'hex')
  );
  if (!match) {
    res.status(403).json({ error: 'invalid_preimage' });
    return;
  }

  const invoice = await web3Repo.getInvoice(paymentHash);
  if (!invoice) {
    res.status(404).json({ error: 'invoice_not_found' });
    return;
  }
  if (Date.now() > invoice.expires_at) {
    res.status(410).json({ error: 'invoice_expired' });
    return;
  }
  if (invoice.paid === 1) {
    const existing = await web3Repo.getSubscription(paymentHash);
    if (existing) {
      res.json({ active: true, expiresAt: existing.expires_at, planDays: existing.plan_days });
      return;
    }
  }

  const activatedAt = Date.now();
  const expiresAt = activatedAt + invoice.plan_days * 24 * 60 * 60 * 1000;

  await web3Repo.markInvoicePaid(paymentHash);
  await web3Repo.insertSubscription({
    payment_hash: paymentHash,
    plan_days: invoice.plan_days,
    activated_at: activatedAt,
    expires_at: expiresAt,
  });

  res.json({ active: true, expiresAt, planDays: invoice.plan_days });
});


export default router;
