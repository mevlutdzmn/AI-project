import * as bcrypt from 'bcryptjs';

// ✅ GÜVENLİK: Daha yüksek bcrypt rounds (12 > 10)
const BCRYPT_ROUNDS = 12;

export class PasswordHasher {
    static async hash(password: string): Promise<string> {
        const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
        return bcrypt.hash(password, salt);
    }

    static async compare(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    // ✅ GÜVENLİK: Timing attack önleme - kullanıcı yoksa bile hash işlemi yap
    static async compareWithTimingSafety(
        password: string,
        hash: string | null,
    ): Promise<boolean> {
        if (!hash) {
            // Kullanıcı yoksa bile aynı sürede yanıt ver (timing attack önleme)
            await bcrypt.hash('dummy-password-for-timing', BCRYPT_ROUNDS);
            return false;
        }
        return bcrypt.compare(password, hash);
    }
}
