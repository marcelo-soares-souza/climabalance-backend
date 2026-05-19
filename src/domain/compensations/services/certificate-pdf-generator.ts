export type CompensationCertificatePdfData = {
  certificateNumber: string;
  issuedAt: Date;
  authenticityHash?: string;
  validationUrl?: string;
  qrCodeData?: string;
  compensationId: string;
  supporterUserId: string;
  areaId: string;
  calculationId?: string;
  compensationMode?: "tco2e" | "tree_purchase";
  horizonYears?: number;
  treesRequested?: number;
  pricePerTree?: number;
  estimatedTotalTCO2e?: number;
  totalTCO2e: number;
  treesCount: number;
  totalAmount: number;
  currency: string;
};

export interface CompensationCertificatePdfGenerator {
  generate(data: CompensationCertificatePdfData): Promise<Uint8Array>;
}
