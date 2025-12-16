import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseGuards,
    Logger,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StreamMessageDto } from './dto/stream-message.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
    private readonly logger = new Logger(ChatController.name);

    constructor(private chatService: ChatService) { }

    @Post('sessions')
    @ApiOperation({ summary: 'Create new chat session' })
    @ApiResponse({ status: 201, description: 'Session created successfully' })
    async createSession(@Req() req, @Body() body: CreateSessionDto) {
        return this.chatService.createSession(req.user.id, body.title);
    }

    @Post('start')
    @ApiOperation({ summary: 'Start new chat with first message' })
    @ApiResponse({ status: 201, description: 'Chat started successfully' })
    async startChat(
        @Req() req,
        @Body() body: { message: string; model?: string; mode?: string },
    ) {
        const { message, model, mode } = body;
        const userId = req.user.id;

        // Create session
        const session = await this.chatService.createSession(userId, 'گفتگوی جدید');

        // Send first message
        const response = await this.chatService.sendMessage(
            session.id,
            userId,
            message,
            model,
            mode,
        );

        return {
            sessionId: session.id,
            response,
        };
    }

    @Get('sessions')
    @SkipThrottle()
    @ApiOperation({ summary: 'Get all user chat sessions' })
    @ApiResponse({ status: 200, description: 'Returns user sessions' })
    async getUserSessions(@Req() req) {
        return this.chatService.getUserSessions(req.user.id);
    }

    @Get('sessions/:sessionId/messages')
    @SkipThrottle()
    @ApiOperation({ summary: 'Get messages in a session with cursor-based pagination' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of messages to return (default: 10)' })
    @ApiQuery({ name: 'beforeId', required: false, description: 'Return messages before this message ID (cursor)' })
    @ApiResponse({ status: 200, description: 'Returns session messages' })
    async getSessionMessages(
        @Req() req,
        @Param('sessionId') sessionId: string,
        @Query('limit') limit?: string,
        @Query('beforeId') beforeId?: string,
    ) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        const parsedBeforeId = beforeId ? parseInt(beforeId, 10) : undefined;
        return this.chatService.getSessionMessagesPaginated(sessionId, req.user.id, parsedLimit, parsedBeforeId);
    }

    @Post('messages')
    @ApiOperation({ summary: 'Send message to AI (non-streaming)' })
    @ApiResponse({ status: 201, description: 'Message sent successfully' })
    async sendMessage(
        @Req() req,
        @Body() body: SendMessageDto,
    ) {
        return this.chatService.sendMessage(
            body.sessionId,
            req.user.id,
            body.message,
            body.model,
            body.mode,
        );
    }

    // ✅ ChatGPT-style: Save voice transcript as message (no AI call - Realtime API handles response)
    @Post('messages/voice')
    @ApiOperation({ summary: 'Save voice transcript as chat message' })
    @ApiResponse({ status: 201, description: 'Voice message saved' })
    async saveVoiceMessage(
        @Req() req,
        @Body() body: { sessionId: string; content: string; role: 'user' | 'assistant' },
    ) {
        const { sessionId, content, role } = body;
        
        if (!sessionId || !content || !role) {
            return { success: false, message: 'Missing required fields' };
        }

        const messageId = await this.chatService.saveVoiceMessage(
            sessionId,
            req.user.id,
            content,
            role,
        );

        return { success: true, messageId };
    }

    @Post('messages/stream')
    @SkipThrottle()
    @ApiOperation({ summary: 'Send message to AI with SSE streaming' })
    @ApiResponse({ status: 200, description: 'Stream started' })
    async sendMessageStream(
        @Req() req,
        @Res() res: Response,
        @Body() body: StreamMessageDto,
    ) {
        const { sessionId, message, model, mode } = body;
        const userId = req.user.id;

        // ✅ Optimized SSE headers for instant streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Transfer-Encoding', 'chunked');

        // ✅ Flush headers immediately to start connection
        res.flushHeaders();

        try {
            const result = await this.chatService.sendMessageStream(
                sessionId || null, // ✅ ChatGPT tarzı: sessionId yoksa null gönder
                userId,
                message,
                (chunk: string) => {
                    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
                    // ✅ Force flush each chunk immediately
                    if (typeof (res as any).flush === 'function') {
                        (res as any).flush();
                    }
                },
                model,
                mode,
            );

            res.write(
                `data: ${JSON.stringify({
                    done: true,
                    sessionId: result.sessionId,
                    userMessageId: result.userMessageId,
                    assistantMessageId: result.assistantMessageId,
                    isNewSession: result.isNewSession || false,
                })}\n\n`,
            );
            res.write('data: [DONE]\n\n');
            res.end();
        } catch (error: any) {
            this.logger.error('Streaming failed', error);
            if (error?.code === 'PREMIUM_REQUIRED' || error?.code === 'PREMIUM_EXPIRED') {
                res.write(
                    `event: error\ndata: ${JSON.stringify({
                        error: error.message,
                        code: error.code,
                        upgradeUrl: '/premium',
                    })}\n\n`,
                );
                res.end();
                return;
            }
            if (error?.code === 'RATE_LIMIT_EXCEEDED') {
                res.write(
                    `event: error\ndata: ${JSON.stringify({ error: error.message, code: error.code })}\n\n`,
                );
                res.end();
                return;
            }
            if (error?.message?.includes('Session not found')) {
                res.write(
                    `event: error\ndata: ${JSON.stringify({ error: 'Session not found or unauthorized' })}\n\n`,
                );
                res.end();
                return;
            }
            res.write(
                `event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`,
            );
            res.end();
        }
    }

    @Delete('sessions/:sessionId')
    @ApiOperation({ summary: 'Delete chat session' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiResponse({ status: 200, description: 'Session deleted' })
    async deleteSession(@Req() req, @Param('sessionId') sessionId: string) {
        return this.chatService.deleteSession(sessionId, req.user.id);
    }

    @Get('sessions/pinned')
    @ApiOperation({ summary: 'Get pinned sessions' })
    @ApiResponse({ status: 200, description: 'Pinned sessions list' })
    async getPinnedSessions(@Req() req) {
        return this.chatService.getPinnedSessions(req.user.id);
    }

    @Get('sessions/archived')
    @ApiOperation({ summary: 'Get archived sessions' })
    @ApiResponse({ status: 200, description: 'Archived sessions list' })
    async getArchivedSessions(@Req() req) {
        return this.chatService.getArchivedSessions(req.user.id);
    }

    @Post('sessions/:sessionId/pin')
    @ApiOperation({ summary: 'Toggle pin session' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiResponse({ status: 200, description: 'Session pin toggled' })
    async togglePinSession(@Req() req, @Param('sessionId') sessionId: string) {
        return this.chatService.togglePinSession(sessionId, req.user.id);
    }

    @Post('sessions/:sessionId/archive')
    @ApiOperation({ summary: 'Toggle archive session' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiResponse({ status: 200, description: 'Session archive toggled' })
    async toggleArchiveSession(@Req() req, @Param('sessionId') sessionId: string) {
        return this.chatService.toggleArchiveSession(sessionId, req.user.id);
    }

    @Post('sessions/:sessionId/move')
    @ApiOperation({ summary: 'Move session to folder' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiResponse({ status: 200, description: 'Session moved to folder' })
    async moveSessionToFolder(
        @Req() req,
        @Param('sessionId') sessionId: string,
        @Body() body: { folderId: number | null }
    ) {
        return this.chatService.moveSessionToFolder(sessionId, req.user.id, body.folderId);
    }

    @Put('sessions/:sessionId')
    @ApiOperation({ summary: 'Update session title' })
    @ApiParam({ name: 'sessionId', description: 'Session ID' })
    @ApiResponse({ status: 200, description: 'Session updated' })
    async updateSession(
        @Req() req,
        @Param('sessionId') sessionId: string,
        @Body() body: UpdateSessionDto,
    ) {
        return this.chatService.updateSession(sessionId, req.user.id, body.title);
    }

    @Post('messages/regenerate')
    @ApiOperation({ summary: 'Regenerate last assistant message' })
    @ApiResponse({ status: 201, description: 'Message regenerated' })
    async regenerateMessage(
        @Req() req,
        @Body() body: { sessionId: string; model?: string },
    ) {
        const response = await this.chatService.regenerateLastMessage(
            body.sessionId,
            req.user.id,
            body.model,
        );
        return { response };
    }

    @Put('messages/:messageId')
    @ApiOperation({ summary: 'Edit message content' })
    @ApiParam({ name: 'messageId', description: 'Message ID' })
    @ApiResponse({ status: 200, description: 'Message updated' })
    async editMessage(
        @Req() req,
        @Param('messageId') messageId: string,
        @Body() body: { content: string },
    ) {
        return this.chatService.editMessage(
            parseInt(messageId),
            req.user.id,
            body.content,
        );
    }

    @Get('download-image')
    @ApiOperation({ summary: 'Download AI-generated image' })
    @ApiQuery({ name: 'url', description: 'Image URL from OpenAI' })
    @ApiResponse({ status: 200, description: 'Image downloaded' })
    async downloadImage(@Query('url') url: string, @Res() res: Response) {
        try {
            const allowedDomains = [
                'oaidalleapiprodscus.blob.core.windows.net',
                'dalleprodsec.blob.core.windows.net',
                'openai.com',
                'api.openai.com',
            ];

            const urlObj = new URL(url);
            if (!allowedDomains.some((domain) => urlObj.hostname.includes(domain))) {
                return res.status(HttpStatus.FORBIDDEN).send({ error: 'Domain not allowed' });
            }

            const response = await fetch(url);
            if (!response.ok) {
                return res
                    .status(response.status)
                    .send({ error: 'Failed to fetch image' });
            }

            const buffer = await response.arrayBuffer();
            const contentType = response.headers.get('content-type') || 'image/png';

            res.setHeader('Content-Type', contentType);
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="gooai-image-${Date.now()}.png"`,
            );
            res.setHeader('Cache-Control', 'no-cache');

            res.send(Buffer.from(buffer));
        } catch (error) {
            this.logger.error('Image download failed', error);
            res.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ error: 'Could not download image' });
        }
    }

    // ------------------------------
    // Deep Research endpoints
    // ------------------------------
    @Post('research/start')
    @ApiOperation({ summary: 'Start a Deep Research task (background)' })
    @ApiResponse({ status: 202, description: 'Research started, returns id' })
    async startDeepResearch(@Req() req, @Body() body: { prompt: string; sessionId?: string; model?: string }) {
        const { prompt, sessionId, model } = body || {};
        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return { error: 'Prompt is required' };
        }
        const result = await this.chatService.startDeepResearch(prompt.trim(), sessionId, model);
        return result;
    }

    @Get('research/status/:id')
    @ApiOperation({ summary: 'Get Deep Research task status' })
    @ApiParam({ name: 'id', description: 'Deep Research response id' })
    @ApiResponse({ status: 200, description: 'Returns status and output' })
    async deepResearchStatus(@Param('id') id: string) {
        return this.chatService.getDeepResearchStatus(id);
    }

    @Post('research/save')
    @ApiOperation({ summary: 'Save Deep Research result to database' })
    @ApiResponse({ status: 200, description: 'Research messages saved' })
    async saveDeepResearchResult(
        @Req() req,
        @Body() body: { sessionId: string; userMessage: string; assistantMessage: string }
    ) {
        const { sessionId, userMessage, assistantMessage } = body || {};
        if (!sessionId || !userMessage || !assistantMessage) {
            return { error: 'sessionId, userMessage and assistantMessage are required' };
        }
        
        const userId = req.user?.id || req.user?.sub;
        if (!userId) {
            return { error: 'User not authenticated' };
        }
        
        return this.chatService.saveDeepResearchMessages(sessionId, userId, userMessage, assistantMessage);
    }
}
