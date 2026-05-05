-- Prevent more than one pending payment per compensation.
-- This avoids duplicate Stripe PaymentIntents for the same contribution.

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_single_pending_per_compensation
  ON payments (compensation_id)
  WHERE status = 'pending' AND deleted_at IS NULL;
