export interface GetClimateBalanceDeps {
  calculationRepository: {
    sumFinalizedTCO2eByUser(userId: string): Promise<number>;
  };
  compensationHistoryRepository: {
    getPaidContributionSummaryBySupporter(userId: string): Promise<{
      estimatedOffsetTCO2e: number;
      totalTreesPurchased: number;
      totalContributionAmount: number;
    }>;
  };
}

export interface ClimateBalance {
  grossEmissionsTCO2e: number;
  estimatedOffsetTCO2e: number;
  netBalanceTCO2e: number;
  totalTreesPurchased: number;
  totalContributionAmount: number;
}

export async function getClimateBalance(
  userId: string,
  deps: GetClimateBalanceDeps,
): Promise<ClimateBalance> {
  const [grossEmissionsTCO2e, contributionSummary] = await Promise.all([
    deps.calculationRepository.sumFinalizedTCO2eByUser(userId),
    deps.compensationHistoryRepository.getPaidContributionSummaryBySupporter(
      userId,
    ),
  ]);

  const estimatedOffsetTCO2e = contributionSummary.estimatedOffsetTCO2e;

  return {
    grossEmissionsTCO2e,
    estimatedOffsetTCO2e,
    netBalanceTCO2e: grossEmissionsTCO2e - estimatedOffsetTCO2e,
    totalTreesPurchased: contributionSummary.totalTreesPurchased,
    totalContributionAmount: contributionSummary.totalContributionAmount,
  };
}
