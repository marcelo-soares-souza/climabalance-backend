import type { HttpContext } from '../../shared/http/router';
import type { CompensationAtomicStore } from '../../application/compensations/create-compensation-atomic';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import {
  createCompensationSchema,
  listCompensationsQuerySchema,
  quoteTreePurchaseSchema,
} from './schemas/compensation-schemas';
import { createCompensationAtomic } from '../../application/compensations/create-compensation-atomic';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';
import type { CompensationHistoryRepository } from '../../domain/compensations/repositories/compensation-history-repository';
import { listCompensations } from '../../application/compensations/list-compensations';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import {
  quoteTreePurchaseCompensation,
} from '../../application/compensations/quote-tree-purchase-compensation';

export interface CompensationHandlersDeps {
  areaRepository: AreaRepository;
  compensationStore: CompensationAtomicStore;
  compensationHistoryRepository: CompensationHistoryRepository;
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
        const mode = validated.compensation_mode ?? 'tco2e';

        let totalTCO2e = validated.total_t_co2e ?? 0;
        let treesCount = validated.trees_count ?? 0;
        let totalAmount = validated.total_amount ?? 0;
        let compensationMode: 'tco2e' | 'tree_purchase' = mode;
        let horizonYears: number | undefined;
        let treesRequested: number | undefined;
        let pricePerTree: number | undefined;
        let estimatedTotalTCO2e: number | undefined;

        if (mode === 'tree_purchase') {
          const quote = await quoteTreePurchaseCompensation(
            {
              areaRepository: deps.areaRepository,
            },
            {
              areaId: validated.area_id,
              treesRequested: validated.trees_requested!,
              currency: validated.currency,
            }
          );

          totalTCO2e = quote.estimatedTotalTCO2e;
          treesCount = quote.treesRequested;
          totalAmount = quote.totalAmount;
          compensationMode = 'tree_purchase';
          horizonYears = quote.horizonYears;
          treesRequested = quote.treesRequested;
          pricePerTree = quote.pricePerTree;
          estimatedTotalTCO2e = quote.estimatedTotalTCO2e;
        }

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
            compensationMode,
            horizonYears,
            treesRequested,
            pricePerTree,
            estimatedTotalTCO2e,
            totalTCO2e,
            treesCount,
            totalAmount,
            currency: validated.currency,
          }
        );

        return jsonResponse(
          201,
          {
            data: {
              compensation_id: result.compensationId,
              area_id: result.areaId,
              compensation_mode: result.compensationMode,
              horizon_years: result.horizonYears,
              trees_requested: result.treesRequested,
              price_per_tree: result.pricePerTree,
              estimated_total_t_co2e:
                result.estimatedTotalTCO2e ?? result.totalTCO2e,
              total_t_co2e: result.totalTCO2e,
              trees_count: result.treesCount,
              status: result.status,
              remaining_t_co2e: result.remainingTCO2e,
              created_at: result.createdAt,
              certificate: null,
            },
            message_key: 'compensation.created_pending',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/compensations
     * Lists compensation history for current authenticated user.
     */
    async listOwn(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
        const validated = parseWithSchema(listCompensationsQuerySchema, query);
        const result = await listCompensations(
          {
            historyRepository: deps.compensationHistoryRepository,
          },
          {
            supporterUserId: ctx.auth!.userId,
            actorUserId: ctx.auth!.userId,
            actorRoles: ctx.auth!.roles,
            status: validated.status,
            limit: validated.limit,
            offset: validated.offset,
          }
        );

        return jsonResponse(
          200,
          {
            data: result.map((item) => ({
              id: item.id,
              supporter_user_id: item.supporterUserId,
              area_id: item.areaId,
              area_name: item.areaName,
              calculation_id: item.calculationId,
              compensation_mode: item.compensationMode,
              horizon_years: item.horizonYears,
              trees_requested: item.treesRequested,
              price_per_tree: item.pricePerTree,
              estimated_total_t_co2e: item.estimatedTotalTCO2e,
              total_t_co2e: item.totalTCO2e,
              trees_count: item.treesCount,
              total_amount: item.totalAmount,
              currency: item.currency,
              status: item.status,
              created_at: item.createdAt,
            })),
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/users/:id/compensations
     * Lists compensation history for a given user (self/admin route).
     */
    async listByUser(ctx: HttpContext, userId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
        const validated = parseWithSchema(listCompensationsQuerySchema, query);
        const result = await listCompensations(
          {
            historyRepository: deps.compensationHistoryRepository,
          },
          {
            supporterUserId: userId,
            actorUserId: ctx.auth!.userId,
            actorRoles: ctx.auth!.roles,
            status: validated.status,
            limit: validated.limit,
            offset: validated.offset,
          }
        );

        return jsonResponse(
          200,
          {
            data: result.map((item) => ({
              id: item.id,
              supporter_user_id: item.supporterUserId,
              area_id: item.areaId,
              area_name: item.areaName,
              calculation_id: item.calculationId,
              compensation_mode: item.compensationMode,
              horizon_years: item.horizonYears,
              trees_requested: item.treesRequested,
              price_per_tree: item.pricePerTree,
              estimated_total_t_co2e: item.estimatedTotalTCO2e,
              total_t_co2e: item.totalTCO2e,
              trees_count: item.treesCount,
              total_amount: item.totalAmount,
              currency: item.currency,
              status: item.status,
              created_at: item.createdAt,
            })),
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/compensations/quote
     * Quotes compensation values for tree-based purchase mode.
     */
    async quote(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(quoteTreePurchaseSchema, body);

        const quote = await quoteTreePurchaseCompensation(
          {
            areaRepository: deps.areaRepository,
          },
          {
            areaId: validated.area_id,
            treesRequested: validated.trees_requested,
            currency: validated.currency,
          }
        );

        return jsonResponse(
          200,
          {
            data: {
              area_id: quote.areaId,
              compensation_mode: quote.compensationMode,
              horizon_years: quote.horizonYears,
              trees_requested: quote.treesRequested,
              t_co2e_per_tree_per_year: quote.tCO2ePerTreePerYear,
              estimated_total_t_co2e: quote.estimatedTotalTCO2e,
              estimated_total_kg_co2e_20y: quote.estimatedTotalKgCO2e20y,
              price_per_tree: quote.pricePerTree,
              total_amount: quote.totalAmount,
              currency: quote.currency,
              available_t_co2e: quote.availableTCO2e,
              has_capacity: quote.hasCapacity,
            },
            message_key: 'compensation.quote_tree_purchase_created',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
