/**
 * Compensation lifecycle state tracked by payment orchestration.
 */
export type CompensationStatus = 'pending' | 'paid' | 'canceled' | 'refunded';

/**
 * Payment lifecycle state persisted for each payment record.
 */
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/**
 * Minimal compensation data required to validate payment ownership and amount.
 */
export type PaymentCompensationSnapshot = {
  id: string;
  supporterUserId: string;
  areaId: string;
  totalAmount: number;
  currency: string;
  status: CompensationStatus;
};

/**
 * Record used to persist a newly created payment.
 */
export type PaymentCreateRecord = {
  id: string;
  compensationId: string;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  paymentMethod?: string;
  stripePaymentIntentId?: string;
};

/**
 * Locked payment + compensation projection used inside transactional workflows.
 */
export type LockedPaymentRecord = {
  id: string;
  compensationId: string;
  supporterUserId: string;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  compensationStatus: CompensationStatus;
  paidAt?: Date;
};

/**
 * Lightweight representation for background reconciliation batches.
 */
export type PendingPaymentRecord = {
  id: string;
  compensationId: string;
  supporterUserId: string;
  provider: string;
  providerReference: string;
  amount: number;
  currency: string;
  paymentStatus: 'pending';
  compensationStatus: CompensationStatus;
};

/**
 * Snapshot required to issue a compensation certificate after financial confirmation.
 */
export type CompensationCertificateSnapshot = {
  id: string;
  supporterUserId: string;
  areaId: string;
  calculationId?: string | null;
  compensationMode?: 'tco2e' | 'tree_purchase' | null;
  horizonYears?: number | null;
  treesRequested?: number | null;
  pricePerTree?: number | null;
  estimatedTotalTCO2e?: number | null;
  totalTCO2e: number;
  treesCount: number;
  totalAmount: number;
  currency: string;
  status: CompensationStatus;
};

/**
 * Unit-of-work contract for payment operations that require row-level locks.
 */
export interface PaymentTransaction {
  lockCompensation(compensationId: string): Promise<PaymentCompensationSnapshot | null>;

  lockLatestPendingPaymentByCompensationId(
    compensationId: string
  ): Promise<LockedPaymentRecord | null>;

  insertPayment(record: PaymentCreateRecord): Promise<void>;

  lockPaymentById(paymentId: string): Promise<LockedPaymentRecord | null>;

  lockPaymentByProviderReference(input: {
    provider: string;
    providerReference: string;
  }): Promise<LockedPaymentRecord | null>;

  lockPaymentByStripePaymentIntentId(
    stripePaymentIntentId: string
  ): Promise<LockedPaymentRecord | null>;

  updatePaymentStatus(input: {
    paymentId: string;
    status: PaymentStatus;
    updatedAt: Date;
    paidAt?: Date;
  }): Promise<void>;

  updateCompensationStatus(input: {
    compensationId: string;
    status: 'pending' | 'paid' | 'canceled';
    updatedAt: Date;
  }): Promise<void>;
}

/**
 * Payment persistence port used by payment use cases and handlers.
 */
export interface PaymentStore {
  runInTransaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T>;

  listPendingPayments(limit: number): Promise<PendingPaymentRecord[]>;

  getCompensationForCertificate(
    compensationId: string
  ): Promise<CompensationCertificateSnapshot | null>;
}
