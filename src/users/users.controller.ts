import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @UseGuards(AuthGuard('jwt'))
    @Get('profile')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Returns user profile' })
    async getProfile(@Req() req) {
        return this.usersService.updateProfile(req.user.id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Put('profile')
    @ApiOperation({ summary: 'Update user profile' })
    @ApiResponse({ status: 200, description: 'Profile updated' })
    async updateProfile(@Req() req, @Body() body: any) {
        // TODO: Implement profile update logic
        return { success: true, message: 'Profile update not fully implemented' };
    }
}
