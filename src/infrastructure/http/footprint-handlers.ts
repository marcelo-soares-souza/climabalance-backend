import type { HttpContext } from '../../shared/http/router';
import type { EmissionFactorRepository } from '../../domain/footprint/repositories/emission-factor-repository';
import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import type { FootprintInputRepository } from '../../domain/footprint/repositories/footprint-input-repository';
import type { FootprintBreakdownRepository } from '../../domain/footprint/repositories/footprint-breakdown-repository';
import type { CompensationProjectionRepository } from '../../domain/footprint/repositories/compensation-projection-repository';
import type { UnitOfWork } from '../persistence/unit-of-work';
import type { IdGenerator } from '../../domain/services/id-generator';
import type { Clock } from '../../domain/services/clock';
import { parseJson } from '../../shared/http/request';
import { jsonResponse } from '../../shared/http/response';
import { handleError } from './error-mapper';
import {
  createCalculationSchema,
  updateCalculationSchema,
  createProjectionSchema
} from './schemas/footprint-schemas';
import { parseWithSchema } from './schemas/validation-helper';
import { createFootprintCalculation } from '../../application/footprint/create-footprint-calculation';
import { updateFootprintCalculation } from '../../application/footprint/update-footprint-calculation';
import { finalizeFootprintCalculation } from '../../application/footprint/finalize-footprint-calculation';
import { getFootprintCalculation } from '../../application/footprint/get-footprint-calculation';
import { listFootprintCalculations } from '../../application/footprint/list-footprint-calculations';
import { deleteFootprintCalculation } from '../../application/footprint/delete-footprint-calculation';
import { getEmissionFactors } from '../../application/footprint/get-emission-factors';
import { createCompensationProjection, type AreaRepository } from '../../application/footprint/create-compensation-projection';
import { buildLogContext } from '../../shared/http/log-context';

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
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createCalculationSchema, body);

        const result = await createFootprintCalculation(
          {
            emissionFactorRepository: deps.emissionFactorRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock
          },
          {
            user_id: ctx.auth!.userId,
            ...validated
          }
        );

        return jsonResponse(
          201,
          {
            data: result,
            messages: ['footprint.calculation.created']
          },
          logContext
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
      const isAdmin = ctx.auth?.roles.includes('administrator') ?? false;
      try {
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(updateCalculationSchema, body);

        await updateFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            emissionFactorRepository: deps.emissionFactorRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock
          },
          {
            calculation_id: id,
            user_id: ctx.auth!.userId,
            isAdmin,
            ...validated
          }
        );

        return jsonResponse(
          200,
          {
            messages: ['footprint.calculation.updated']
          },
          logContext
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
      const isAdmin = ctx.auth?.roles.includes('administrator') ?? false;
      try {
        await finalizeFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            unitOfWork: deps.unitOfWork,
            idGenerator: deps.idGenerator,
            clock: deps.clock
          },
          id,
          ctx.auth!.userId,
          isAdmin
        );

        return jsonResponse(
          200,
          {
            messages: ['footprint.calculation.finalized']
          },
          logContext
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
      const isAdmin = ctx.auth?.roles.includes('administrator') ?? false;
      try {
        const result = await getFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository,
            inputRepository: deps.inputRepository,
            breakdownRepository: deps.breakdownRepository
          },
          id,
          ctx.auth!.userId,
          { is_admin: isAdmin }
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
      const isAdmin = ctx.auth?.roles.includes('administrator') ?? false;
      const url = new URL(ctx.request.url);
      const query = {
        status: url.searchParams.get('status') || undefined,
        profile_type: url.searchParams.get('profile_type') || undefined,
        user_email: isAdmin ? url.searchParams.get('user_email') || undefined : undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : undefined
      };

      try {
        const result = await listFootprintCalculations(
          {
            calculationRepository: deps.calculationRepository
          },
          {
            user_id: ctx.auth!.userId,
            ...query,
            is_admin: isAdmin
          }
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
      const isAdmin = ctx.auth?.roles.includes('administrator') ?? false;
      try {
        await deleteFootprintCalculation(
          {
            calculationRepository: deps.calculationRepository
          },
          id,
          ctx.auth!.userId,
          isAdmin
        );

        return jsonResponse(
          200,
          {
            messages: ['footprint.calculation.deleted']
          },
          logContext
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
      const url = new URL(ctx.request.url);
      const query = {
        version: url.searchParams.get('version') || undefined,
        region: url.searchParams.get('region') || undefined,
        category: url.searchParams.get('category') || undefined
      };

      try {
        const result = await getEmissionFactors(
          {
            emissionFactorRepository: deps.emissionFactorRepository
          },
          query
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
        const body = await parseJson(ctx.request, ctx);
        const validated = parseWithSchema(createProjectionSchema, body);

        const result = await createCompensationProjection(
          {
            calculationRepository: deps.calculationRepository,
            projectionRepository: deps.projectionRepository,
            areaRepository: deps.areaRepository,
            idGenerator: deps.idGenerator,
            clock: deps.clock
          },
          {
            calculation_id: calculationId,
            user_id: ctx.auth!.userId,
            ...validated
          }
        );

        return jsonResponse(
          201,
          {
            data: result,
            messages: ['footprint.projection.created']
          },
          logContext
        );
      } catch (error) {
        return handleError(error, undefined, logContext);
      }
    }
  };
}
