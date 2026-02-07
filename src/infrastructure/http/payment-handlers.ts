import type { HttpContext } from '../../shared/http/router';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import { buildLogContext } from '../../shared/http/log-context';
import { handleError } from './error-mapper';
import { simulateCardPaymentSchema } from './schemas/payment-schemas';
import {
  simulateCardPayment,
  type PaymentSimulationStore,
} from '../../application/payments/simulate-card-payment';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';

export interface PaymentHandlersDeps {
  paymentSimulationStore: PaymentSimulationStore;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: {
    log(entry: {
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    }): Promise<void>;
  };
}

export function createPaymentHandlers(deps: PaymentHandlersDeps) {
  return {
    /**
     * POST /api/v1/payments/simulate
     * Simulates credit card payment for a pending compensation.
     */
    async simulate(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(simulateCardPaymentSchema, body);

        const result = await simulateCardPayment(
          {
            store: deps.paymentSimulationStore,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: deps.auditLog,
          },
          {
            actorUserId: ctx.auth!.userId,
            actorRoles: ctx.auth!.roles,
            compensationId: validated.compensation_id,
            cardNumber: validated.card_number,
            cardholderName: validated.cardholder_name,
            expirationMonth: validated.expiration_month,
            expirationYear: validated.expiration_year,
            cvv: validated.cvv,
            installments: validated.installments,
          }
        );

        return jsonResponse(
          201,
          {
            data: {
              payment_id: result.paymentId,
              compensation_id: result.compensationId,
              provider: result.provider,
              provider_reference: result.providerReference,
              simulation_status: result.simulationStatus,
              payment_status: result.paymentStatus,
              compensation_status: result.compensationStatus,
              amount: result.amount,
              currency: result.currency,
              installments: result.installments,
              processed_at: result.processedAt,
            },
            message_key: 'payment.simulated',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
