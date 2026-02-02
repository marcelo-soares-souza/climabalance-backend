import type { HttpContext } from '../../shared/http/router';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { AreaCriteriaRepository } from '../../domain/areas/repositories/area-criteria-repository';
import type { UnitOfWork } from '../persistence/unit-of-work';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import {
  createAreaSchema,
  updateAreaSchema,
  approveAreaSchema,
  rejectAreaSchema,
  listAreasQuerySchema,
  getMapAreasQuerySchema,
} from './schemas/area-schemas';
import { parseWithSchema } from './schemas/validation-helper';
import { createArea } from '../../application/areas/create-area';
import { updateArea } from '../../application/areas/update-area';
import { deleteArea } from '../../application/areas/delete-area';
import { getArea } from '../../application/areas/get-area';
import { listAreas } from '../../application/areas/list-areas';
import { submitAreaForAudit } from '../../application/areas/submit-area-for-audit';
import { approveArea } from '../../application/areas/approve-area';
import { rejectArea } from '../../application/areas/reject-area';
import { activateArea } from '../../application/areas/activate-area';
import { suspendArea } from '../../application/areas/suspend-area';
import { getAreasForMap } from '../../application/areas/get-areas-for-map';
import { getAreaCapacity } from '../../application/areas/get-area-capacity';
import { AreaAuditService } from '../../domain/areas/services/area-audit.service';
import { CarbonStockService } from '../../domain/areas/services/carbon-stock.service';
import { buildLogContext } from '../../shared/http/log-context';

export interface AreaHandlersDeps {
  areaRepository: AreaRepository;
  areaCriteriaRepository: AreaCriteriaRepository;
  auditLog: {
    log(entry: {
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    }): Promise<void>;
  };
  unitOfWork: UnitOfWork;
  idGenerator: IdGenerator;
  clock: Clock;
}

export function createAreaHandlers(deps: AreaHandlersDeps) {
  // Domain services
  const auditService = new AreaAuditService({
    areaRepository: deps.areaRepository,
    criteriaRepository: deps.areaCriteriaRepository,
    auditLog: deps.auditLog,
    clock: deps.clock,
  });
  const carbonStockService = new CarbonStockService({
    areaRepository: deps.areaRepository,
  });

  return {
    /**
     * POST /api/v1/areas
     * Create a new area
     */
    async create(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createAreaSchema, body);

        const result = await createArea(
          {
            areaRepository: deps.areaRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          {
            ownerUserId: ctx.auth!.userId,
            ...validated,
          }
        );

        return jsonResponse(
          201,
          {
            data: result,
            messages: ['area.created'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/:id
     * Get a specific area with details
     */
    async get(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const result = await getArea(
          {
            areaRepository: deps.areaRepository,
            areaCriteriaRepository: deps.areaCriteriaRepository,
          },
          id,
          ctx.auth!.userId
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * PATCH /api/v1/areas/:id
     * Update an area (only allowed in draft status)
     */
    async update(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(updateAreaSchema, body);

        await updateArea(
          {
            areaRepository: deps.areaRepository,
            unitOfWork: deps.unitOfWork,
            clock: deps.clock,
          },
          {
            areaId: id,
            userId: ctx.auth!.userId,
            ...validated,
          }
        );

        return jsonResponse(
          200,
          {
            messages: ['area.updated'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * DELETE /api/v1/areas/:id
     * Soft delete an area
     */
    async remove(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        await deleteArea(
          {
            areaRepository: deps.areaRepository,
            unitOfWork: deps.unitOfWork,
          },
          id,
          ctx.auth!.userId
        );

        return jsonResponse(
          200,
          {
            messages: ['area.deleted'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas
     * List areas with optional filters
     */
    async list(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const url = new URL(ctx.request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        const query = parseWithSchema(listAreasQuerySchema, queryParams);

        const result = await listAreas(
          {
            areaRepository: deps.areaRepository,
          },
          {
            userId: ctx.auth!.userId,
            ...query,
          }
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/submit-audit
     * Submit area for audit
     */
    async submitForAudit(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        await submitAreaForAudit(
          {
            auditService,
          },
          id,
          ctx.auth!.userId
        );

        return jsonResponse(
          200,
          {
            messages: ['area.submitted_for_audit'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/approve
     * Approve area with criteria (analyst only)
     */
    async approve(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(approveAreaSchema, body);

        await approveArea(
          {
            auditService,
            idGenerator: deps.idGenerator,
          },
          {
            areaId: id,
            userId: ctx.auth!.userId,
            criteria: validated.criteria,
            notes: validated.notes,
          }
        );

        return jsonResponse(
          200,
          {
            messages: ['area.approved'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/reject
     * Reject area with reason (analyst only)
     */
    async reject(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(rejectAreaSchema, body);

        await rejectArea(
          {
            auditService,
          },
          id,
          ctx.auth!.userId,
          validated.reason
        );

        return jsonResponse(
          200,
          {
            messages: ['area.rejected'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/activate
     * Activate an approved area (analyst/admin only)
     */
    async activate(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        await activateArea(
          {
            auditService,
          },
          id,
          ctx.auth!.userId
        );

        return jsonResponse(
          200,
          {
            messages: ['area.activated'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/suspend
     * Suspend an active area (admin only)
     */
    async suspend(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        await suspendArea(
          {
            auditService,
          },
          id,
          ctx.auth!.userId
        );

        return jsonResponse(
          200,
          {
            messages: ['area.suspended'],
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/map/areas
     * Get areas for map display (public endpoint)
     */
    async getForMap(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const url = new URL(ctx.request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        const query = parseWithSchema(getMapAreasQuerySchema, queryParams);

        const result = await getAreasForMap(
          {
            areaRepository: deps.areaRepository,
          },
          query
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/:id/capacity
     * Get available carbon capacity for an area
     */
    async getCapacity(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const result = await getAreaCapacity(
          {
            carbonStockService,
          },
          id
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
