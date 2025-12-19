/**
 * Memory Service Tests
 * Tests for src/memory/memory.service.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MemoryService } from './memory.service';
import { DRIZZLE } from '../database/drizzle.provider';

// Mock database
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
};

describe('MemoryService', () => {
  let service: MemoryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<MemoryService>(MemoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMemories', () => {
    it('should return all memories for user', async () => {
      const mockMemories = [
        { id: 1, userId: 1, key: 'name', value: 'John', category: 'general' },
        { id: 2, userId: 1, key: 'job', value: 'Developer', category: 'work' },
      ];
      mockDb.where.mockResolvedValueOnce(mockMemories);

      const result = await service.getMemories(1);

      expect(result).toEqual(mockMemories);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no memories', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.getMemories(1);

      expect(result).toEqual([]);
    });
  });

  describe('setMemory', () => {
    it('should create new memory', async () => {
      const newMemory = { id: 1, userId: 1, key: 'name', value: 'John', category: 'general' };
      
      // Check existing - none found
      mockDb.limit.mockResolvedValueOnce([]);
      // Create new
      mockDb.returning.mockResolvedValueOnce([newMemory]);

      const result = await service.setMemory(1, 'name', 'John');

      expect(result).toEqual(newMemory);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing memory', async () => {
      const existingMemory = { id: 1, userId: 1, key: 'name', value: 'John', category: 'general' };
      const updatedMemory = { ...existingMemory, value: 'Jane' };

      // Check existing - found
      mockDb.limit.mockResolvedValueOnce([existingMemory]);
      // Update
      mockDb.returning.mockResolvedValueOnce([updatedMemory]);

      const result = await service.setMemory(1, 'name', 'Jane');

      expect(result).toEqual(updatedMemory);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle custom category', async () => {
      const newMemory = { id: 1, userId: 1, key: 'job', value: 'Dev', category: 'work' };
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.returning.mockResolvedValueOnce([newMemory]);

      const result = await service.setMemory(1, 'job', 'Dev', 'work');

      expect(result.category).toBe('work');
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory by key', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await service.deleteMemory(1, 'name');

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('clearAllMemories', () => {
    it('should clear all user memories', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await service.clearAllMemories(1);

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('getCustomInstructions', () => {
    it('should return custom instructions', async () => {
      const instructions = {
        id: 1,
        userId: 1,
        aboutUser: 'I am a developer',
        responseStyle: 'Be concise',
        enabled: true,
      };
      mockDb.limit.mockResolvedValueOnce([instructions]);

      const result = await service.getCustomInstructions(1);

      expect(result).toEqual(instructions);
    });

    it('should return null when no instructions', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.getCustomInstructions(1);

      expect(result).toBeNull();
    });
  });

  describe('setCustomInstructions', () => {
    it('should create new custom instructions', async () => {
      const newInstructions = {
        id: 1,
        userId: 1,
        aboutUser: 'Developer',
        responseStyle: 'Concise',
        enabled: true,
      };

      // getCustomInstructions - none found
      mockDb.limit.mockResolvedValueOnce([]);
      // Create
      mockDb.returning.mockResolvedValueOnce([newInstructions]);

      const result = await service.setCustomInstructions(1, 'Developer', 'Concise');

      expect(result).toEqual(newInstructions);
    });

    it('should update existing custom instructions', async () => {
      const existing = { id: 1, userId: 1, aboutUser: 'Old', responseStyle: 'Old', enabled: true };
      const updated = { ...existing, aboutUser: 'New', responseStyle: 'New' };

      // getCustomInstructions - found
      mockDb.limit.mockResolvedValueOnce([existing]);
      // Update
      mockDb.returning.mockResolvedValueOnce([updated]);

      const result = await service.setCustomInstructions(1, 'New', 'New');

      expect(result).toEqual(updated);
    });
  });
});
