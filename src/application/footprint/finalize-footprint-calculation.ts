import type { FootprintCalculationRepository } from "../../domain/footprint/repositories/footprint-calculation-repository";
import type { Clock } from "../../domain/services/clock";
import type { IdGenerator } from "../../domain/services/id-generator";
import type { UnitOfWork } from "../../infrastructure/persistence/unit-of-work";
import { canFinalizeCalculation } from "../../domain/footprint/entities/footprint-calculation";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../domain/errors";

export interface FinalizeFootprintCalculationDeps {
  calculationRepository: FootprintCalculationRepository;
  unitOfWork: UnitOfWork;
  idGenerator: IdGenerator;
  clock: Clock;
}

export async function finalizeFootprintCalculation(
  deps: FinalizeFootprintCalculationDeps,
  calculationId: string,
  userId: string,
  isAdmin = false,
): Promise<void> {
  const calculation = await deps.calculationRepository.findById(calculationId);

  if (!calculation) {
    throw new NotFoundError("footprint.calculation.not_found");
  }

  // Allow admin to finalize any calculation, regular users only their own
  if (calculation.user_id !== userId && !isAdmin) {
    throw new ForbiddenError("footprint.calculation.not_owner");
  }

  if (!canFinalizeCalculation(calculation, isAdmin)) {
    throw new ValidationError([
      { field: "status", message: "Calculation is already finalized" },
    ]);
  }

  const now = deps.clock.now();
  calculation.status = "finalized";
  calculation.finalized_at = now;
  calculation.updated_at = now;

  await deps.unitOfWork.execute(async (tx) => {
    const calculationRepository = tx.getFootprintCalculationRepository();
    const auditLogRepository = tx.getAuditLogRepository();

    await calculationRepository.update(calculation);
    await auditLogRepository.create({
      id: deps.idGenerator.generate(),
      actorUserId: userId,
      action: "footprint_calculation.finalized",
      entityType: "footprint_calculation",
      entityId: calculationId,
      reason: null,
      createdAt: now,
    });
  });
}
