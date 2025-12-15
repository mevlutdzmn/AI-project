import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  
  constructor(private configService: ConfigService) {
    // Detect environment: Vercel production vs local development
    const isVercel = process.env.VERCEL === '1';
    
    // Use production URL on Vercel, otherwise use environment variable or fallback to localhost
    const backendUrl = isVercel 
      ? 'https://nestjs-back-kohl.vercel.app/api/v1'
      : (configService.get<string>('BACKEND_URL') || 'http://localhost:4000/api/v1');
    
    const callbackURL = `${backendUrl}/auth/google/callback`;
    
    // Debug logging to verify configuration
    const logger = new Logger(GoogleStrategy.name);
    logger.debug(`Google OAuth Config - env: ${isVercel ? 'Vercel' : 'Local'}, callback: ${callbackURL}`);
    
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
      callbackURL,
      scope: ['email', 'profile'],
    } as any);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    const user = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
      accessToken,
    };
    done(null, user);
  }
}
