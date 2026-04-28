import { describe, expect, test } from 'bun:test';
import { getClimateBalance } from '../src/application/users/get-climate-balance';

describe('getClimateBalance', () => {
  test('aggregates finalized footprint emissions and paid tree contributions', async () => {
    const result = await getClimateBalance('user-1', {
      calculationRepository: {
        async sumFinalizedTCO2eByUser(userId: string) {
          expect(userId).toBe('user-1');
          return 12.5;
        },
      },
      compensationHistoryRepository: {
        async getPaidContributionSummaryBySupporter(userId: string) {
          expect(userId).toBe('user-1');
          return {
            estimatedOffsetTCO2e: 3.25,
            totalTreesPurchased: 80,
            totalContributionAmount: 960,
          };
        },
      },
    });

    expect(result).toEqual({
      grossEmissionsTCO2e: 12.5,
      estimatedOffsetTCO2e: 3.25,
      netBalanceTCO2e: 9.25,
      totalTreesPurchased: 80,
      totalContributionAmount: 960,
    });
  });
});
