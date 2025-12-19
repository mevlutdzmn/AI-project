/**
 * Chat PDF Service
 * 
 * Handles PDF file processing in chat:
 * - PDF text extraction
 * - Table structure preservation
 * - Message content processing
 * 
 * @module chat/services/chat-pdf.service
 * @description Single Responsibility: Only handles PDF operations
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ChatPdfService {
  private readonly logger = new Logger(ChatPdfService.name);

  /**
   * Extract text from PDF base64 data
   * Preserves table structure and layout
   */
  async extractPdfText(base64Data: string): Promise<string> {
    try {
      // Remove data URI prefix
      const base64Clean = base64Data.replace(
        /^data:application\/pdf;base64,/,
        '',
      );
      const buffer = Buffer.from(base64Clean, 'base64');

      // pdf-parse v1.x - simple function call
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');

      // Custom render function - preserves page layout
      const renderPage = (pageData: any) => {
        const renderOptions = {
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        };
        return pageData
          .getTextContent(renderOptions)
          .then((textContent: any) => {
            let lastY: number | null = null;
            let text = '';

            for (const item of textContent.items) {
              if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
                // New line - Y position changed
                text += '\n';
              } else if (lastY !== null) {
                // Same line - tab separator
                text += '\t';
              }
              text += item.str;
              lastY = item.transform[5];
            }
            return text;
          });
      };

      const data = await pdfParse(buffer, { pagerender: renderPage });

      // Clean and format extracted text
      const cleanedText = data.text
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .join('\n');

      this.logger.log(
        `[PDF] Extracted ${cleanedText.length} characters from PDF`,
      );
      return cleanedText;
    } catch (error) {
      this.logger.error('[PDF] Error extracting text:', error);
      return '[PDF içeriği okunamadı]';
    }
  }

  /**
   * Process message content - separate display and AI content
   * Display content: Shows file name reference only
   * AI content: Contains full PDF text for analysis
   * 
   * @returns { displayContent: for database, aiContent: for AI with PDF text }
   */
  async processMessageContent(
    message: any,
  ): Promise<{ displayContent: string | any[]; aiContent: string | any[] }> {
    this.logger.log(
      `[processMessageContent] Input type: ${typeof message}, isArray: ${Array.isArray(message)}`,
    );

    if (typeof message === 'string') {
      return { displayContent: message, aiContent: message };
    }

    if (Array.isArray(message)) {
      this.logger.log(
        `[processMessageContent] Array length: ${message.length}`,
      );
      const displayParts: any[] = [];
      const aiParts: any[] = [];
      let pdfText = '';
      let pdfFileName = '';

      for (const part of message) {
        this.logger.log(
          `[processMessageContent] Processing part type: ${part.type}`,
        );

        if (part.type === 'pdf' && part.pdf_data?.url) {
          // Extract text from PDF - for AI only
          this.logger.log(
            `[processMessageContent] Found PDF: ${part.pdf_data.name}`,
          );
          const extractedText = await this.extractPdfText(part.pdf_data.url);
          this.logger.log(
            `[processMessageContent] PDF extracted text length: ${extractedText.length}`,
          );
          pdfText = `\n\n[PDF Dosyası: ${part.pdf_data.name || 'document.pdf'}]\n\`\`\`\n${extractedText}\n\`\`\``;
          pdfFileName = part.pdf_data.name || 'document.pdf';
        } else if (part.type === 'text') {
          displayParts.push(part);
          aiParts.push({ ...part }); // Clone for AI
        } else if (part.type === 'image_url') {
          displayParts.push(part);
          aiParts.push(part);
        }
      }

      // Display content: just file name reference
      if (pdfFileName) {
        const textPart = displayParts.find((p) => p.type === 'text');
        if (textPart) {
          textPart.text = (textPart.text || '').trim() + ` [${pdfFileName}]`;
        } else {
          displayParts.unshift({ type: 'text', text: `[${pdfFileName}]` });
        }
      }

      // AI content: with PDF content
      if (pdfText) {
        const aiTextPart = aiParts.find((p) => p.type === 'text');
        if (aiTextPart) {
          aiTextPart.text = (aiTextPart.text || '') + pdfText;
        } else {
          aiParts.unshift({ type: 'text', text: pdfText });
        }
      }

      // Format outputs
      const hasImage = displayParts.some((p) => p.type === 'image_url');

      const displayContent = hasImage
        ? displayParts
        : displayParts.map((p) => p.text || '').join('');

      const aiContent = hasImage
        ? aiParts
        : aiParts.map((p) => p.text || '').join('');

      return { displayContent, aiContent };
    }

    return { displayContent: message, aiContent: message };
  }

  /**
   * Extract text content from message for processing
   */
  extractMessageText(message: any): string {
    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      return message
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ');
    }

    return '';
  }
}
