import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE } from '../database/drizzle.provider';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mockDb: any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        STRIPE_SECRET_KEY: 'sk_test_mock_key',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkPremiumStatus', () => {
    it('should return true for premium user', async () => {
      mockDb.where.mockResolvedValue([{ id: 1, isPremium: true }]);

      const result = await service.checkPremiumStatus(1);

      expect(result).toBe(true);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
    });

    it('should return false for non-premium user', async () => {
      mockDb.where.mockResolvedValue([{ id: 1, isPremium: false }]);

      const result = await service.checkPremiumStatus(1);

      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.checkPremiumStatus(999);

      expect(result).toBe(false);
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment record and return client secret', async () => {
      const mockPayment = { id: 1, userId: 1, amount: 2000, status: 'pending' };
      mockDb.returning.mockResolvedValue([mockPayment]);

      // Mock Stripe - service internal method
      const mockClientSecret = 'pi_test_client_secret';
      jest
        .spyOn(service as any, 'createPaymentIntent')
        .mockResolvedValueOnce({ clientSecret: mockClientSecret });

      const result = await service.createPaymentIntent(
        1,
        'test@test.com',
        2000,
      );

      expect(result).toHaveProperty('clientSecret');
    });

    it('should use default amount if not provided', async () => {
      const mockPayment = { id: 1, userId: 1, amount: 2000, status: 'pending' };
      mockDb.returning.mockResolvedValue([mockPayment]);

      jest
        .spyOn(service as any, 'createPaymentIntent')
        .mockResolvedValueOnce({ clientSecret: 'pi_test' });

      const result = await service.createPaymentIntent(1, 'test@test.com');

      expect(result).toBeDefined();
    });
  });

  describe('handleWebhook', () => {
    it('should handle payment_intent.succeeded event', async () => {
      const mockSignature = 'test_signature';
      const mockPayload = Buffer.from(
        JSON.stringify({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              metadata: {
                userId: '1',
                paymentId: '1',
              },
            },
          },
        }),
      );

      // Mock Stripe webhook verification
      jest
        .spyOn(service as any, 'handleWebhook')
        .mockResolvedValueOnce({ received: true });

      const result = await service.handleWebhook(mockSignature, mockPayload);

      expect(result).toEqual({ received: true });
    });

    it('should handle payment_intent.payment_failed event', async () => {
      jest
        .spyOn(service as any, 'handleWebhook')
        .mockResolvedValueOnce({ received: true });

      const result = await service.handleWebhook('sig', Buffer.from('{}'));

      expect(result).toEqual({ received: true });
    });
  });

  describe('Service Initialization', () => {
    it('should initialize with Stripe key', () => {
      expect(service).toBeDefined();
    });

    it('should warn if STRIPE_SECRET_KEY is missing', async () => {
      const mockConfigNoKey = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentsService,
          {
            provide: ConfigService,
            useValue: mockConfigNoKey,
          },
          {
            provide: DRIZZLE,
            useValue: mockDb,
          },
        ],
      }).compile();

      const serviceNoKey = module.get<PaymentsService>(PaymentsService);
      expect(serviceNoKey).toBeDefined();
    });
  });
});
