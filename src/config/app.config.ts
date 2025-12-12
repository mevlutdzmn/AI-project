import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
    port: parseInt(process.env.PORT ?? '4001', 10) || 4001,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV || 'development',
}));
