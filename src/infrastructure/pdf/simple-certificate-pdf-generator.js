export class SimpleCertificatePdfGenerator {
    async generate(data) {
        const lines = buildCertificateLines(data);
        return buildSimplePdf(lines);
    }
}
function buildCertificateLines(data) {
    const issuedAt = formatUtcDate(data.issuedAt);
    const amount = `${data.totalAmount.toFixed(2)} ${data.currency.toUpperCase()}`;
    const mode = data.compensationMode ?? 'tco2e';
    const horizon = data.horizonYears ?? 20;
    return [
        'Carbon Compensation Certificate',
        'Centro Brasil no Clima',
        '',
        `Certificate Number: ${data.certificateNumber}`,
        `Issued At (UTC): ${issuedAt}`,
        '',
        `Compensation ID: ${data.compensationId}`,
        `Compensation Mode: ${mode}`,
        `Supporter User ID: ${data.supporterUserId}`,
        `Area ID: ${data.areaId}`,
        `Calculation ID: ${data.calculationId ?? '-'}`,
        '',
        `Total Compensated: ${data.totalTCO2e.toFixed(6)} tCO2e`,
        `Trees Count: ${data.treesCount}`,
        `Trees Requested: ${data.treesRequested ?? data.treesCount}`,
        `Capture Horizon: ${horizon} years`,
        `Estimated Total in Horizon: ${(data.estimatedTotalTCO2e ?? data.totalTCO2e).toFixed(6)} tCO2e`,
        `Price per Tree: ${(data.pricePerTree ?? 0).toFixed(2)} ${data.currency.toUpperCase()}`,
        `Total Amount: ${amount}`,
        '',
        `Authenticity Hash: ${data.authenticityHash ?? '-'}`,
        `Validation URL: ${data.validationUrl ?? '-'}`,
        `QR Payload: ${data.qrCodeData ?? data.validationUrl ?? '-'}`,
        '',
        'This document certifies the compensation registration in the platform.',
    ];
}
function formatUtcDate(value) {
    return value.toISOString().replace('T', ' ').replace('Z', ' UTC');
}
function escapePdfText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r?\n/g, ' ');
}
function buildSimplePdf(lines) {
    const commands = [];
    let y = 790;
    for (const [index, line] of lines.entries()) {
        const fontSize = index === 0 ? 20 : index === 1 ? 14 : 11;
        commands.push('BT');
        commands.push(`/F1 ${fontSize} Tf`);
        commands.push(`40 ${y} Td`);
        commands.push(`(${escapePdfText(line)}) Tj`);
        commands.push('ET');
        y -= index <= 1 ? 26 : 18;
    }
    const contentStream = `${commands.join('\n')}\n`;
    const contentLength = Buffer.byteLength(contentStream, 'utf8');
    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
        [
            '3 0 obj',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]',
            '/Resources << /Font << /F1 4 0 R >> >>',
            '/Contents 5 0 R >>',
            'endobj',
            '',
        ].join('\n'),
        '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
        `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += object;
    }
    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index <= objects.length; index += 1) {
        const offset = String(offsets[index]).padStart(10, '0');
        pdf += `${offset} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
}
