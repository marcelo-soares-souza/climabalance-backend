import type { HttpContext } from '../../shared/http/router';
import type { CompensationAtomicStore } from '../../application/compensations/create-compensation-atomic';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import {
  createCompensationSchema,
  listAreaContributionsQuerySchema,
  listCompensationsQuerySchema,
  quoteTreePurchaseSchema,
} from './schemas/compensation-schemas';
import { createCompensationAtomic } from '../../application/compensations/create-compensation-atomic';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';
import type { CompensationHistoryRepository } from '../../domain/compensations/repositories/compensation-history-repository';
import { listCompensations } from '../../application/compensations/list-compensations';
import { listAreaContributions } from '../../application/compensations/list-area-contributions';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { StripeConnectLookup } from '../../application/payments/create-stripe-payment-intent';
import {
  quoteTreePurchaseCompensation,
} from '../../application/compensations/quote-tree-purchase-compensation';
import { withAuditLogContext } from '../../shared/http/audit-log-with-context';
import { requireAuth } from '../../shared/http/auth-context';
import { parseQueryWithSchema } from './schemas/validation-helper';

export interface CompensationHandlersDeps {
  areaRepository: AreaRepository;
  stripeConnectLookup?: StripeConnectLookup;
  compensationStore: CompensationAtomicStore;
  compensationHistoryRepository: CompensationHistoryRepository;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: Pick<AuditLogRepository, 'log'>;
  defaultMaxPurchasableTrees: number;
}

export function createCompensationHandlers(deps: CompensationHandlersDeps) {
  return {
    /**
     * POST /api/v1/compensations
     * Creates a pending tree-planting contribution.
     */
    async create(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createCompensationSchema, body);
        const quote = await quoteTreePurchaseCompensation(
          {
            areaRepository: deps.areaRepository,
            compensationHistoryRepository: deps.compensationHistoryRepository,
            defaultMaxPurchasableTrees: deps.defaultMaxPurchasableTrees,
          },
          {
            areaId: validated.area_id,
            treesRequested: validated.trees_requested!,
            currency: validated.currency,
          }
        );

        const result = await createCompensationAtomic(
          {
            store: deps.compensationStore,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: requestAuditLog,
            defaultMaxPurchasableTrees: deps.defaultMaxPurchasableTrees,
          },
          {
            supporterUserId: auth.userId,
            areaId: validated.area_id,
            calculationId: validated.calculation_id,
            compensationMode: 'tree_purchase',
            horizonYears: quote.horizonYears,
            treesRequested: quote.treesRequested,
            pricePerTree: quote.pricePerTree,
            estimatedTotalTCO2e: quote.estimatedTotalTCO2e,
            totalTCO2e: quote.estimatedTotalTCO2e,
            treesCount: quote.treesRequested,
            totalAmount: quote.totalAmount,
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
              total_amount: quote.totalAmount,
              currency: quote.currency,
              status: result.status,
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
        const auth = requireAuth(ctx);
        const validated = parseQueryWithSchema(listCompensationsQuerySchema, ctx.query);
        const result = await listCompensations(
          {
            historyRepository: deps.compensationHistoryRepository,
          },
          {
            supporterUserId: auth.userId,
            actorUserId: auth.userId,
            actorRoles: auth.roles,
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
              area_slug: item.areaSlug,
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
        const validated = parseQueryWithSchema(listCompensationsQuerySchema, ctx.query);
        const result = await listCompensations(
          {
            historyRepository: deps.compensationHistoryRepository,
          },
          {
            supporterUserId: userId,
            actorUserId: ctx.auth?.userId,
            actorRoles: ctx.auth?.roles,
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
              area_slug: item.areaSlug,
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
     * GET /api/v1/areas/:id/contributions
     * Lists paid tree purchase contributions for a given area.
     */
    async listByArea(ctx: HttpContext, areaId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const validated = parseQueryWithSchema(listAreaContributionsQuerySchema, ctx.query);
        const result = await listAreaContributions(
          {
            historyRepository: deps.compensationHistoryRepository,
          },
          {
            areaId,
            limit: validated.limit,
            offset: validated.offset,
          }
        );

        return jsonResponse(
          200,
          {
            data: result.map((item) => ({
              compensation_id: item.compensationId,
              supporter_user_id: item.supporterUserId,
              supporter_display_name: item.supporterDisplayName,
              trees_count: item.treesCount,
              total_t_co2e: item.totalTCO2e,
              compensated_at: item.compensatedAt,
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
     * Quotes a pending tree-planting contribution.
     */
    async quote(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(quoteTreePurchaseSchema, body);

        const quote = await quoteTreePurchaseCompensation(
          {
            areaRepository: deps.areaRepository,
            compensationHistoryRepository: deps.compensationHistoryRepository,
            defaultMaxPurchasableTrees: deps.defaultMaxPurchasableTrees,
          },
          {
            areaId: validated.area_id,
            treesRequested: validated.trees_requested,
            currency: validated.currency,
          }
        );

        const area = await deps.areaRepository.findById(validated.area_id);
        const ownerUserId = area?.ownerUserId ?? null;
        const stripeAccount = ownerUserId && deps.stripeConnectLookup
          ? await deps.stripeConnectLookup.getByUserId(ownerUserId)
          : null;
        const producerStripeConnected = Boolean(stripeAccount);
        const producerChargesEnabled = Boolean(stripeAccount?.chargesEnabled);
        const producerPayoutsEnabled = Boolean(stripeAccount?.payoutsEnabled);
        const producerReadyToReceiveSupport =
          producerStripeConnected &&
          producerChargesEnabled &&
          producerPayoutsEnabled;

        return jsonResponse(
          200,
          {
            data: {
              area_id: quote.areaId,
              compensation_mode: quote.compensationMode,
              horizon_years: quote.horizonYears,
              trees_requested: quote.treesRequested,
              estimated_kg_co2_per_tree_per_year:
                quote.estimatedKgCO2PerTreePerYear,
              estimated_total_t_co2e: quote.estimatedTotalTCO2e,
              estimated_total_kg_co2e: quote.estimatedTotalKgCO2e,
              price_per_tree: quote.pricePerTree,
              total_amount: quote.totalAmount,
              currency: quote.currency,
              max_purchasable_trees: quote.maxPurchasableTrees,
              remaining_purchasable_trees: quote.remainingPurchasableTrees,
              producer_stripe_connected: producerStripeConnected,
              producer_charges_enabled: producerChargesEnabled,
              producer_payouts_enabled: producerPayoutsEnabled,
              producer_ready_to_receive_support: producerReadyToReceiveSupport,
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
