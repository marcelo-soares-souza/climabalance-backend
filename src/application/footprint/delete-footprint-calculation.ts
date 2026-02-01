import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import { canDeleteCalculation } from '../../domain/footprint/entities/footprint-calculation';
import { NotFoundError, ForbiddenError, ValidationError } from '../../domain/errors';

export interface DeleteFootprintCalculationDeps {
  calculationRepository: FootprintCalculationRepository;
}

export async function deleteFootprintCalculation(
  deps: DeleteFootprintCalculationDeps,
  calculationId: string,
  userId: string
): Promise<void> {
  const calculation = await deps.calculationRepository.findById(calculationId);

  if (!calculation) {
    throw new NotFoundError('footprint.calculation.not_found');
  }

  if (calculation.user_id !== userId) {
    throw new ForbiddenError('footprint.calculation.not_owner');
  }

  if (!canDeleteCalculation(calculation)) {
    throw new ValidationError([
      { field: 'status', message: 'Cannot delete finalized calculation' }
    ]);
  }

  await deps.calculationRepository.delete(calculationId);
}
