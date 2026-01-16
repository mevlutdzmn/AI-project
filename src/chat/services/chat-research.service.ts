/**
 * Chat Research Service
 * 
 * Handles deep research mode operations:
 * - Web search integration
 * - AI analysis with search results
 * - Research mode formatting
 * 
 * @module chat/services/chat-research.service
 * @description Single Responsibility: Only handles research operations
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DRIZZLE } from '../../database/drizzle.provider';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { messages, sessions } from '../../database/schema';
import { eq, desc } from 'drizzle-orm';
import { OpenAIAdapter, ChatMessage } from '../../ai/adapters/openai.adapter';
import { SearchAdapter } from '../../ai/adapters/search.adapter';
import { DeepResearchAdapter } from '../../ai/adapters/deep-research.adapter';

/**
 * Parse message content - handles string, JSON array, and markdown image formats
 * This is critical for image support:
 * - JSON stringified arrays (user-uploaded images) → parsed back to arrays
 * - Markdown images (AI-generated) → converted to OpenAI Vision format
 */
function parseMessageContent(content: any): string | any[] {
  if (typeof content === 'string') {
    // Try to parse as JSON (might be stringified array with images)
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed; // Return as array for proper image handling
      }
    } catch {
      // Not JSON, continue to check for markdown images
    }

    // Check for markdown images: ![alt](url) - AI-generated images
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...content.matchAll(imageRegex)];

    if (matches.length > 0) {
      const parts: any[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchIndex = match.index ?? 0;

        // Add text before the image (if any)
        if (matchIndex > lastIndex) {
          const textBefore = content.slice(lastIndex, matchIndex).trim();
          if (textBefore) {
            parts.push({ type: 'text', text: textBefore });
          }
        }

        // Add the image in OpenAI Vision format
        const imageUrl = match[2];
        parts.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });

        lastIndex = matchIndex + match[0].length;
      }

      // Add remaining text after last image (if any)
      const remaining = content.slice(lastIndex).trim();
      if (remaining) {
        parts.push({ type: 'text', text: remaining });
      }

      return parts.length > 0 ? parts : content;
    }

    return content;
  }
  // Already an array or object, return as-is
  return content;
}

/**
 * Extract images from parsed content
 * Returns array of image URLs found in the content
 */
function extractImagesFromContent(content: string | any[]): string[] {
  if (typeof content === 'string') {
    return [];
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === 'image_url' && part.image_url?.url)
      .map((part) => part.image_url.url);
  }
  return [];
}

/**
 * Convert message history for agent/research mode
 * Key insight: OpenAI Responses API doesn't allow images in assistant messages
 * So we extract images from assistant messages and inject them into the user's prompt
 */
function prepareMessagesForAgent(
  history: Array<{ role: string; content: any }>,
  userPrompt: string,
): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];
  const collectedImages: string[] = [];

  for (const msg of history) {
    const parsedContent = parseMessageContent(msg.content);

    if (msg.role === 'assistant') {
      // Extract images from assistant messages for later injection
      const images = extractImagesFromContent(parsedContent);
      collectedImages.push(...images);

      // For assistant messages, only keep text content
      if (Array.isArray(parsedContent)) {
        const textParts = parsedContent.filter((p) => p.type === 'text');
        if (textParts.length > 0) {
          chatMessages.push({
            role: 'assistant',
            content: textParts.map((p) => p.text).join('\n'),
          });
        } else {
          // If only images, add placeholder
          chatMessages.push({
            role: 'assistant',
            content: '[Image was generated]',
          });
        }
      } else {
        chatMessages.push({ role: 'assistant', content: parsedContent });
      }
    } else {
      // User messages - keep as-is with images
      chatMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: parsedContent,
      });
    }
  }

  // Build final user message with collected images
  if (collectedImages.length > 0) {
    // Include images from assistant messages in the user prompt
    const userContent: any[] = [{ type: 'text', text: userPrompt }];
    for (const imageUrl of collectedImages) {
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      });
    }
    chatMessages.push({ role: 'user', content: userContent });
  } else {
    chatMessages.push({ role: 'user', content: userPrompt });
  }

  return chatMessages;
}

/**
 * Detect language from text
 */
type Language = 'tr' | 'fa' | 'en';

function detectLanguage(text: string): Language {
  const isTurkish =
    /[ğüşıöçĞÜŞİÖÇ]/.test(text) ||
    /\b(bir|ve|için|ile|bu|ne|nasıl|neden|kim|nerede|yap|et|ol|de|da|analiz|araştır|merhaba)\b/i.test(text);
  const isPersian = /[\u0600-\u06FF]/.test(text);

  if (isTurkish) return 'tr';
  if (isPersian) return 'fa';
  return 'en';
}

/**
 * i18n messages for research/agent/web modes
 */
const i18n = {
  tr: {
    searchingWeb: '🔍 **Web\'de aranıyor...**\n\n',
    sourcesFound: (n: number) => `📚 **${n} kaynak bulundu**\n\n`,
    searchError: '⚠️ Web araması başarısız. Mevcut bilgilerle devam...\n\n',
    deepAnalysis: '🧠 **Derin analiz yapılıyor...**\n\n---\n\n',
    source: (idx: number) => `**Kaynak ${idx}:**`,
    link: 'Link:',
  },
  fa: {
    searchingWeb: '🔍 **در حال جستجوی وب...**\n\n',
    sourcesFound: (n: number) => `📚 **${n} منبع یافت شد**\n\n`,
    searchError: '⚠️ خطا در جستجوی وب. ادامه با اطلاعات موجود...\n\n',
    deepAnalysis: '🧠 **در حال تحلیل عمیق...**\n\n---\n\n',
    source: (idx: number) => `**منبع ${idx}:**`,
    link: 'لینک:',
  },
  en: {
    searchingWeb: '🔍 **Searching the web...**\n\n',
    sourcesFound: (n: number) => `📚 **${n} sources found**\n\n`,
    searchError: '⚠️ Web search failed. Continuing with available info...\n\n',
    deepAnalysis: '🧠 **Performing deep analysis...**\n\n---\n\n',
    source: (idx: number) => `**Source ${idx}:**`,
    link: 'Link:',
  },
};

function getI18n(text: string) {
  return i18n[detectLanguage(text)];
}

@Injectable()
export class ChatResearchService {
  private readonly logger = new Logger(ChatResearchService.name);

  constructor(
    @Inject(DRIZZLE) private db: PostgresJsDatabase<typeof schema>,
    private openai: OpenAIAdapter,
    private search: SearchAdapter,
    private deepResearch: DeepResearchAdapter,
  ) {}

  /**
   * Start deep research session
   */
  async startDeepResearch(prompt: string, _sessionId?: string, _model?: string) {
    return this.deepResearch.startResearch(prompt);
  }

  /**
   * Get deep research status
   */
  async getDeepResearchStatus(id: string) {
    const session = this.deepResearch.getStatus(id);
    if (!session) {
      return { id, status: 'not_found' };
    }

    return {
      id: session.id,
      status: session.status,
      steps: session.steps,
      output_text: session.finalReport,
      progress: this.formatResearchProgress(session),
    };
  }

  /**
   * Save deep research messages to database
   */
  async saveDeepResearchMessages(
    sessionId: string,
    userId: number,
    userMessage: string,
    assistantMessage: string,
  ): Promise<{
    success: boolean;
    userMessageId?: number;
    assistantMessageId?: number;
  }> {
    try {
      // Save user message
      const userMsg = await this.db
        .insert(messages)
        .values({
          sessionId,
          role: 'user',
          content: userMessage,
        })
        .returning({ id: messages.id });

      // Save assistant message
      const assistantMsg = await this.db
        .insert(messages)
        .values({
          sessionId,
          role: 'assistant',
          content: assistantMessage,
        })
        .returning({ id: messages.id });

      this.logger.log(
        `[DeepResearch] Saved to DB - Session: ${sessionId}, User: ${userMsg[0]?.id}, Assistant: ${assistantMsg[0]?.id}`,
      );

      return {
        success: true,
        userMessageId: userMsg[0]?.id,
        assistantMessageId: assistantMsg[0]?.id,
      };
    } catch (error: unknown) {
      this.logger.error(`[DeepResearch] Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false };
    }
  }

  /**
   * Handle research mode - deep analysis with web search
   */
  async handleResearchMode(
    sessionId: string,
    _userId: number,
    query: string,
    onChunk: (chunk: string) => void,
    model: string,
    userMsgId: number,
  ): Promise<{
    sessionId: string;
    userMessageId: number;
    assistantMessageId?: number;
  }> {
    this.logger.log(`[Research Mode] Starting deep research for: ${query}`);

    // Detect language for i18n
    const msgs = getI18n(query);

    // 1. Web search
    let searchContext = '';
    try {
      onChunk(msgs.searchingWeb);

      const searchResult = await this.search.search(query);

      if (searchResult.type === 'results' && searchResult.results?.length > 0) {
        const topResults = searchResult.results.slice(0, 5);
        searchContext = topResults
          .map(
            (r: any, idx: number) =>
              `${msgs.source(idx + 1)} ${r.name}\n${r.snippet}\n${msgs.link} ${r.url}`,
          )
          .join('\n\n');

        onChunk(msgs.sourcesFound(topResults.length));
      }
    } catch (error) {
      this.logger.error('[Research Mode] Search error:', error);
      onChunk(msgs.searchError);
    }

    // 2. AI deep analysis
    onChunk(msgs.deepAnalysis);

    const researchPrompt = this.buildResearchPrompt(query, searchContext);
    const history = await this.getRecentMessages(sessionId);
    
    // ✅ FIX: Use prepareMessagesForAgent to properly handle images
    const chatMessages = prepareMessagesForAgent(history, researchPrompt);

    let fullResponse = '';
    await this.openai.streamChat(
      chatMessages,
      (chunk) => {
        fullResponse += chunk;
        onChunk(chunk);
      },
      model,
    );

    const [assistantMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'assistant',
        content: fullResponse,
        model,
      })
      .returning();

    await this.touchSession(sessionId);

    return {
      sessionId,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsg.id,
    };
  }

  /**
   * Handle agent mode - task execution
   */
  async handleAgentMode(
    sessionId: string,
    _userId: number,
    task: string,
    onChunk: (chunk: string) => void,
    model: string,
    userMsgId: number,
  ): Promise<{
    sessionId: string;
    userMessageId: number;
    assistantMessageId?: number;
  }> {
    this.logger.log(`[Agent Mode] Starting task execution for: ${task}`);

    const { activatedMsg, analyzingMsg, agentPrompt } = this.getAgentPrompt(task);

    onChunk(activatedMsg);
    onChunk(analyzingMsg);

    const history = await this.getRecentMessages(sessionId);
    
    // ✅ FIX: Use prepareMessagesForAgent to properly handle images
    // This extracts images from assistant messages and injects them into user prompt
    // because OpenAI Responses API doesn't support images in assistant messages
    const chatMessages = prepareMessagesForAgent(history, agentPrompt);

    let fullResponse = '';
    await this.openai.streamChat(
      chatMessages,
      (chunk) => {
        fullResponse += chunk;
        onChunk(chunk);
      },
      model,
    );

    const [assistantMsg] = await this.db
      .insert(messages)
      .values({
        sessionId,
        role: 'assistant',
        content: fullResponse,
        model,
      })
      .returning();

    await this.touchSession(sessionId);

    return {
      sessionId,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsg.id,
    };
  }

  /**
   * Handle web search mode
   */
  async handleWebMode(
    sessionId: string,
    query: string,
    onChunk: (chunk: string) => void,
    model: string,
  ): Promise<string> {
    this.logger.log(`[Web Mode] Starting web search for: ${query}`);

    // Detect language for i18n
    const msgs = getI18n(query);

    onChunk(msgs.searchingWeb);
    const searchResult = await this.search.search(query || '');

    if (searchResult.type === 'results' && searchResult.results.length > 0) {
      this.logger.log(
        `[Web Mode] Found ${searchResult.results.length} results, summarizing with AI`,
      );

      const searchContext = searchResult.results
        .map(
          (r: any, idx: number) =>
            `[${idx + 1}] **${r.name}**\nÖzet: ${r.snippet}\nLink: ${r.url}`,
        )
        .join('\n\n');

      const webPrompt = this.buildWebPrompt(query, searchContext);
      const history = await this.getRecentMessages(sessionId);
      
      // ✅ FIX: Use prepareMessagesForAgent to properly handle images
      // Note: We only use last 4 messages for web mode to keep context focused
      const limitedHistory = history.slice(-4);
      const chatMessages = prepareMessagesForAgent(limitedHistory, webPrompt);

      let fullResponse = '';
      await this.openai.streamChat(
        chatMessages,
        (chunk) => {
          fullResponse += chunk;
          onChunk(chunk);
        },
        model,
      );

      return msgs.searchingWeb + fullResponse;
    } else {
      // No results - use AI knowledge
      this.logger.log(`[Web Mode] No search results, using AI knowledge`);
      return this.handleNoSearchResults(sessionId, query, onChunk, model);
    }
  }

  // ============== Private Helper Methods ==============

  private formatResearchProgress(session: any): string {
    const completedSteps = session.steps.filter(
      (s: any) => s.status === 'completed',
    ).length;
    const currentStep = session.steps.find(
      (s: any) => s.status === 'in_progress',
    );

    if (currentStep) {
      return `${currentStep.title} (${completedSteps}/${session.steps.length})`;
    }

    if (session.status === 'completed') {
      return 'Araştırma tamamlandı!';
    }

    if (session.status === 'failed') {
      return 'Araştırma başarısız oldu';
    }

    return `İşleniyor... (${completedSteps}/${session.steps.length})`;
  }

  private buildResearchPrompt(query: string, searchContext: string): string {
    return `شما یک محقق متخصص هستید. یک گزارش تحقیقاتی جامع و دقیق در مورد موضوع زیر تهیه کنید.

**سوال/موضوع:** ${query}

${searchContext ? `**اطلاعات جمع‌آوری شده از وب:**\n${searchContext}\n\n` : ''}

**لطفاً گزارش خود را با ساختار زیر ارائه دهید:**
1. **خلاصه اجرایی** - یک پاراگراف مختصر
2. **تحلیل عمیق** - بررسی جزئیات و نکات کلیدی
3. **یافته‌های اصلی** - نکات مهم به صورت لیست
4. **نتیجه‌گیری** - جمع‌بندی نهایی
${searchContext ? '5. **منابع** - لیست منابع استفاده شده' : ''}

از فرمت Markdown استفاده کنید. پاسخ باید جامع، دقیق و مستند باشد.`;
  }

  private buildWebPrompt(query: string, searchContext: string): string {
    return `Sen bir web araştırma asistanısın. Kullanıcının sorusu: "${query}"

Aşağıdaki web arama sonuçlarını kullanarak TÜRKÇE cevap ver:

${searchContext}

ÖNEMLİ KURALLAR:
1. Cevabını düzgün paragraflar halinde yaz
2. Linkleri MUTLAKA şu markdown formatında ver: [Site Adı](https://url.com)
3. Her kaynağı cümle içinde doğal bir şekilde linkle
4. Özet bilgi ver, sonra kaynaklara link at
5. Fazla teknik detaya girme, kullanıcı dostu ol

Örnek format:
"Son dakika haberlerine göre... Detaylı bilgi için [TRT Haber](https://www.trthaber.com) ve [Habertürk](https://www.haberturk.com) sitelerini ziyaret edebilirsiniz."`;
  }

  private getAgentPrompt(task: string): {
    activatedMsg: string;
    analyzingMsg: string;
    agentPrompt: string;
  } {
    const lang = detectLanguage(task);

    const agentI18n = {
      tr: {
        activatedMsg: '🤖 **Agent Modu Aktif**\n\n',
        analyzingMsg: '📋 **Görev analiz ediliyor...**\n\n',
        getPrompt: () => this.getTurkishAgentPrompt(task),
      },
      fa: {
        activatedMsg: '🤖 **حالت ایجنت فعال شد**\n\n',
        analyzingMsg: '📋 **در حال تحلیل وظیفه...**\n\n',
        getPrompt: () => this.getPersianAgentPrompt(task),
      },
      en: {
        activatedMsg: '🤖 **Agent Mode Activated**\n\n',
        analyzingMsg: '📋 **Analyzing task...**\n\n',
        getPrompt: () => this.getEnglishAgentPrompt(task),
      },
    };

    const msgs = agentI18n[lang];
    return {
      activatedMsg: msgs.activatedMsg,
      analyzingMsg: msgs.analyzingMsg,
      agentPrompt: msgs.getPrompt(),
    };
  }

  private getPersianAgentPrompt(task: string): string {
    return `شما یک ایجنت هوشمند هستید که می‌توانید وظایف پیچیده را به مراحل کوچک‌تر تقسیم کرده و آنها را اجرا کنید.

**وظیفه درخواستی:** ${task}

**لطفاً با ساختار زیر پاسخ دهید:**

## 📌 تحلیل وظیفه
توضیح مختصر در مورد وظیفه و اهداف آن

## 📋 برنامه اجرایی
### مرحله 1: [عنوان]
- جزئیات اجرا
- خروجی مورد انتظار

### مرحله 2: [عنوان]
- جزئیات اجرا
- خروجی مورد انتظار

(و به همین ترتیب...)

## ⚡ اجرای مراحل
اجرای مرحله به مرحله وظیفه با توضیحات

## ✅ نتیجه نهایی
خلاصه کار انجام شده و خروجی نهایی

---
*توجه: من یک ایجنت AI هستم و فقط می‌توانم وظایف متنی و تحلیلی را انجام دهم.*`;
  }

  private getTurkishAgentPrompt(task: string): string {
    return `Sen karmaşık görevleri küçük adımlara bölebilen ve bunları yürütebilen akıllı bir ajansın.

**İstenen görev:** ${task}

**Lütfen aşağıdaki yapıyla yanıt ver:**

## 📌 Görev Analizi
Görev ve hedefleri hakkında kısa açıklama

## 📋 Yürütme Planı
### Adım 1: [Başlık]
- Uygulama detayları
- Beklenen çıktı

### Adım 2: [Başlık]
- Uygulama detayları
- Beklenen çıktı

(ve devamı...)

## ⚡ Adımların Yürütülmesi
Görevin adım adım yürütülmesi ve açıklamalar

## ✅ Sonuç
Yapılan işin özeti ve nihai çıktı

---
*Not: Ben bir AI ajanıyım ve sadece metin tabanlı ve analitik görevleri yapabilirim.*`;
  }

  private getEnglishAgentPrompt(task: string): string {
    return `You are an intelligent agent that can break down complex tasks into smaller steps and execute them.

**Requested task:** ${task}

**Please respond with the following structure:**

## 📌 Task Analysis
Brief explanation of the task and its objectives

## 📋 Execution Plan
### Step 1: [Title]
- Implementation details
- Expected output

### Step 2: [Title]
- Implementation details
- Expected output

(and so on...)

## ⚡ Step Execution
Step-by-step execution of the task with explanations

## ✅ Final Result
Summary of the work done and final output

---
*Note: I am an AI agent and can only perform text-based and analytical tasks.*`;
  }

  private async handleNoSearchResults(
    sessionId: string,
    query: string,
    onChunk: (chunk: string) => void,
    model: string,
  ): Promise<string> {
    const msgs = getI18n(query);
    const lang = detectLanguage(query);
    
    const prompts = {
      tr: `Kullanıcının sorusu: "${query}"

Web araması yapılamadı ama bilgilerinle yardımcı ol. TÜRKÇE cevap ver.
Eğer güncel bilgi gerektiren bir soruysa, kullanıcıya ilgili siteleri önererek markdown formatında linkle:
Örnek: "Güncel haberler için [TRT Haber](https://www.trthaber.com) sitesini ziyaret edebilirsiniz."`,
      fa: `سوال کاربر: "${query}"

جستجوی وب امکان‌پذیر نبود اما با اطلاعات خود کمک کن. به فارسی پاسخ بده.
اگر سوال نیاز به اطلاعات به‌روز دارد، سایت‌های مرتبط را با فرمت markdown پیشنهاد بده.`,
      en: `User's question: "${query}"

Web search was not possible but help with your knowledge. Answer in ENGLISH.
If the question requires current information, suggest relevant sites with markdown format links.`,
    };

    const webPrompt = prompts[lang];

    const history = await this.getRecentMessages(sessionId);
    const chatMessages: ChatMessage[] = [
      ...history.slice(-4).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
      })),
      { role: 'user' as const, content: webPrompt },
    ];

    let fullResponse = '';
    await this.openai.streamChat(
      chatMessages,
      (chunk) => {
        fullResponse += chunk;
        onChunk(chunk);
      },
      model,
    );

    return msgs.searchingWeb + fullResponse;
  }

  private async getRecentMessages(sessionId: string, limit: number = 20) {
    const history = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return history.reverse();
  }

  private async touchSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }
}
