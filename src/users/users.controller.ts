import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import * as bcrypt from 'bcrypt';

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

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @Req() req,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      throw new BadRequestException('رمز عبور فعلی و جدید الزامی است');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('رمز عبور جدید باید حداقل ۶ کاراکتر باشد');
    }

    // Get user with password
    const user = await this.usersService.findByIdWithPassword(req.user.id);
    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('رمز عبور فعلی اشتباه است');
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(req.user.id, hashedPassword);

    return { success: true, message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('delete-account')
  @ApiOperation({ summary: 'Delete user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  async deleteAccount(@Req() req) {
    await this.usersService.deleteUser(req.user.id);
    return { success: true, message: 'حساب کاربری با موفقیت حذف شد' };
  }
}
