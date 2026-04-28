import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { parseWithSchema } from './schemas/validation-helper';
import { createCompensationSchema, listAreaContributionsQuerySchema, listCompensationsQuerySchema, quoteTreePurchaseSchema, } from './schemas/compensation-schemas';
import { createCompensationAtomic } from '../../application/compensations/create-compensation-atomic';
import { handleError } from './error-mapper';
import { buildLogContext } from '../../shared/http/log-context';
import { listCompensations } from '../../application/compensations/list-compensations';
import { listAreaContributions } from '../../application/compensations/list-area-contributions';
import { quoteTreePurchaseCompensation, } from '../../application/compensations/quote-tree-purchase-compensation';
export function createCompensationHandlers(deps) {
    return {
        /**
         * POST /api/v1/compensations
         * Creates a pending tree-planting contribution.
         */
        async create(ctx) {
            const logContext = buildLogContext(ctx);
            try {
                const body = await parseJson(ctx.request, ctx);
                const validated = parseWithSchema(createCompensationSchema, body);
                const quote = await quoteTreePurchaseCompensation({
                    areaRepository: deps.areaRepository,
                }, {
                    areaId: validated.area_id,
                    treesRequested: validated.trees_requested,
                    currency: validated.currency,
                });
                const result = await createCompensationAtomic({
                    store: deps.compensationStore,
                    idGenerator: deps.idGenerator,
                    clock: deps.clock,
                    auditLog: deps.auditLog,
                }, {
                    supporterUserId: ctx.auth.userId,
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
                });
                return jsonResponse(201, {
                    data: {
                        compensation_id: result.compensationId,
                        area_id: result.areaId,
                        compensation_mode: result.compensationMode,
                        horizon_years: result.horizonYears,
                        trees_requested: result.treesRequested,
                        price_per_tree: result.pricePerTree,
                        estimated_total_t_co2e: result.estimatedTotalTCO2e ?? result.totalTCO2e,
                        total_t_co2e: result.totalTCO2e,
                        trees_count: result.treesCount,
                        total_amount: quote.totalAmount,
                        currency: quote.currency,
                        status: result.status,
                        created_at: result.createdAt,
                        certificate: null,
                    },
                    message_key: 'compensation.created_pending',
                }, logContext);
            }
            catch (error) {
                return handleError(error, undefined, logContext);
            }
        },
        /**
         * GET /api/v1/compensations
         * Lists compensation history for current authenticated user.
         */
        async listOwn(ctx) {
            const logContext = buildLogContext(ctx);
            try {
                const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
                const validated = parseWithSchema(listCompensationsQuerySchema, query);
                const result = await listCompensations({
                    historyRepository: deps.compensationHistoryRepository,
                }, {
                    supporterUserId: ctx.auth.userId,
                    actorUserId: ctx.auth.userId,
                    actorRoles: ctx.auth.roles,
                    status: validated.status,
                    limit: validated.limit,
                    offset: validated.offset,
                });
                return jsonResponse(200, {
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
                }, logContext);
            }
            catch (error) {
                return handleError(error, undefined, logContext);
            }
        },
        /**
         * GET /api/v1/users/:id/compensations
         * Lists compensation history for a given user (self/admin route).
         */
        async listByUser(ctx, userId) {
            const logContext = buildLogContext(ctx);
            try {
                const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
                const validated = parseWithSchema(listCompensationsQuerySchema, query);
                const result = await listCompensations({
                    historyRepository: deps.compensationHistoryRepository,
                }, {
                    supporterUserId: userId,
                    actorUserId: ctx.auth.userId,
                    actorRoles: ctx.auth.roles,
                    status: validated.status,
                    limit: validated.limit,
                    offset: validated.offset,
                });
                return jsonResponse(200, {
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
                }, logContext);
            }
            catch (error) {
                return handleError(error, undefined, logContext);
            }
        },
        /**
         * GET /api/v1/areas/:id/contributions
         * Lists paid tree purchase contributions for a given area.
         */
        async listByArea(ctx, areaId) {
            const logContext = buildLogContext(ctx);
            try {
                const query = Object.fromEntries(new URL(ctx.request.url).searchParams.entries());
                const validated = parseWithSchema(listAreaContributionsQuerySchema, query);
                const result = await listAreaContributions({
                    historyRepository: deps.compensationHistoryRepository,
                }, {
                    areaId,
                    limit: validated.limit,
                    offset: validated.offset,
                });
                return jsonResponse(200, {
                    data: result.map((item) => ({
                        compensation_id: item.compensationId,
                        supporter_user_id: item.supporterUserId,
                        supporter_display_name: item.supporterDisplayName,
                        trees_count: item.treesCount,
                        total_t_co2e: item.totalTCO2e,
                        compensated_at: item.compensatedAt,
                    })),
                }, logContext);
            }
            catch (error) {
                return handleError(error, undefined, logContext);
            }
        },
        /**
         * POST /api/v1/compensations/quote
         * Quotes a pending tree-planting contribution.
         */
        async quote(ctx) {
            const logContext = buildLogContext(ctx);
            try {
                const body = await parseJson(ctx.request, ctx);
                const validated = parseWithSchema(quoteTreePurchaseSchema, body);
                const quote = await quoteTreePurchaseCompensation({
                    areaRepository: deps.areaRepository,
                }, {
                    areaId: validated.area_id,
                    treesRequested: validated.trees_requested,
                    currency: validated.currency,
                });
                return jsonResponse(200, {
                    data: {
                        area_id: quote.areaId,
                        compensation_mode: quote.compensationMode,
                        horizon_years: quote.horizonYears,
                        trees_requested: quote.treesRequested,
                        estimated_kg_co2_per_tree_per_year: quote.estimatedKgCO2PerTreePerYear,
                        estimated_total_t_co2e: quote.estimatedTotalTCO2e,
                        estimated_total_kg_co2e: quote.estimatedTotalKgCO2e,
                        price_per_tree: quote.pricePerTree,
                        total_amount: quote.totalAmount,
                        currency: quote.currency,
                    },
                    message_key: 'compensation.quote_tree_purchase_created',
                }, logContext);
            }
            catch (error) {
                return handleError(error, undefined, logContext);
            }
        },
    };
}
