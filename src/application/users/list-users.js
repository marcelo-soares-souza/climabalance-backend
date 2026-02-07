export async function listUsers(filters, deps) {
    return deps.users.list(filters);
}
