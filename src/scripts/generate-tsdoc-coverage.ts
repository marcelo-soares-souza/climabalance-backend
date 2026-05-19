import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type FileCoverage = {
  file: string;
  totalExports: number;
  documentedExports: number;
  missing: string[];
};

const criticalFiles = [
  "src/application/compensations/create-compensation-atomic.ts",
  "src/application/payments/payment-gateway.ts",
  "src/application/payments/payment-store.ts",
  "src/application/payments/payment-status.ts",
  "src/application/payments/simulate-card-payment.ts",
  "src/application/payments/get-payment-status.ts",
  "src/application/payments/process-payment-webhook.ts",
  "src/application/payments/reconcile-payments.ts",
  "src/domain/compensations/repositories/compensation-history-repository.ts",
  "src/domain/compensations/repositories/compensation-certificate-repository.ts",
  "src/infrastructure/persistence/postgres/payment-simulation-store.ts",
];

function isExportDeclaration(line: string): string | null {
  const match = line.match(
    /^\s*export\s+(?:async\s+)?(?:type|interface|class|function|const)\s+([A-Za-z0-9_]+)/,
  );
  return match?.[1] ?? null;
}

function hasTsDocAbove(lines: string[], index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && lines[cursor]!.trim().length === 0) {
    cursor -= 1;
  }
  if (cursor < 0 || !lines[cursor]!.includes("*/")) {
    return false;
  }

  while (cursor >= 0) {
    if (lines[cursor]!.includes("/**")) {
      return true;
    }
    if (lines[cursor]!.includes("/*") && !lines[cursor]!.includes("/**")) {
      return false;
    }
    cursor -= 1;
  }

  return false;
}

function inspectFile(file: string): FileCoverage {
  const fullPath = resolve(process.cwd(), file);
  const source = readFileSync(fullPath, "utf-8");
  const lines = source.split("\n");

  let totalExports = 0;
  let documentedExports = 0;
  const missing: string[] = [];

  lines.forEach((line, index) => {
    const exportName = isExportDeclaration(line);
    if (!exportName) {
      return;
    }

    totalExports += 1;
    if (hasTsDocAbove(lines, index)) {
      documentedExports += 1;
      return;
    }

    missing.push(exportName);
  });

  return {
    file,
    totalExports,
    documentedExports,
    missing,
  };
}

function formatCoverage(files: FileCoverage[]): string {
  const totalExports = files.reduce((acc, item) => acc + item.totalExports, 0);
  const documentedExports = files.reduce(
    (acc, item) => acc + item.documentedExports,
    0,
  );
  const coverage =
    totalExports === 0
      ? 100
      : Math.round((documentedExports / totalExports) * 10000) / 100;

  const lines: string[] = [];
  lines.push("# T034 - Relatorio de cobertura TSDoc");
  lines.push("");
  lines.push(`Data: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `Cobertura global: **${documentedExports}/${totalExports} (${coverage}%)**`,
  );
  lines.push("");
  lines.push("| Arquivo | Exports | Documentados | Cobertura |");
  lines.push("| --- | ---: | ---: | ---: |");

  for (const item of files) {
    const fileCoverage =
      item.totalExports === 0
        ? 100
        : Math.round((item.documentedExports / item.totalExports) * 10000) /
          100;
    lines.push(
      `| \`${item.file}\` | ${item.totalExports} | ${item.documentedExports} | ${fileCoverage}% |`,
    );
  }

  const missingByFile = files.filter((item) => item.missing.length > 0);
  if (missingByFile.length > 0) {
    lines.push("");
    lines.push("## Pendencias");
    lines.push("");
    for (const item of missingByFile) {
      lines.push(`- \`${item.file}\`: ${item.missing.join(", ")}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

const outputPathArg = process.argv[2];
if (!outputPathArg) {
  throw new Error("Missing output file path argument.");
}

const outputPath = resolve(process.cwd(), outputPathArg);
const coverage = criticalFiles.map(inspectFile);
const markdown = formatCoverage(coverage);
writeFileSync(outputPath, markdown, "utf-8");

console.log(`TSDoc coverage report generated: ${outputPath}`);
