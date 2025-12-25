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
  async startDeepResearch(prompt: string, sessionId?: string, model?: string) {
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
    userId: number,
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

    // 1. Web search
    let searchContext = '';
    try {
      onChunk('🔍 **در حال جستجوی وب...**\n\n');

      const searchResult = await this.search.search(query);

      if (searchResult.type === 'results' && searchResult.results?.length > 0) {
        const topResults = searchResult.results.slice(0, 5);
        searchContext = topResults
          .map(
            (r: any, idx: number) =>
              `**منبع ${idx + 1}:** ${r.name}\n${r.snippet}\nلینک: ${r.url}`,
          )
          .join('\n\n');

        onChunk(`📚 **${topResults.length} منبع یافت شد**\n\n`);
      }
    } catch (error) {
      this.logger.error('[Research Mode] Search error:', error);
      onChunk('⚠️ خطا در جستجوی وب. در حال ادامه با اطلاعات موجود...\n\n');
    }

    // 2. AI deep analysis
    onChunk('🧠 **در حال تحلیل عمیق...**\n\n---\n\n');

    const researchPrompt = this.buildResearchPrompt(query, searchContext);
    const history = await this.getRecentMessages(sessionId);
    
    const chatMessages: ChatMessage[] = [
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
      })),
      { role: 'user' as const, content: researchPrompt },
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
    userId: number,
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
    const chatMessages: ChatMessage[] = [
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
      })),
      { role: 'user' as const, content: agentPrompt },
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

    onChunk('🔍 **در حال جستجو در وب...**\n\n');
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

      return '🔍 **در حال جستجو در وب...**\n\n' + fullResponse;
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
    const isTurkish =
      /[ğüşıöçĞÜŞİÖÇ]/.test(task) ||
      /\b(bir|ve|için|ile|bu|ne|nasıl|neden|kim|nerede|yap|et|ol|de|da)\b/i.test(task);
    const isPersian = /[\u0600-\u06FF]/.test(task);

    if (isPersian) {
      return {
        activatedMsg: '🤖 **حالت ایجنت فعال شد**\n\n',
        analyzingMsg: '📋 **در حال تحلیل وظیفه...**\n\n',
        agentPrompt: this.getPersianAgentPrompt(task),
      };
    } else if (isTurkish) {
      return {
        activatedMsg: '🤖 **Agent Modu Aktif**\n\n',
        analyzingMsg: '📋 **Görev analiz ediliyor...**\n\n',
        agentPrompt: this.getTurkishAgentPrompt(task),
      };
    } else {
      return {
        activatedMsg: '🤖 **Agent Mode Activated**\n\n',
        analyzingMsg: '📋 **Analyzing task...**\n\n',
        agentPrompt: this.getEnglishAgentPrompt(task),
      };
    }
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
    const webPrompt = `Kullanıcının sorusu: "${query}"

Web araması yapılamadı ama bilgilerinle yardımcı ol. TÜRKÇE cevap ver.
Eğer güncel bilgi gerektiren bir soruysa, kullanıcıya ilgili siteleri önererek markdown formatında linkle:
Örnek: "Güncel haberler için [TRT Haber](https://www.trthaber.com) sitesini ziyaret edebilirsiniz."`;

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

    return '🔍 **در حال جستجو در وب...**\n\n' + fullResponse;
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
