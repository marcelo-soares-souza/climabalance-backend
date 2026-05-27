export type PaymentGatewayOutcome =
  | "authorized"
  | "declined"
  | "in_review"
  | "timeout"
  | "canceled";

export type PaymentGatewayStatusResult = {
  provider: string;
  providerReference: string;
  outcome: PaymentGatewayOutcome;
  processedAt: Date;
};

export interface PaymentGatewayAdapter {
  readonly provider: string;

  getChargeStatus(input: {
    providerReference: string;
  }): Promise<PaymentGatewayStatusResult>;

  verifyWebhookSignature(input: {
    payload: string;
    signature: string | null;
  }): Promise<boolean>;
}
