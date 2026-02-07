/**
 * Provider outcomes normalized from gateway-specific responses.
 */
export type PaymentGatewayOutcome =
  | 'authorized'
  | 'declined'
  | 'in_review'
  | 'timeout'
  | 'canceled';

/**
 * Payload used to create a card charge in the selected gateway.
 */
export type CreatePaymentChargeInput = {
  paymentId: string;
  compensationId: string;
  amount: number;
  currency: string;
  cardNumber: string;
  cardholderName: string;
  expirationMonth: number;
  expirationYear: number;
  cvv: string;
  installments: number;
};

/**
 * Gateway result returned when a charge is created.
 */
export type PaymentGatewayChargeResult = {
  provider: string;
  providerReference: string;
  outcome: PaymentGatewayOutcome;
  processedAt: Date;
};

/**
 * Gateway result returned when checking charge status.
 */
export type PaymentGatewayStatusResult = {
  provider: string;
  providerReference: string;
  outcome: PaymentGatewayOutcome;
  processedAt: Date;
};

/**
 * Outbound port for payment providers.
 */
export interface PaymentGatewayAdapter {
  readonly provider: string;

  createCharge(input: CreatePaymentChargeInput): Promise<PaymentGatewayChargeResult>;

  getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult>;

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): boolean;
}
