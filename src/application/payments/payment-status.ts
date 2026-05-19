import type { PaymentGatewayOutcome } from "./payment-gateway";
import type { CompensationStatus, PaymentStatus } from "./payment-store";

/**
 * Maps gateway outcomes to the internal payment status model.
 */
export function mapGatewayOutcomeToPaymentStatus(
  outcome: PaymentGatewayOutcome,
): PaymentStatus {
  switch (outcome) {
    case "authorized":
      return "paid";
    case "declined":
    case "canceled":
      return "failed";
    case "in_review":
    case "timeout":
      return "pending";
  }
}

/**
 * Resolves the next compensation status from the latest payment transition.
 */
export function resolveCompensationStatusFromPayment(input: {
  currentCompensationStatus: CompensationStatus;
  newPaymentStatus: PaymentStatus;
}): CompensationStatus {
  if (input.currentCompensationStatus === "refunded") {
    return "refunded";
  }

  if (input.newPaymentStatus === "paid") {
    return "paid";
  }

  if (
    input.newPaymentStatus === "failed" &&
    input.currentCompensationStatus === "pending"
  ) {
    return "canceled";
  }

  if (input.currentCompensationStatus === "canceled") {
    return "canceled";
  }

  if (input.currentCompensationStatus === "paid") {
    return "paid";
  }

  return "pending";
}
