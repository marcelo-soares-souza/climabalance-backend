export function maskEmail(value?: string | null): string | null {
  if (!value) return null;
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return value;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);

  if (local.length <= 2) {
    return `${local.slice(0, 1)}***${domain}`;
  }

  return `${local.slice(0, 2)}***${domain}`;
}

export function maskDocumentNumber(value?: string | null): string | null {
  if (!value) return null;
  const visible = value.trim().slice(-4);
  return visible ? `***${visible}` : '***';
}

export function maskBirthDate(value?: string | null): string | null {
  if (!value) return null;
  return '****-**-**';
}
