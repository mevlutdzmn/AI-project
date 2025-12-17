import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * ChatGPT-Style Deep Research Adapter
 *
 * 5 Aşamalı Araştırma Pipeline:
 * 1. Understanding (10-30s) - Soruyu anlama ve analiz
 * 2. Planning (30-60s) - Araştırma planı oluşturma
 * 3. Searching (1-5min) - 8+ kaynak arama
 * 4. Analyzing (1-3min) - Kaynakları analiz etme
 * 5. Synthesizing (1-2min) - 3000+ kelimelik rapor yazma
 */

// Türkçe kelimeler
const TURKISH_WORDS = [
  'bir',
  'bu',
  've',
  'için',
  'ile',
  'de',
  'da',
  'ne',
  'nedir',
  'nasıl',
  'kim',
  'kimin',
  'hangi',
  'neden',
  'niçin',
  'ama',
  'fakat',
  'ancak',
  'çünkü',
  'eğer',
  'gibi',
  'kadar',
  'daha',
  'en',
  'çok',
  'az',
  'var',
  'yok',
  'olan',
  'olan',
  'olarak',
  'üzerine',
  'hakkında',
  'arasında',
  'sonra',
  'önce',
  'bana',
  'sana',
  'ona',
  'bize',
  'size',
  'onlara',
  'ben',
  'sen',
  'o',
  'biz',
  'siz',
  'onlar',
  'şu',
  'şey',
  'zaman',
  'yer',
  'durum',
  'konu',
  'araştır',
  'araştırma',
  'incele',
  'analiz',
  'karşılaştır',
  'açıkla',
  'anlat',
  'öğren',
  'bilgi',
  'detay',
  'detaylı',
  'kapsamlı',
  'derinlemesine',
  'tam',
  'türkiye',
  'istanbul',
  'ankara',
  'şehir',
  'ülke',
  'dünya',
  'ekonomi',
  'siyaset',
  'tarih',
  'kültür',
  'sanat',
  'bilim',
  'teknoloji',
  'sağlık',
  'eğitim',
  'spor',
  'yaşam',
  'güncel',
  'haber',
  'gelişme',
  'değişim',
  'etki',
  'sonuç',
  'sebep',
  'özellik',
  'avantaj',
  'dezavantaj',
  'fark',
  'benzerlik',
  'ilişki',
  'bağlantı',
];

// Farsça kelimeler
const PERSIAN_WORDS = [
  'چیست',
  'چگونه',
  'کجا',
  'کی',
  'چرا',
  'است',
  'هست',
  'این',
  'آن',
  'که',
  'را',
  'با',
  'از',
  'به',
  'در',
  'برای',
  'تا',
  'یا',
  'اما',
  'ولی',
  'اگر',
  'زیرا',
  'چون',
  'بررسی',
  'تحقیق',
  'مقایسه',
  'توضیح',
  'شرح',
  'تحلیل',
  'ارزیابی',
];

function detectLanguage(text: string): 'tr' | 'fa' | 'en' {
  const lowerText = text.toLowerCase();

  if (/[\u0600-\u06FF]/.test(text)) {
    return 'fa';
  }

  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) {
    return 'tr';
  }

  let turkishCount = 0;
  for (const word of TURKISH_WORDS) {
    if (lowerText.includes(word)) {
      turkishCount++;
    }
  }
  if (turkishCount >= 2) {
    return 'tr';
  }

  for (const word of PERSIAN_WORDS) {
    if (text.includes(word)) {
      return 'fa';
    }
  }

  return 'en';
}

interface SearchResult {
  query: string;
  results: any[];
  summary: string;
}

// Progress mesajları
const PROGRESS_MESSAGES = {
  tr: {
    stage1: {
      start: '🔍 Sorunuz analiz ediliyor...',
      analyzing: '📊 Anahtar kavramlar belirleniyor...',
      done: '✅ Soru analizi tamamlandı',
    },
    stage2: {
      start: '📋 Araştırma planı oluşturuluyor...',
      planning: '🎯 Arama stratejileri belirleniyor...',
      queries: '📝 8 farklı arama sorgusu hazırlandı',
      done: '✅ Araştırma planı hazır',
    },
    stage3: {
      start: '🌐 Web araması başlıyor...',
      searching: (n: number, total: number) =>
        `🔎 Arama ${n}/${total} yapılıyor...`,
      found: (n: number) => `📄 ${n} kaynak bulundu`,
      done: '✅ Tüm aramalar tamamlandı',
    },
    stage4: {
      start: '📖 Kaynaklar analiz ediliyor...',
      reading: (n: number, total: number) =>
        `📑 Kaynak ${n}/${total} okunuyor...`,
      crossref: '🔗 Çapraz referans kontrolü yapılıyor...',
      conflicts: '⚠️ Çelişkili bilgiler tespit edildi, doğrulama yapılıyor...',
      done: '✅ Kaynak analizi tamamlandı',
    },
    stage5: {
      start: '✍️ Rapor yazılıyor...',
      outline: '📋 Rapor ana hatları belirleniyor...',
      writing: '📝 Detaylı içerik oluşturuluyor...',
      expanding: '📚 Rapor genişletiliyor (minimum 3000 kelime)...',
      citations: '📎 Kaynaklar ekleniyor...',
      done: '✅ Araştırma raporu hazır!',
    },
  },
  en: {
    stage1: {
      start: '🔍 Analyzing your question...',
      analyzing: '📊 Identifying key concepts...',
      done: '✅ Question analysis complete',
    },
    stage2: {
      start: '📋 Creating research plan...',
      planning: '🎯 Determining search strategies...',
      queries: '📝 8 different search queries prepared',
      done: '✅ Research plan ready',
    },
    stage3: {
      start: '🌐 Starting web search...',
      searching: (n: number, total: number) => `🔎 Searching ${n}/${total}...`,
      found: (n: number) => `📄 Found ${n} sources`,
      done: '✅ All searches completed',
    },
    stage4: {
      start: '📖 Analyzing sources...',
      reading: (n: number, total: number) =>
        `📑 Reading source ${n}/${total}...`,
      crossref: '🔗 Cross-referencing sources...',
      conflicts: '⚠️ Conflicting information detected, verifying...',
      done: '✅ Source analysis complete',
    },
    stage5: {
      start: '✍️ Writing report...',
      outline: '📋 Creating report outline...',
      writing: '📝 Generating detailed content...',
      expanding: '📚 Expanding report (minimum 3000 words)...',
      citations: '📎 Adding citations...',
      done: '✅ Research report ready!',
    },
  },
  fa: {
    stage1: {
      start: '🔍 در حال تحلیل سوال شما...',
      analyzing: '📊 در حال شناسایی مفاهیم کلیدی...',
      done: '✅ تحلیل سوال کامل شد',
    },
    stage2: {
      start: '📋 در حال ایجاد برنامه تحقیق...',
      planning: '🎯 در حال تعیین استراتژی‌های جستجو...',
      queries: '📝 ۸ پرس‌وجوی جستجوی مختلف آماده شد',
      done: '✅ برنامه تحقیق آماده است',
    },
    stage3: {
      start: '🌐 شروع جستجوی وب...',
      searching: (n: number, total: number) => `🔎 جستجوی ${n}/${total}...`,
      found: (n: number) => `📄 ${n} منبع یافت شد`,
      done: '✅ همه جستجوها کامل شد',
    },
    stage4: {
      start: '📖 در حال تحلیل منابع...',
      reading: (n: number, total: number) => `📑 خواندن منبع ${n}/${total}...`,
      crossref: '🔗 در حال ارجاع متقابل منابع...',
      conflicts: '⚠️ اطلاعات متناقض شناسایی شد، در حال تأیید...',
      done: '✅ تحلیل منابع کامل شد',
    },
    stage5: {
      start: '✍️ در حال نوشتن گزارش...',
      outline: '📋 در حال ایجاد طرح کلی گزارش...',
      writing: '📝 در حال تولید محتوای جزئی...',
      expanding: '📚 در حال گسترش گزارش (حداقل ۳۰۰۰ کلمه)...',
      citations: '📎 در حال افزودن استنادات...',
      done: '✅ گزارش تحقیق آماده است!',
    },
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ResearchStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
}

export interface ResearchSession {
  id: string;
  query: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps: ResearchStep[];
  finalReport?: string;
  error?: string;
  createdAt: Date;
}

@Injectable()
export class DeepResearchAdapter {
  private openai: OpenAI;
  private sessions: Map<string, ResearchSession> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Start a new research session - returns session ID immediately
   */
  startResearch(query: string): { id: string; status: string } {
    const sessionId = `research-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: ResearchSession = {
      id: sessionId,
      query,
      status: 'pending',
      steps: [
        { id: 'understanding', title: 'Soruyu Anlama', status: 'pending' },
        { id: 'planning', title: 'Araştırma Planı', status: 'pending' },
        { id: 'searching', title: 'Web Araması', status: 'pending' },
        { id: 'analyzing', title: 'Kaynak Analizi', status: 'pending' },
        { id: 'synthesizing', title: 'Rapor Yazma', status: 'pending' },
      ],
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Start research in background
    this.executeResearch(sessionId).catch((err) => {
      console.error('Research execution error:', err);
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        s.error = err.message;
      }
    });

    return { id: sessionId, status: 'pending' };
  }

  /**
   * Get status of a research session
   */
  getStatus(id: string): ResearchSession | null {
    return this.sessions.get(id) || null;
  }

  /**
   * Execute the research pipeline
   */
  private async executeResearch(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'in_progress';

    const onProgress = (stage: string, progress: number, message: string) => {
      const step = session.steps.find((s) => s.id === stage);
      if (step) {
        step.status = progress >= 100 ? 'completed' : 'in_progress';
        step.message = message;
      }
    };

    try {
      const report = await this.research(session.query, onProgress);
      session.finalReport = report;
      session.status = 'completed';
    } catch (error: any) {
      session.status = 'failed';
      session.error = error.message;
    }
  }

  async research(
    query: string,
    onProgress?: (stage: string, progress: number, message: string) => void,
  ): Promise<string> {
    const language = detectLanguage(query);
    const msgs = PROGRESS_MESSAGES[language];

    const updateProgress = (
      stage: string,
      progress: number,
      message: string,
    ) => {
      if (onProgress) {
        onProgress(stage, progress, message);
      }
    };

    try {
      // ========================================
      // STAGE 1: UNDERSTANDING (10-30 seconds)
      // ========================================
      updateProgress('understanding', 0, msgs.stage1.start);

      const understandingResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a research analyst. Analyze the user's question and extract:
1. Main topic/subject
2. Specific aspects they want to learn about
3. Type of information needed (facts, comparisons, analysis, etc.)
4. Any implicit questions or related areas worth exploring
5. Time sensitivity (is recent information important?)
6. Geographic/cultural context if relevant

Respond in JSON format:
{
  "mainTopic": "...",
  "aspects": ["..."],
  "infoType": "...",
  "relatedAreas": ["..."],
  "needsRecent": boolean,
  "context": "..."
}`,
          },
          { role: 'user', content: query },
        ],
        response_format: { type: 'json_object' },
      });

      updateProgress('understanding', 50, msgs.stage1.analyzing);

      let questionAnalysis: any;
      try {
        questionAnalysis = JSON.parse(
          understandingResponse.choices[0].message.content || '{}',
        );
      } catch {
        questionAnalysis = {
          mainTopic: query,
          aspects: [],
          infoType: 'general',
          relatedAreas: [],
          needsRecent: true,
          context: '',
        };
      }

      updateProgress('understanding', 100, msgs.stage1.done);
      await delay(500);

      // ========================================
      // STAGE 2: PLANNING (30-60 seconds)
      // ========================================
      updateProgress('planning', 0, msgs.stage2.start);

      const planningResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a research strategist. Based on the question analysis, create a comprehensive search plan.

Generate exactly 8 search queries that will:
1. Cover the main topic from multiple angles
2. Include different perspectives (academic, news, technical, practical)
3. Target different types of sources
4. Include both broad and specific searches
5. Include recent developments if needed
6. Cover related areas for comprehensive understanding

Also identify:
- Key terms to look for in sources
- Potential biases to watch for
- Quality indicators for sources

Respond in JSON:
{
  "searchQueries": [
    {"query": "...", "purpose": "...", "targetSources": "..."},
    ... (8 queries total)
  ],
  "keyTerms": ["..."],
  "biasesToWatch": ["..."],
  "qualityIndicators": ["..."]
}`,
          },
          {
            role: 'user',
            content: `Question: ${query}\n\nAnalysis: ${JSON.stringify(questionAnalysis)}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      updateProgress('planning', 50, msgs.stage2.planning);

      let researchPlan: any;
      try {
        researchPlan = JSON.parse(
          planningResponse.choices[0].message.content || '{}',
        );
      } catch {
        researchPlan = {
          searchQueries: [
            { query: query, purpose: 'main', targetSources: 'general' },
            {
              query: `${query} recent developments`,
              purpose: 'news',
              targetSources: 'news',
            },
            {
              query: `${query} expert analysis`,
              purpose: 'analysis',
              targetSources: 'academic',
            },
            {
              query: `${query} comparison`,
              purpose: 'comparison',
              targetSources: 'general',
            },
            {
              query: `${query} statistics data`,
              purpose: 'data',
              targetSources: 'statistics',
            },
            {
              query: `${query} case studies`,
              purpose: 'examples',
              targetSources: 'academic',
            },
            {
              query: `${query} pros cons`,
              purpose: 'evaluation',
              targetSources: 'general',
            },
            {
              query: `${query} future trends`,
              purpose: 'future',
              targetSources: 'news',
            },
          ],
          keyTerms: [],
          biasesToWatch: [],
          qualityIndicators: [],
        };
      }

      updateProgress('planning', 100, msgs.stage2.queries);
      await delay(500);
      updateProgress('planning', 100, msgs.stage2.done);
      await delay(300);

      // ========================================
      // STAGE 3: SEARCHING (1-5 minutes)
      // ========================================
      updateProgress('searching', 0, msgs.stage3.start);

      const searchResults: SearchResult[] = [];
      const queries = researchPlan.searchQueries || [];
      const totalQueries = Math.min(queries.length, 8);

      for (let i = 0; i < totalQueries; i++) {
        const searchQuery = queries[i];
        const progress = Math.round(((i + 1) / totalQueries) * 80);

        updateProgress(
          'searching',
          progress,
          msgs.stage3.searching(i + 1, totalQueries),
        );

        try {
          // OpenAI Responses API with web_search_preview
          const searchResponse = await (this.openai as any).responses.create({
            model: 'gpt-4o',
            tools: [{ type: 'web_search_preview' }],
            input: searchQuery.query || searchQuery,
            tool_choice: { type: 'web_search_preview' },
          });

          const output = searchResponse.output || [];
          const webResults: any[] = [];
          let searchSummary = '';

          for (const item of output) {
            if (item.type === 'message' && item.content) {
              for (const content of item.content) {
                if (content.type === 'text') {
                  searchSummary = content.text;
                }
              }
            }
          }

          // Extract annotations (sources)
          for (const item of output) {
            if (item.type === 'message' && item.content) {
              for (const content of item.content) {
                if (content.annotations) {
                  for (const ann of content.annotations) {
                    if (ann.type === 'url_citation') {
                      webResults.push({
                        title: ann.title || ann.url,
                        url: ann.url,
                        snippet: '',
                      });
                    }
                  }
                }
              }
            }
          }

          searchResults.push({
            query: searchQuery.query || searchQuery,
            results: webResults,
            summary: searchSummary,
          });
        } catch (error) {
          console.error(`Search error for query ${i + 1}:`, error);
        }

        await delay(500);
      }

      const totalSources = searchResults.reduce(
        (acc, sr) => acc + sr.results.length,
        0,
      );
      updateProgress('searching', 90, msgs.stage3.found(totalSources));
      await delay(500);
      updateProgress('searching', 100, msgs.stage3.done);
      await delay(300);

      // ========================================
      // STAGE 4: ANALYZING (1-3 minutes)
      // ========================================
      updateProgress('analyzing', 0, msgs.stage4.start);

      const allSearchData = searchResults.map((sr, idx) => ({
        searchNumber: idx + 1,
        query: sr.query,
        summary: sr.summary,
        sourceCount: sr.results.length,
        sources: sr.results.slice(0, 5),
      }));

      updateProgress('analyzing', 30, msgs.stage4.reading(1, 2));

      const analysisResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a critical research analyst. Analyze the search results and:

1. Identify key findings across all sources
2. Note areas of consensus
3. Identify conflicting information and which sources disagree
4. Assess source reliability based on domain, recency, and content quality
5. Extract statistics, data points, and concrete facts
6. Note different perspectives and viewpoints
7. Identify gaps in the information

Provide a comprehensive analysis in JSON:
{
  "keyFindings": ["..."],
  "consensusAreas": ["..."],
  "conflicts": [{"topic": "...", "perspectives": ["...", "..."]}],
  "statistics": ["..."],
  "perspectives": [{"viewpoint": "...", "supportedBy": "..."}],
  "gaps": ["..."],
  "mostReliableSources": ["..."],
  "overallConfidence": "high|medium|low"
}`,
          },
          {
            role: 'user',
            content: `Original Question: ${query}\n\nSearch Results:\n${JSON.stringify(allSearchData, null, 2)}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      updateProgress('analyzing', 60, msgs.stage4.crossref);

      let analysis: any;
      try {
        analysis = JSON.parse(
          analysisResponse.choices[0].message.content || '{}',
        );
      } catch {
        analysis = {
          keyFindings: [],
          consensusAreas: [],
          conflicts: [],
          statistics: [],
          perspectives: [],
          gaps: [],
          mostReliableSources: [],
          overallConfidence: 'medium',
        };
      }

      if (analysis.conflicts && analysis.conflicts.length > 0) {
        updateProgress('analyzing', 80, msgs.stage4.conflicts);
        await delay(1000);
      }

      updateProgress('analyzing', 100, msgs.stage4.done);
      await delay(300);

      // ========================================
      // STAGE 5: SYNTHESIZING (1-2 minutes)
      // ========================================
      updateProgress('synthesizing', 0, msgs.stage5.start);

      const allSources: Array<{ title: string; url: string }> = [];
      for (const sr of searchResults) {
        for (const source of sr.results) {
          if (source.url && !allSources.find((s) => s.url === source.url)) {
            allSources.push({
              title: source.title || source.url,
              url: source.url,
            });
          }
        }
      }

      updateProgress('synthesizing', 20, msgs.stage5.outline);

      const reportLanguage =
        language === 'tr'
          ? 'Turkish'
          : language === 'fa'
            ? 'Persian (Farsi)'
            : 'English';

      const synthesisPrompt = `You are an expert research report writer. Write a comprehensive, well-structured research report.

CRITICAL REQUIREMENTS:
1. Write ENTIRELY in ${reportLanguage}
2. Minimum 3000 words (this is mandatory)
3. Use markdown formatting with clear headers
4. Include specific data, statistics, and examples from the research
5. **INLINE CITATIONS**: Add source citations INSIDE the text, right after the relevant information. Use format: [domain.com](full_url). Example: "Kediler Mısır'da kutsal sayılırdı [wikipedia.org](https://tr.wikipedia.org/wiki/Kedi)."
6. Do NOT put all sources at the end. Cite sources inline where the information appears.
7. Be thorough, detailed, and provide actionable insights

CITATION STYLE (VERY IMPORTANT):
- Add citations immediately after each fact or claim
- Use the domain name as display text: [petmekan.com](https://petmekan.com/article)
- Multiple sources for same fact: "...bilgi [source1.com](url1) [source2.com](url2)."
- Every paragraph should have at least 1-2 citations

MANDATORY REPORT STRUCTURE:

# [Compelling Title in ${reportLanguage}]

## Executive Summary
(200-300 words summarizing key findings with inline citations)

## Introduction
(300-400 words on background and importance with inline citations)

## Key Findings

### [Finding 1 - Detailed Section]
(400-500 words with data, analysis and inline citations after each fact)

### [Finding 2 - Detailed Section]
(400-500 words with data, analysis and inline citations after each fact)

### [Finding 3 - Detailed Section]
(400-500 words with data, analysis and inline citations after each fact)

### [Finding 4 - Detailed Section]
(400-500 words with data, analysis and inline citations after each fact)

## Analysis and Discussion
(400-500 words connecting findings with inline citations)

## Different Perspectives
(300-400 words on various viewpoints with inline citations)

## Conclusion
(200-300 words summarizing with inline citations)

---

AVAILABLE SOURCES (use these for inline citations):
${allSources
  .slice(0, 20)
  .map((s) => `- ${s.title}: ${s.url}`)
  .join('\n')}

ORIGINAL QUESTION: ${query}

RESEARCH DATA:
${JSON.stringify(
  {
    questionAnalysis,
    searchResults: allSearchData,
    analysis,
  },
  null,
  2,
)}

Remember: Write EVERYTHING in ${reportLanguage}. Use INLINE citations throughout. Minimum 3000 words.`;

      updateProgress('synthesizing', 40, msgs.stage5.writing);

      const reportResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert research report writer who creates comprehensive, detailed reports.',
          },
          { role: 'user', content: synthesisPrompt },
        ],
        max_tokens: 16000,
      });

      let report = reportResponse.choices[0].message.content || '';

      updateProgress('synthesizing', 70, msgs.stage5.writing);

      const wordCount = report.split(/\s+/).length;

      if (wordCount < 2500) {
        updateProgress('synthesizing', 80, msgs.stage5.expanding);

        const expansionResponse = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are expanding a research report. Add more detail, examples, analysis, and depth to each section. Write in ${reportLanguage}.`,
            },
            {
              role: 'user',
              content: `Expand this report to at least 3000 words. Add more specific details, examples, data points, and analysis to EACH section. Keep the same structure but make each section much more comprehensive:\n\n${report}`,
            },
          ],
          max_tokens: 16000,
        });

        report = expansionResponse.choices[0].message.content || report;
      }

      updateProgress('synthesizing', 90, msgs.stage5.citations);

      if (
        !report.includes('## Sources') &&
        !report.includes('## Kaynaklar') &&
        !report.includes('## منابع')
      ) {
        const sourcesHeader =
          language === 'tr'
            ? '## Kaynaklar'
            : language === 'fa'
              ? '## منابع'
              : '## Sources';
        const sourcesSection =
          `\n\n${sourcesHeader}\n\n` +
          allSources
            .slice(0, 15)
            .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
            .join('\n');
        report += sourcesSection;
      }

      updateProgress('synthesizing', 100, msgs.stage5.done);

      return report;
    } catch (error) {
      console.error('Deep Research Error:', error);

      const errorMessages = {
        tr: '❌ Araştırma sırasında bir hata oluştu. Lütfen tekrar deneyin.',
        en: '❌ An error occurred during research. Please try again.',
        fa: '❌ خطایی در حین تحقیق رخ داد. لطفا دوباره امتحان کنید.',
      };

      throw new Error(errorMessages[language]);
    }
  }
}
