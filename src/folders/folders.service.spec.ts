/**
 * Folders Service Tests
 * Tests for src/folders/folders.service.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { DRIZZLE } from '../database/drizzle.provider';

// Mock database
const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
};

describe('FoldersService', () => {
  let service: FoldersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<FoldersService>(FoldersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserFolders', () => {
    it('should return user folders', async () => {
      const mockFolders = [
        { id: 1, name: 'Work', userId: 1 },
        { id: 2, name: 'Personal', userId: 1 },
      ];
      mockDb.orderBy.mockResolvedValueOnce(mockFolders);

      const result = await service.getUserFolders(1);

      expect(result).toEqual(mockFolders);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no folders', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.getUserFolders(1);

      expect(result).toEqual([]);
    });
  });

  describe('createFolder', () => {
    it('should create and return new folder', async () => {
      const newFolder = { id: 1, name: 'New Folder', userId: 1 };
      mockDb.returning.mockResolvedValueOnce([newFolder]);

      const result = await service.createFolder(1, 'New Folder', '#FF0000', '📁');

      expect(result).toEqual(newFolder);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create folder without optional fields', async () => {
      const newFolder = { id: 1, name: 'Basic Folder', userId: 1 };
      mockDb.returning.mockResolvedValueOnce([newFolder]);

      const result = await service.createFolder(1, 'Basic Folder');

      expect(result).toEqual(newFolder);
    });
  });

  describe('updateFolder', () => {
    it('should update and return folder', async () => {
      const existingFolder = { id: 1, name: 'Old Name', userId: 1 };
      const updatedFolder = { id: 1, name: 'New Name', userId: 1 };

      // First call: check existence
      mockDb.where.mockResolvedValueOnce([existingFolder]);
      // Second call: return updated
      mockDb.returning.mockResolvedValueOnce([updatedFolder]);

      const result = await service.updateFolder(1, 1, { name: 'New Name' });

      expect(result).toEqual(updatedFolder);
    });

    it('should throw NotFoundException when folder not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(
        service.updateFolder(999, 1, { name: 'New Name' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when user does not own folder', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(
        service.updateFolder(1, 999, { name: 'New Name' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder and unlink sessions', async () => {
      const existingFolder = { id: 1, name: 'Delete Me', userId: 1 };
      mockDb.where.mockResolvedValueOnce([existingFolder]);
      // Update sessions
      mockDb.where.mockResolvedValueOnce([]);
      // Delete folder
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.deleteFolder(1, 1);

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when folder not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.deleteFolder(999, 1)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getFolderSessions', () => {
    it('should return sessions in folder', async () => {
      const folder = { id: 1, name: 'Work', userId: 1 };
      const sessions = [
        { id: 's1', title: 'Session 1', folderId: 1 },
        { id: 's2', title: 'Session 2', folderId: 1 },
      ];

      // Check folder exists
      mockDb.where.mockResolvedValueOnce([folder]);
      // Get sessions
      mockDb.where.mockResolvedValueOnce(sessions);

      const result = await service.getFolderSessions(1, 1);

      expect(result).toEqual(sessions);
    });

    it('should throw NotFoundException when folder not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.getFolderSessions(999, 1)).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
