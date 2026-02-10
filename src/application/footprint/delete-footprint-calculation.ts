import type { FootprintCalculationRepository } from '../../domain/footprint/repositories/footprint-calculation-repository';
import { canDeleteCalculation } from '../../domain/footprint/entities/footprint-calculation';
import { NotFoundError, ForbiddenError, ValidationError } from '../../domain/errors';

export interface DeleteFootprintCalculationDeps {
  calculationRepository: FootprintCalculationRepository;
}

export async function deleteFootprintCalculation(
  deps: DeleteFootprintCalculationDeps,
  calculationId: string,
  userId: string,
  isAdmin = false
): Promise<void> {
  const calculation = await deps.calculationRepository.findById(calculationId);

  if (!calculation) {
    throw new NotFoundError('footprint.calculation.not_found');
  }

  // Allow admin to delete any calculation, regular users only their own
  if (calculation.user_id !== userId && !isAdmin) {
    throw new ForbiddenError('footprint.calculation.not_owner');
  }

  if (!canDeleteCalculation(calculation, isAdmin)) {
    throw new ValidationError([
      { field: 'status', message: 'Cannot delete finalized calculation' }
    ]);
  }

  await deps.calculationRepository.delete(calculationId);
}
