import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MfaService } from './mfa.service';

@Controller('v1/dashboard/me')
export class MfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService
  ) {}

  @Get()
  async me(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);

    return {
      user: {
        id: user.id,
        email: user.email ?? null,
        authMethod: user.authMethod ?? null
      },
      mfa: this.mfaService.status(user)
    };
  }
}