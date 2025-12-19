/**
 * Users Service Tests
 * Tests for src/users/users.service.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DRIZZLE } from '../database/drizzle.provider';

// Mock database
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, email: 'test@example.com', verified: true };
      mockDb.where.mockResolvedValueOnce([mockUser]);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = { id: 1, email: 'test@example.com', verified: true };
      mockDb.where.mockResolvedValueOnce([mockUser]);

      const result = await service.findById(1);

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create and return new user', async () => {
      const newUser = { id: 1, email: 'new@example.com', verified: false };
      mockDb.returning.mockResolvedValueOnce([newUser]);

      const result = await service.create({
        email: 'new@example.com',
        password: 'hashedPassword',
      });

      expect(result).toEqual(newUser);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'hashedPassword',
      });
    });
  });

  describe('incrementImageCredits', () => {
    it('should increment image credits', async () => {
      mockDb.where.mockResolvedValueOnce([{ imageCredits: 1 }]);

      await service.incrementImageCredits(1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('getImageCredits', () => {
    it('should return image credits', async () => {
      mockDb.where.mockResolvedValueOnce([{ imageCredits: 5 }]);

      const result = await service.getImageCredits(1);

      expect(result).toBe(5);
    });

    it('should return 0 when no credits', async () => {
      mockDb.where.mockResolvedValueOnce([{ imageCredits: null }]);

      const result = await service.getImageCredits(1);

      expect(result).toBe(0);
    });
  });

  describe('resetImageCredits', () => {
    it('should reset image credits to 0', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await service.resetImageCredits(1);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ imageCredits: 0 });
    });
  });

  describe('updateProfile', () => {
    it('should return updated user profile', async () => {
      const updatedUser = {
        id: 1,
        email: 'test@example.com',
        verified: true,
        active: true,
        isPremium: true,
        subscriptionExpiresAt: new Date(),
      };
      mockDb.where.mockResolvedValueOnce([updatedUser]);

      const result = await service.updateProfile(1);

      expect(result).toEqual(updatedUser);
    });
  });

  describe('updatePassword', () => {
    it('should update password', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await service.updatePassword(1, 'newHashedPassword');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ password: 'newHashedPassword' });
    });
  });
});
