import type { HttpContext } from "../../shared/http/router";
import type { EmissionFactorRepository } from "../../domain/footprint/repositories/emission-factor-repository";
import type { FootprintCalculationRepository } from "../../domain/footprint/repositories/footprint-calculation-repository";
import type { FootprintInputRepository } from "../../domain/footprint/repositories/footprint-input-repository";
import type { FootprintBreakdownRepository } from "../../domain/footprint/repositories/footprint-breakdown-repository";
import type { CompensationProjectionRepository } from "../../domain/footprint/repositories/compensation-projection-repository";
import type { UnitOfWork } from "../persistence/unit-of-work";
import type { IdGenerator } from "../../domain/services/id-generator";
import type { Clock } from "../../domain/services/clock";
import type { AuditLogRepository } from "../../domain/audit/audit-log-repository";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { parseJson } from "../../shared/http/request";
import { errorResponse, jsonResponse } from "../../shared/http/response";
import { handleError } from "./error-mapper";
import {
  createCalculationSchema,
  updateCalculationSchema,
  createProjectionSchema,
  calculateGuestSchema,
  listCalculationsQuerySchema,
  emissionFactorsQuerySchema,
} from "./schemas/footprint-schemas";
import {
  parseQueryWithSchema,
  parseWithSchema,
} from "./schemas/validation-helper";
import { createFootprintCalculation } from "../../application/footprint/create-footprint-calculation";
import { updateFootprintCalculation } from "../../application/footprint/update-footprint-calculation";
import { finalizeFootprintCalculation } from "../../application/footprint/finalize-footprint-calculation";
import { getFootprintCalculation } from "../../application/footprint/get-footprint-calculation";
import { listFootprintCalculations } from "../../application/footprint/list-footprint-calculations";
import { deleteFootprintCalculation } from "../../application/footprint/delete-footprint-calculation";
import { getEmissionFactors } from "../../application/footprint/get-emission-factors";
import { createCompensationProjection } from "../../application/footprint/create-compensation-projection";
import type { AreaRepository } from "../../domain/areas/repositories/area-repository";
import { calculateGuestFootprint } from "../../application/footprint/calculate-guest-footprint";
import { buildLogContext } from "../../shared/http/log-context";
import { requireAuth } from "../../shared/http/auth-context";

export interface FootprintHandlersDeps {
  calculationRepository: FootprintCalculationRepository;
  emissionFactorRepository: EmissionFactorRepository;
  inputRepository: FootprintInputRepository;
  breakdownRepository: FootprintBreakdownRepository;
  projectionRepository: CompensationProjectionRepository;
  areaRepository: AreaRepository;
  unitOfWork: UnitOfWork;
  idGenerator: IdGenerator;
  clock: Clock;
  auditLog: Pick<AuditLogRepository, "log">;
  jobQueue: JobQueue;
}

export function createFootprintHandlers(deps: FootprintHandlersDeps) {
  return {
    /**
     * POST /api/v1/footprint/calculations
     * Create a new footprint calculation
     */
    async create(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createCalculationSchema, body);

        const result = await createFootprintCalculation(
          {
            emissionFactorRepository: deps.emissionFactorRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          {
            user_id: auth.userId,
            ...validated,
          },
        );

        await deps.auditLog.log({
          actorUserId: auth.userId,
          action: "footprint.calculation_created",
          entityType: "footprint_calculation",
          entityId: result.calculation_id,
          ctx,
          success: true,
          httpStatus: 201,
          severity: "info",
          category: ["data_modification", "compliance"],
        });

        return jsonResponse(
          201,
          {
            data: result,
            messages: ["footprint.calculation.created"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * PATCH /api/v1/footprint/calculations/:id
     * Update a draft calculation
     */
    async update(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const isAdmin = auth.roles.includes("administrator");
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(updateCalculationSchema, body);

        await updateFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            emissionFactorRepository: deps.emissionFactorRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          {
            calculation_id: id,
            user_id: auth.userId,
            isAdmin,
            ...validated,
          },
        );

        await deps.auditLog.log({
          actorUserId: auth.userId,
          action: "footprint.calculation_updated",
          entityType: "footprint_calculation",
          entityId: id,
          ctx,
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["data_modification", "compliance"],
        });

        return jsonResponse(
          200,
          {
            messages: ["footprint.calculation.updated"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/footprint/calculations/:id/finalize
     * Finalize a calculation (make it immutable)
     */
    async finalize(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const isAdmin = auth.roles.includes("administrator");
        await finalizeFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          id,
          auth.userId,
          isAdmin,
        );

        await deps.auditLog.log({
          actorUserId: auth.userId,
          action: "footprint.calculation_finalized",
          entityType: "footprint_calculation",
          entityId: id,
          ctx,
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["data_modification", "compliance"],
        });

        await deps.jobQueue
          .enqueue("footprint.calculation_finalized", {
            userId: auth.userId,
            calculationId: id,
          })
          .catch(() => {});

        return jsonResponse(
          200,
          {
            messages: ["footprint.calculation.finalized"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/footprint/calculations/:id
     * Get a specific calculation with details
     */
    async get(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const isAdmin = auth.roles.includes("administrator");
        const result = await getFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            inputRepository: deps.inputRepository,
            breakdownRepository: deps.breakdownRepository,
          },
          id,
          auth.userId,
          { is_admin: isAdmin },
        );

        return jsonResponse(200, { data: result }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/footprint/calculations
     * List user's calculations with optional filters
     */
    async list(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const isAdmin = auth.roles.includes("administrator");
        const query = parseQueryWithSchema(
          listCalculationsQuerySchema,
          ctx.query,
        );
        const result = await listFootprintCalculations(
          {
            calculationRepository: deps.calculationRepository,
          },
          {
            user_id: auth.userId,
            status: query.status,
            profile_type: query.profile_type,
            user_email: isAdmin ? query.user_email : undefined,
            limit: query.limit,
            offset: query.offset,
            is_admin: isAdmin,
          },
        );

        return jsonResponse(200, { data: result.calculations }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * DELETE /api/v1/footprint/calculations/:id
     * Soft delete a draft calculation
     */
    async remove(ctx: HttpContext, id: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const isAdmin = auth.roles.includes("administrator");
        await deleteFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
          },
          id,
          auth.userId,
          isAdmin,
        );

        await deps.auditLog.log({
          actorUserId: auth.userId,
          action: "footprint.calculation_deleted",
          entityType: "footprint_calculation",
          entityId: id,
          ctx,
          success: true,
          httpStatus: 200,
          severity: "info",
          category: ["data_modification", "compliance"],
        });

        return jsonResponse(
          200,
          {
            messages: ["footprint.calculation.deleted"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * GET /api/v1/footprint/emission-factors
     * Get emission factors (optionally filtered by category)
     */
    async getEmissionFactors(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const query = parseQueryWithSchema(
          emissionFactorsQuerySchema,
          ctx.query,
        );
        const result = await getEmissionFactors(
          {
            emissionFactorRepository: deps.emissionFactorRepository,
          },
          query,
        );

        return jsonResponse(200, { data: result.factors }, logContext);
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/footprint/calculations/:id/projection
     * Create a compensation projection for a calculation
     */
    async createProjection(ctx: HttpContext, calculationId: string) {
      const logContext = buildLogContext(ctx);
      try {
        const auth = requireAuth(ctx);
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createProjectionSchema, body);

        const areaUuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const resolvedAreaId = areaUuidRegex.test(validated.area_id)
          ? validated.area_id
          : (await deps.areaRepository.findBySlug(validated.area_id))?.id;
        if (!resolvedAreaId) {
          return errorResponse(404, "area.not_found", undefined, logContext);
        }

        const result = await createCompensationProjection(
          {
            calculationRepository: deps.calculationRepository,
            projectionRepository: deps.projectionRepository,
            areaRepository: deps.areaRepository,
            idGenerator: deps.idGenerator,
            clock: deps.clock,
          },
          {
            calculation_id: calculationId,
            user_id: auth.userId,
            ...validated,
            area_id: resolvedAreaId,
          },
        );

        return jsonResponse(
          201,
          {
            data: result,
            messages: ["footprint.projection.created"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },

    /**
     * POST /api/v1/footprint/calculate-guest
     * Calculate carbon footprint for guest (unauthenticated) users
     * Does not persist calculation to database
     */
    async calculateGuest(ctx: HttpContext) {
      const logContext = buildLogContext(ctx);
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(calculateGuestSchema, body);

        const result = await calculateGuestFootprint(
          {
            emissionFactorRepository: deps.emissionFactorRepository,
          },
          validated,
        );

        return jsonResponse(
          200,
          {
            data: result,
            messages: ["footprint.guest_calculation.completed"],
          },
          logContext,
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    },
  };
}
