import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DRIZZLE } from '../database/drizzle.provider';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDb: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockDb = {
      execute: jest.fn().mockResolvedValue([{ '1': 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DRIZZLE, useValue: mockDb }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('healthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      const result = await controller.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('pass');
      expect(result.checks.memory.status).toBe('pass');
    });

    it('should include timestamp and uptime', async () => {
      const result = await controller.healthCheck();

      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
    });

    it('should return unhealthy when database fails', async () => {
      mockDb.execute.mockRejectedValue(new Error('Connection failed'));

      const result = await controller.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('fail');
    });
  });

  describe('liveness', () => {
    it('should return ok status', () => {
      const result = controller.liveness();

      expect(result.status).toBe('ok');
    });
  });

  describe('readiness', () => {
    it('should return ready when database is accessible', async () => {
      const result = await controller.readiness();

      expect(result.ready).toBe(true);
      expect(result.status).toBe('ok');
    });

    it('should return not ready when database fails', async () => {
      mockDb.execute.mockRejectedValue(new Error('Connection failed'));

      const result = await controller.readiness();

      expect(result.ready).toBe(false);
      expect(result.status).toBe('error');
    });
  });

  describe('detailedHealth', () => {
    it('should return detailed metrics', async () => {
      const result = await controller.detailedHealth();

      expect(result.metrics).toBeDefined();
      expect(result.metrics.memory).toBeDefined();
      expect(result.metrics.cpu).toBeDefined();
      expect(result.metrics.process).toBeDefined();
    });
  });
});
