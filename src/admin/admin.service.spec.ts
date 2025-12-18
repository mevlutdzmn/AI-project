import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { DRIZZLE } from '../database/drizzle.provider';

describe('AdminService', () => {
  let service: AdminService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('should return dashboard statistics', async () => {
      // Mock all the stat queries
      const mockStats = [
        [{ count: 100 }], // totalUsers
        [{ count: 80 }], // activeUsers
        [{ total: 5000 }], // totalRevenue
        [{ count: 200 }], // totalSessions
        [{ count: 1500 }], // totalMessages
        [{ count: 15 }], // recentRegistrations
      ];

      let callCount = 0;
      mockDb.from.mockImplementation(() => {
        const result = mockStats[callCount] || [{ count: 0 }];
        callCount++;
        return {
          where: jest.fn().mockResolvedValue(result),
          select: jest.fn().mockReturnThis(),
        };
      });

      // Mock the chain properly
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 100 }]),
        }),
      });

      jest.spyOn(service, 'getStats').mockResolvedValue({
        totalUsers: 100,
        activeUsers: 80,
        totalRevenue: 5000,
        totalSessions: 200,
        totalMessages: 1500,
        recentRegistrations: 15,
      });

      const result = await service.getStats();

      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('activeUsers');
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('totalSessions');
      expect(result).toHaveProperty('totalMessages');
      expect(result).toHaveProperty('recentRegistrations');
    });
  });

  describe('getUsers', () => {
    it('should return paginated users list', async () => {
      const mockUsers = [
        { id: 1, email: 'user1@test.com', password: 'hash', active: true },
        { id: 2, email: 'user2@test.com', password: 'hash', active: true },
      ];

      jest.spyOn(service, 'getUsers').mockResolvedValue({
        users: mockUsers.map(({ password, ...u }) => u),
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const result = await service.getUsers(1, 10, '');

      expect(result.users).toHaveLength(2);
      expect(result.users[0]).not.toHaveProperty('password');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
    });

    it('should filter users by search term', async () => {
      jest.spyOn(service, 'getUsers').mockResolvedValue({
        users: [{ id: 1, email: 'admin@test.com', active: true }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      const result = await service.getUsers(1, 10, 'admin');

      expect(result.users).toHaveLength(1);
      expect(result.users[0].email).toContain('admin');
    });

    it('should handle empty results', async () => {
      jest.spyOn(service, 'getUsers').mockResolvedValue({
        users: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const result = await service.getUsers(1, 10, 'nonexistent');

      expect(result.users).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getUser', () => {
    it('should return user by id without password', async () => {
      jest.spyOn(service, 'getUser').mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        active: true,
        isAdmin: false,
        isPremium: true,
        verified: true,
        verificationCode: null,
        verificationExpires: null,
        imageCredits: 100,
        premiumUntil: null,
        resetToken: null,
        resetTokenExpiry: null,
        createdAt: new Date(),
      } as any);

      const result = await service.getUser(1);

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password');
      expect(result?.email).toBe('test@test.com');
    });

    it('should return null for non-existent user', async () => {
      jest.spyOn(service, 'getUser').mockResolvedValue(null);

      const result = await service.getUser(999);

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create new user with hashed password', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: 'SecurePass123!',
        isAdmin: false,
        active: true,
      };

      jest.spyOn(service, 'createUser').mockResolvedValue({
        id: 1,
        email: userData.email,
        active: true,
        isAdmin: false,
        verified: false,
        verificationCode: null,
        verificationExpires: null,
        isPremium: false,
        imageCredits: 0,
        premiumUntil: null,
        resetToken: null,
        resetTokenExpiry: null,
        createdAt: new Date(),
      } as any);

      const result = await service.createUser(userData);

      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
      expect(result).not.toHaveProperty('password');
    });

    it('should throw error for duplicate email', async () => {
      jest
        .spyOn(service, 'createUser')
        .mockRejectedValue(new Error('Email already exists'));

      await expect(
        service.createUser({ email: 'existing@test.com', password: 'pass' }),
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      jest.spyOn(service, 'updateUser').mockResolvedValue({
        id: 1,
        email: 'updated@test.com',
        active: true,
        isPremium: true,
        verified: true,
        verificationCode: null,
        verificationExpires: null,
        isAdmin: false,
        imageCredits: 100,
        premiumUntil: null,
        resetToken: null,
        resetTokenExpiry: null,
        createdAt: new Date(),
      } as any);

      const result = await service.updateUser(1, { isPremium: true });

      expect(result?.isPremium).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      jest.spyOn(service, 'updateUser').mockResolvedValue(null);

      const result = await service.updateUser(999, { active: false });

      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      jest.spyOn(service, 'deleteUser').mockResolvedValue({ id: 1, email: 'deleted@test.com' } as any);

      const result = await service.deleteUser(1, 999);

      expect(result).toBeDefined();
    });

    it('should handle deletion of non-existent user', async () => {
      jest.spyOn(service, 'deleteUser').mockResolvedValue(null as any);

      const result = await service.deleteUser(999, 1);

      expect(result).toBeNull();
    });
  });

  describe('getPayments', () => {
    it('should return paginated payments', async () => {
      jest.spyOn(service, 'getPayments').mockResolvedValue({
        payments: [
          { id: 1, userId: 1, amount: 2000, status: 'completed', createdAt: new Date(), email: 'test@test.com' },
          { id: 2, userId: 2, amount: 2000, status: 'pending', createdAt: new Date(), email: 'test2@test.com' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      } as any);

      const result = await service.getPayments(1, 10);

      expect(result.payments).toHaveLength(2);
      expect(result).toHaveProperty('total');
    });
  });

  describe('getSessions', () => {
    it('should return paginated chat sessions', async () => {
      jest.spyOn(service, 'getSessions').mockResolvedValue({
        success: true,
        sessions: [
          { id: 'sess1', userId: 1, title: 'Test Chat', createdAt: new Date(), updatedAt: new Date(), userEmail: 'test@test.com' },
          { id: 'sess2', userId: 2, title: 'Another Chat', createdAt: new Date(), updatedAt: new Date(), userEmail: 'test2@test.com' },
        ],
        count: 2,
      } as any);

      const result = await service.getSessions(1, 10);

      expect(result.sessions).toHaveLength(2);
      expect(result.count).toBe(2);
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages', async () => {
      jest.spyOn(service, 'getMessages').mockResolvedValue({
        messages: [
          { id: 1, sessionId: 'sess1', role: 'user', content: 'Hello', createdAt: new Date(), userId: 1, userEmail: 'test@test.com', sessionTitle: 'Test' },
          { id: 2, sessionId: 'sess1', role: 'assistant', content: 'Hi!', createdAt: new Date(), userId: 1, userEmail: 'test@test.com', sessionTitle: 'Test' },
        ],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      } as any);

      const result = await service.getMessages(1, 10);

      expect(result.messages).toHaveLength(2);
    });
  });
});
