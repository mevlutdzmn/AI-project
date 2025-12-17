import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { MemoryService } from '../memory/memory.service';
import { OpenAIAdapter } from '../ai/adapters/openai.adapter';
import { DalleAdapter } from '../ai/adapters/dalle.adapter';
import { SearchAdapter } from '../ai/adapters/search.adapter';
import { DeepResearchAdapter } from '../ai/adapters/deep-research.adapter';
import { DRIZZLE } from '../database/drizzle.provider';

/**
 * ChatService Unit Tests
 * 
 * Note: ChatService has complex Drizzle ORM chaining that's difficult to mock.
 * These tests verify service instantiation and method availability.
 * For full integration tests, use e2e tests with a test database.
 */
describe('ChatService', () => {
  let service: ChatService;

  // Simple mock that returns itself for any method call and resolves to array
  const createDrizzleMock = () => {
    const mockResult = [{ id: 'session-123', userId: 1, ownerId: 1 }];
    const mock: Record<string, unknown> = {};
    
    const handler = () => {
      const chainable: Record<string, unknown> = {
        then: (resolve: (val: unknown) => void) => Promise.resolve(mockResult).then(resolve),
      };
      
      ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 
       'insert', 'values', 'returning', 'update', 'set', 'delete'].forEach(m => {
        chainable[m] = handler;
      });
      
      return chainable;
    };
    
    ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 
     'insert', 'values', 'returning', 'update', 'set', 'delete'].forEach(m => {
      mock[m] = handler;
    });
    
    return mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: DRIZZLE, useValue: createDrizzleMock() },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
        { provide: UsersService, useValue: { findById: jest.fn(), updateTokenUsage: jest.fn() } },
        { provide: MemoryService, useValue: { getMemories: jest.fn().mockResolvedValue([]), addMemory: jest.fn() } },
        { provide: OpenAIAdapter, useValue: { chat: jest.fn() } },
        { provide: DalleAdapter, useValue: { generate: jest.fn() } },
        { provide: SearchAdapter, useValue: { search: jest.fn() } },
        { provide: DeepResearchAdapter, useValue: { research: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('Service Instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have createSession method', () => {
      expect(typeof service.createSession).toBe('function');
    });

    it('should have getSessionMessages method', () => {
      expect(typeof service.getSessionMessages).toBe('function');
    });

    it('should have getUserSessions method', () => {
      expect(typeof service.getUserSessions).toBe('function');
    });

    it('should have deleteSession method', () => {
      expect(typeof service.deleteSession).toBe('function');
    });

    it('should have sendMessage method', () => {
      expect(typeof service.sendMessage).toBe('function');
    });

    it('should have sendMessageStream method', () => {
      expect(typeof service.sendMessageStream).toBe('function');
    });
  });
});
