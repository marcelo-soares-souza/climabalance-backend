import type { HttpContext } from '../../shared/http/router';
import type { CompensationAtomicStore } from '../../application/compensations/create-compensation-atomic';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import { createCompensationSchema } from './schemas/compensation-schemas';
import { createCompensationAtomic } from '../../application/compensations/create-compensation-atomic';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';

export interface CompensationHandlersDeps {
  compensationStore: CompensationAtomicStore;
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

export function createCompensationHandlers(deps: CompensationHandlersDeps) {
  return {
    /**
     * POST /api/v1/compensations
     * Creates compensation in single atomic transaction and reserves area stock.
     */
    async create(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createCompensationSchema, body);

        const result = await createCompensationAtomic(
          {
            store: deps.compensationStore,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: deps.auditLog,
          },
          {
            supporterUserId: ctx.auth!.userId,
            areaId: validated.area_id,
            calculationId: validated.calculation_id,
            totalTCO2e: validated.total_t_co2e,
            treesCount: validated.trees_count,
            totalAmount: validated.total_amount,
            currency: validated.currency,
          }
        );

        return jsonResponse(
          201,
          {
            data: {
              compensation_id: result.compensationId,
              area_id: result.areaId,
              total_t_co2e: result.totalTCO2e,
              trees_count: result.treesCount,
              status: result.status,
              remaining_t_co2e: result.remainingTCO2e,
              created_at: result.createdAt,
            },
            message_key: 'compensation.created_pending',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
