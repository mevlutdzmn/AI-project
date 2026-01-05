import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    DatabaseModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        // ✅ Access tokens expire in 15 minutes for security
        // Refresh tokens (stored in DB) last 30 days
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: GoogleStrategy,
      useFactory: (configService: ConfigService) => {
        const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
        const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');

        // Only register GoogleStrategy if credentials are provided
        if (
          clientID &&
          clientSecret &&
          clientID !== 'your-google-client-id.apps.googleusercontent.com'
        ) {
          return new GoogleStrategy(configService);
        }
        return null;
      },
      inject: [ConfigService],
    },
  ],
})
export class AuthModule {}
