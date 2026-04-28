import type { HttpContext } from '../../shared/http/router';
import type { AreaRepository } from '../../domain/areas/repositories/area-repository';
import type { AreaCriteriaRepository } from '../../domain/areas/repositories/area-criteria-repository';
import type { AreaMediaRepository } from '../../domain/areas/repositories/area-media-repository';
import type { AreaMediaStorage } from '../../domain/areas/services/area-media-storage';
import type { TreePlantingRepository } from '../../domain/areas/repositories/tree-planting-repository';
import type { UserRepository } from '../../domain/user/user-repository';
import type { UnitOfWork } from '../persistence/unit-of-work';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import type { AuditLogRepository } from '../../domain/audit/audit-log-repository';
import { z } from 'zod';
import { parseJson } from '../../shared/http/request';
import { jsonResponse, contentDispositionHeader } from '../../shared/http/response';
import { handleError } from './error-mapper';
import {
  createAreaSchema,
  updateAreaSchema,
  approveAreaSchema,
  rejectAreaSchema,
  uploadAreaMediaSchema,
  listAreasQuerySchema,
  getMapAreasQuerySchema,
} from './schemas/area-schemas';
import { parseQueryWithSchema, parseWithSchema } from './schemas/validation-helper';
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
import { getPlantedTrees } from '../../application/areas/get-planted-trees';
import { getPendingTreeCount } from '../../application/areas/get-pending-tree-count';
import { savePlantedTrees } from '../../application/areas/save-planted-trees';
import { deletePlantedTrees } from '../../application/areas/delete-planted-trees';
import { uploadAreaMedia } from '../../application/areas/upload-area-media';
import { listAreaMedia } from '../../application/areas/list-area-media';
import { deleteAreaMedia } from '../../application/areas/delete-area-media';
import { getAreaMediaFile } from '../../application/areas/get-area-media-file';
import { AreaAuditService } from '../../domain/areas/services/area-audit.service';
import { CarbonStockService } from '../../domain/areas/services/carbon-stock.service';
import { buildLogContext } from '../../shared/http/log-context';
import { withAuditLogContext } from '../../shared/http/audit-log-with-context';
import { requireAuth } from '../../shared/http/auth-context';

export interface AreaHandlersDeps {
  users: UserRepository;
  areaRepository: AreaRepository;
  areaCriteriaRepository: AreaCriteriaRepository;
  areaMediaRepository: AreaMediaRepository;
  areaMediaStorage: AreaMediaStorage;
  treePlantingRepository: TreePlantingRepository;
  auditLog: Pick<AuditLogRepository, 'log'>;
  unitOfWork: UnitOfWork;
  idGenerator: IdGenerator;
  clock: Clock;
}

export function createAreaHandlers(deps: AreaHandlersDeps) {
  const carbonStockService = new CarbonStockService({
    areaRepository: deps.areaRepository,
  });

  const createAuditService = (ctx: HttpContext) =>
    new AreaAuditService({
      areaRepository: deps.areaRepository,
      criteriaRepository: deps.areaCriteriaRepository,
      auditLog: withAuditLogContext(deps.auditLog, ctx),
      clock: deps.clock,
    });

  return {
    /**
     * POST /api/v1/areas
     * Create a new area
     */
    async create(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createAreaSchema, body);

        const result = await createArea(
          {
            areaRepository: deps.areaRepository,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            ownerUserId: auth.userId,
            name: validated.name,
            description: validated.description,
            latitude: validated.latitude,
            longitude: validated.longitude,
            biome: validated.biome,
            state: validated.state,
            city: validated.city,
            totalCapacityTCO2e: validated.totalCapacityTCO2e,
            tCO2ePerTreePerYear: validated.tCO2ePerTreePerYear,
            pricePerTree: validated.pricePerTree,
            defaultHorizonYears: validated.defaultHorizonYears,
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
            userRepository: deps.users,
          },
          id,
          ctx.auth?.userId,
          ctx.auth?.roles
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * PATCH /api/v1/areas/:id
     * Update an area (owner/admin for active, owner for draft, admin override otherwise)
     */
    async update(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(updateAreaSchema, body);

        await updateArea(
          {
            areaRepository: deps.areaRepository,
          },
          {
            areaId: id,
            userId: auth.userId,
            isAdmin: auth.roles.includes('administrator'),
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
        const auth = requireAuth(ctx);
        await deleteArea(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
            areaMediaStorage: deps.areaMediaStorage,
            clock: deps.clock,
          },
          {
            areaId: id,
            userId: auth.userId,
            isAdmin: auth.roles.includes('administrator'),
          }
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
        const auth = requireAuth(ctx);
        const query = parseQueryWithSchema(listAreasQuerySchema, ctx.query);

        const result = await listAreas(
          {
            areaRepository: deps.areaRepository,
          },
          {
            userId: auth.userId,
            roles: auth.roles,
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
      const auditService = createAuditService(ctx);
      try {
        const auth = requireAuth(ctx);
        await submitAreaForAudit(
          {
            auditService,
          },
          id,
          auth.userId
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
      const auditService = createAuditService(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(approveAreaSchema, body);

        await approveArea(
          {
            auditService,
          },
          {
            areaId: id,
            analystId: auth.userId,
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
      const auditService = createAuditService(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(rejectAreaSchema, body);

        await rejectArea(
          {
            auditService,
          },
          id,
          auth.userId,
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
      const auditService = createAuditService(ctx);
      try {
        const auth = requireAuth(ctx);
        await activateArea(
          {
            auditService,
          },
          id,
          auth.userId
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
      const auditService = createAuditService(ctx);
      try {
        const auth = requireAuth(ctx);
        await suspendArea(
          {
            auditService,
          },
          id,
          auth.userId
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
        const query = parseQueryWithSchema(getMapAreasQuerySchema, ctx.query);

        const result = await getAreasForMap(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
            treePlantingRepository: deps.treePlantingRepository,
          },
          query
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/:id/planted-trees
     * List planted tree points for an area (public)
     */
    async getPlantedTrees(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const result = await getPlantedTrees(
          { treePlantingRepository: deps.treePlantingRepository },
          id,
        );
        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/:id/pending-tree-count
     * Get pending tree planting count for the area owner
     */
    async getPendingTreeCount(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const result = await getPendingTreeCount(
          { treePlantingRepository: deps.treePlantingRepository },
          id,
        );
        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/areas/:id/planted-trees
     * Save batch of planted tree points (area owner only)
     */
    async savePlantedTrees(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const { points } = parseWithSchema(
          z.object({
            points: z
              .array(
                z.object({
                  latitude: z.number().min(-90).max(90),
                  longitude: z.number().min(-180).max(180),
                }),
              )
              .min(1)
              .max(10000),
          }),
          body,
        );

        const area = await deps.areaRepository.findById(id);
        if (!area) {
          return jsonResponse(404, { message_key: 'area.not_found' }, logContext);
        }
        if (area.ownerUserId !== auth.userId && !auth.roles.includes('administrator')) {
          return jsonResponse(403, { message_key: 'auth.forbidden' }, logContext);
        }

        await savePlantedTrees(
          {
            treePlantingRepository: deps.treePlantingRepository,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          { areaId: id, plantedByUserId: auth.userId, points },
        );

        return jsonResponse(201, { message_key: 'area.trees_planted' }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * DELETE /api/v1/areas/:id/planted-trees
     * Delete all planted trees for an area (area owner only)
     */
    async deletePlantedTrees(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const area = await deps.areaRepository.findById(id);
        if (!area) {
          return jsonResponse(404, { message_key: 'area.not_found' }, logContext);
        }
        if (area.ownerUserId !== auth.userId && !auth.roles.includes('administrator')) {
          return jsonResponse(403, { message_key: 'auth.forbidden' }, logContext);
        }
        await deletePlantedTrees(
          { treePlantingRepository: deps.treePlantingRepository },
          id,
        );
        return jsonResponse(200, { message_key: 'area.trees_deleted' }, logContext);
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

    /**
     * POST /api/v1/areas/:id/media
     * Upload photo/video evidence for an area
     */
    async uploadMedia(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx, 35 * 1024 * 1024);
        const validated = parseWithSchema(uploadAreaMediaSchema, body);

        const result = await uploadAreaMedia(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
            areaMediaStorage: deps.areaMediaStorage,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            areaId: id,
            actorUserId: auth.userId,
            actorRoles: auth.roles,
            mediaType: validated.media_type,
            description: validated.description,
            mimeType: validated.mime_type,
            fileName: validated.file_name,
            fileBase64: validated.file_base64,
          }
        );

        return jsonResponse(
          201,
          {
            data: {
              ...result,
              downloadUrl: `/api/v1/areas/media/${result.id}/file`,
            },
            message_key: 'area.media_uploaded',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/:id/media
     * List media files associated with an area
     */
    async listMedia(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const result = await listAreaMedia(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
          },
          {
            areaId: id,
            actorUserId: ctx.auth?.userId,
            actorRoles: ctx.auth?.roles,
          }
        );

        return jsonResponse(
          200,
          {
            data: result.map((item) => ({
              ...item,
              downloadUrl: `/api/v1/areas/media/${item.id}/file`,
            })),
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * DELETE /api/v1/areas/media/:mediaId
     * Soft delete area media and remove stored file
     */
    async deleteMedia(ctx: HttpContext, mediaId: string) {
      const logContext = buildLogContext(ctx);
      const requestAuditLog = withAuditLogContext(deps.auditLog, ctx);
      try {
        const auth = requireAuth(ctx);
        await deleteAreaMedia(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
            areaMediaStorage: deps.areaMediaStorage,
            clock: deps.clock,
            auditLog: requestAuditLog,
          },
          {
            mediaId,
            actorUserId: auth.userId,
            actorRoles: auth.roles,
          }
        );

        return jsonResponse(
          200,
          {
            message_key: 'area.media_deleted',
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/areas/media/:mediaId/file
     * Download area media binary file
     */
    async getMediaFile(ctx: HttpContext, mediaId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const file = await getAreaMediaFile(
          {
            areaRepository: deps.areaRepository,
            areaMediaRepository: deps.areaMediaRepository,
            areaMediaStorage: deps.areaMediaStorage,
          },
          {
            mediaId,
            actorUserId: ctx.auth?.userId,
            actorRoles: ctx.auth?.roles,
          }
        );

        return new Response(file.bytes, {
          status: 200,
          headers: {
            'content-type': file.mimeType,
            'cache-control': 'public, max-age=3600',
            'content-disposition': contentDispositionHeader('inline', file.fileName),
          },
        });
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
