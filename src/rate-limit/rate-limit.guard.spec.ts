import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitGuard } from './rate-limit.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, HttpException } from '@nestjs/common';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: Reflector;

  const mockExecutionContext = (
    ip: string = '127.0.0.1',
    path: string = '/api/test',
  ) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          path,
          headers: {},
          socket: { remoteAddress: ip },
          user: null,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    guard.onModuleDestroy();
  });

  describe('canActivate', () => {
    it('should allow first request', () => {
      const context = mockExecutionContext();
      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should allow requests under the limit', () => {
      const context = mockExecutionContext();

      // Make 50 requests (under default limit of 100)
      for (let i = 0; i < 50; i++) {
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('should block requests over the limit', () => {
      const context = mockExecutionContext('192.168.1.1', '/auth/login');

      // Auth endpoints have 10 req/min limit
      for (let i = 0; i < 10; i++) {
        guard.canActivate(context);
      }

      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });

    it('should track different IPs separately', () => {
      const context1 = mockExecutionContext('192.168.1.1');
      const context2 = mockExecutionContext('192.168.1.2');

      // Exhaust limit for IP1
      for (let i = 0; i < 100; i++) {
        guard.canActivate(context1);
      }

      // IP2 should still be allowed
      expect(guard.canActivate(context2)).toBe(true);
    });

    it('should apply different limits for different paths', () => {
      const authContext = mockExecutionContext('10.0.0.1', '/auth/login');
      const chatContext = mockExecutionContext('10.0.0.2', '/chat/stream');

      // Auth has 10 req/min
      for (let i = 0; i < 10; i++) {
        expect(guard.canActivate(authContext)).toBe(true);
      }

      // Chat has 30 req/min
      for (let i = 0; i < 30; i++) {
        expect(guard.canActivate(chatContext)).toBe(true);
      }
    });
  });

  describe('rate limit types', () => {
    it('should identify auth endpoints', () => {
      const context = mockExecutionContext('1.1.1.1', '/auth/login');

      // Auth limit is 10
      for (let i = 0; i < 10; i++) {
        guard.canActivate(context);
      }

      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });

    it('should identify deep-research endpoints', () => {
      const context = mockExecutionContext('2.2.2.2', '/deep-research/start');

      // Research limit is 5
      for (let i = 0; i < 5; i++) {
        guard.canActivate(context);
      }

      expect(() => guard.canActivate(context)).toThrow(HttpException);
    });
  });
});
