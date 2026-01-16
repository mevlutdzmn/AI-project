import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

type Tier = 'free' | 'pro' | 'premium';

interface ModelInfo {
  id: string;
  name: string;
  tier: Tier;
  provider: 'openai' | 'google';
  category?: 'chat' | 'image';
  description?: string;
}

@Controller('models')
export class ModelsController {
  private readonly geminiEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.geminiEnabled = this.configService.get('GEMINI_ENABLED') === 'true';
  }

  /**
   * Get available models based on server configuration
   * Frontend calls this instead of hardcoding model list
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  getAvailableModels(@Req() req: any) {
    const user = req.user;
    const userTier = this.getUserTier(user);

    // OpenAI Models
    const openaiModels: ModelInfo[] = [
      { id: 'gpt-4o', name: 'GPT-4o', tier: 'free', provider: 'openai', category: 'chat', description: 'Great for everyday tasks' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'free', provider: 'openai', category: 'chat', description: 'Fast and efficient for simple tasks' },
      { id: 'gpt-5.2-auto', name: 'GPT-5.2', tier: 'pro', provider: 'openai', category: 'chat', description: 'High quality fast responses' },
      { id: 'gpt-5.2-instant', name: 'GPT-5.2 Instant', tier: 'pro', provider: 'openai', category: 'chat', description: 'Ultra-fast responses' },
      { id: 'gpt-5.2-thinking', name: 'GPT-5.2 Thinking', tier: 'premium', provider: 'openai', category: 'chat', description: 'Deep reasoning for complex problems' },
      { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', tier: 'premium', provider: 'openai', category: 'chat', description: 'Maximum capacity and performance' },
    ];

    // Gemini Models (only if enabled)
    const geminiModels: ModelInfo[] = this.geminiEnabled ? [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tier: 'free', provider: 'google', category: 'chat', description: 'Fast responses from Google' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: 'pro', provider: 'google', category: 'chat', description: 'Advanced reasoning' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tier: 'pro', provider: 'google', category: 'chat', description: 'Latest Gemini preview' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', tier: 'premium', provider: 'google', category: 'chat', description: 'Most capable Gemini' },
      // Image models
      { id: 'gemini-2.5-flash-image', name: 'Gemini Image', tier: 'pro', provider: 'google', category: 'image', description: 'Native image generation' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini Image Pro', tier: 'premium', provider: 'google', category: 'image', description: 'High quality image generation' },
      { id: 'imagen-4.0-generate-001', name: 'Imagen 4', tier: 'premium', provider: 'google', category: 'image', description: 'Google Imagen 4' },
    ] : [];

    const allModels = [...openaiModels, ...geminiModels];

    // Mark which models user can access
    const modelsWithAccess = allModels.map(model => ({
      ...model,
      locked: !this.canAccessModel(userTier, model.tier),
    }));

    return {
      models: modelsWithAccess,
      userTier,
      geminiEnabled: this.geminiEnabled,
    };
  }

  /**
   * Get user's subscription tier
   */
  private getUserTier(user: any): Tier {
    if (!user) return 'free';
    if (user.isAdmin || user.role === 'admin') return 'premium';
    
    if (user.isPremium) {
      const expiryDate = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
      if (!expiryDate || expiryDate > new Date()) {
        return 'premium';
      }
    }
    
    return 'free';
  }

  /**
   * Check if user tier can access model tier
   */
  private canAccessModel(userTier: Tier, modelTier: Tier): boolean {
    const tierOrder: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };
    return tierOrder[userTier] >= tierOrder[modelTier];
  }
}
