export async function listAuditLog(filters, deps) {
    return deps.auditLog.list(filters);
}
