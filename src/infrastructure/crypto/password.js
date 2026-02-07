import { env } from '../../shared/utils/env';
function withPepper(password) {
    return `${password}${env.passwordPepper}`;
}
export const bunPasswordHasher = {
    async hash(password) {
        return Bun.password.hash(withPepper(password), {
            algorithm: 'bcrypt',
            cost: 12
        });
    },
    async verify(password, passwordHash) {
        return Bun.password.verify(withPepper(password), passwordHash);
    }
};
