import type { FootprintCalculationRepository } from "../../domain/footprint/repositories/footprint-calculation-repository";
import type { EmissionFactorRepository } from "../../domain/footprint/repositories/emission-factor-repository";
import type { UnitOfWork } from "../../infrastructure/persistence/unit-of-work";
import type { IdGenerator } from "../../domain/services/id-generator";
import type { Clock } from "../../domain/services/clock";
import type { CreateFootprintInputDTO } from "../../domain/footprint/entities/footprint-input";
import { FootprintCalculatorService } from "../../domain/footprint/services/footprint-calculator.service";
import { Period } from "../../domain/footprint/value-objects/period";
import { canEditCalculation } from "../../domain/footprint/entities/footprint-calculation";
import { validateInputValue } from "../../domain/footprint/entities/footprint-input";
import { validateDataQuality } from "../../domain/footprint/value-objects/data-quality";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../domain/errors";

export interface UpdateFootprintCalculationRequest {
  calculation_id: string;
  user_id: string;
  isAdmin?: boolean;
  period_start?: string;
  period_end?: string;
  inputs?: CreateFootprintInputDTO[];
  data_quality?: string;
}

export interface UpdateFootprintCalculationDeps {
  calculationRepository: FootprintCalculationRepository;
  emissionFactorRepository: EmissionFactorRepository;
  unitOfWork: UnitOfWork;
  idGenerator: IdGenerator;
  clock: Clock;
}

export async function updateFootprintCalculation(
  deps: UpdateFootprintCalculationDeps,
  request: UpdateFootprintCalculationRequest,
): Promise<void> {
  // 1. Get existing calculation
  const calculation = await deps.calculationRepository.findById(
    request.calculation_id,
  );

  if (!calculation) {
    throw new NotFoundError("footprint.calculation.not_found");
  }

  // Allow admin to edit any calculation, regular users only their own
  if (calculation.user_id !== request.user_id && !request.isAdmin) {
    throw new ForbiddenError("footprint.calculation.not_owner");
  }

  if (!canEditCalculation(calculation, request.isAdmin)) {
    throw new ValidationError([
      { field: "status", message: "Cannot edit finalized calculation" },
    ]);
  }

  // 2. Update period if provided
  let period = new Period(calculation.period_start, calculation.period_end);
  if (request.period_start || request.period_end) {
    const startStr =
      request.period_start ||
      calculation.period_start.toISOString().split("T")[0]!;
    const endStr =
      request.period_end || calculation.period_end.toISOString().split("T")[0]!;
    try {
      period = Period.fromStrings(startStr, endStr);
    } catch (error) {
      throw new ValidationError([
        {
          field: "period",
          message: error instanceof Error ? error.message : "Invalid period",
        },
      ]);
    }
  }

  if (request.data_quality) {
    try {
      calculation.data_quality = validateDataQuality(request.data_quality);
    } catch (error) {
      throw new ValidationError([
        {
          field: "data_quality",
          message:
            error instanceof Error ? error.message : "Invalid data quality",
        },
      ]);
    }
  }

  // 3. Recalculate if inputs provided
  if (request.inputs && request.inputs.length > 0) {
    for (const [index, input] of request.inputs.entries()) {
      try {
        validateInputValue(input.value);
      } catch (error) {
        throw new ValidationError([
          {
            field: `inputs.${index}.value`,
            message:
              error instanceof Error ? error.message : "Invalid input value",
          },
        ]);
      }
    }

    const factors = await deps.emissionFactorRepository.findByVersionAndRegion(
      calculation.factors_version,
      "BR",
    );

    const calculatorService = new FootprintCalculatorService();
    let calculationResult: ReturnType<FootprintCalculatorService["calculate"]>;
    try {
      calculationResult = calculatorService.calculate(request.inputs, factors);
    } catch (error) {
      throw new ValidationError([
        {
          field: "inputs",
          message: error instanceof Error ? error.message : "Invalid inputs",
        },
      ]);
    }

    // 4. Update calculation
    calculation.period_start = period.start;
    calculation.period_end = period.end;
    calculation.total_kg_co2e = calculationResult.total_kg_co2e;
    calculation.total_t_co2e = calculationResult.total_t_co2e;
    calculation.updated_at = deps.clock.now();

    // 5. Persist changes in transaction
    await deps.unitOfWork.execute(async (tx) => {
      const calculationRepository = tx.getFootprintCalculationRepository();
      const inputRepository = tx.getFootprintInputRepository();
      const breakdownRepository = tx.getFootprintBreakdownRepository();

      await calculationRepository.update(calculation);

      // Delete old inputs and breakdown
      await inputRepository.deleteByCalculationId(calculation.id);
      await breakdownRepository.deleteByCalculationId(calculation.id);

      // Save new inputs
      const now = deps.clock.now();
      const inputEntities = calculationResult.inputsWithEmissions.map(
        (item) => ({
          id: deps.idGenerator.generate(),
          calculation_id: calculation.id,
          activity_type: item.activity_type,
          category: item.input.category,
          quantity: item.input.value,
          unit: item.input.unit,
          kg_co2e: item.kg_co2e,
          metadata_json: item.input.metadata
            ? JSON.stringify(item.input.metadata)
            : null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        }),
      );

      await inputRepository.saveMany(inputEntities);

      // Save new breakdown
      const breakdownEntities = calculationResult.breakdown.map((item) => ({
        id: deps.idGenerator.generate(),
        calculation_id: calculation.id,
        category: item.category,
        kg_co2e: item.kg_co2e,
        t_co2e: item.t_co2e,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));

      await breakdownRepository.saveMany(breakdownEntities);
    });
  } else {
    // Just update period
    calculation.period_start = period.start;
    calculation.period_end = period.end;
    calculation.updated_at = deps.clock.now();
    await deps.calculationRepository.update(calculation);
  }
}
