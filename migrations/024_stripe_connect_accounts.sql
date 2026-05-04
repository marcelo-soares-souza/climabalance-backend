-- Stripe Connect Express accounts for producers and payment method columns.
-- Enables marketplace payment routing and Pix/card tracking per payment.

CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  stripe_account_id VARCHAR(100) NOT NULL UNIQUE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  country CHAR(2) NOT NULL DEFAULT 'BR',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi
  ON payments(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_connect_user
  ON stripe_connect_accounts(user_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE stripe_connect_accounts IS 'Stripe Connect Express accounts for producers who receive compensation payments';
COMMENT ON COLUMN stripe_connect_accounts.stripe_account_id IS 'Stripe account ID (acct_xxx)';
COMMENT ON COLUMN stripe_connect_accounts.charges_enabled IS 'Whether the connected account can receive charges';
COMMENT ON COLUMN stripe_connect_accounts.payouts_enabled IS 'Whether payouts are active for this account';
COMMENT ON COLUMN payments.payment_method IS 'Payment method: card or pix';
COMMENT ON COLUMN payments.stripe_payment_intent_id IS 'Stripe PaymentIntent ID (pi_xxx) for correlation';
