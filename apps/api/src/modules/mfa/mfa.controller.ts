import { Controller, Get, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { MfaService } from './mfa.service';

@Controller('v1/dashboard/me')
export class MfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService
  ) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async me(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization, { fresh: true });

    return {
      user: {
        id: user.id,
        email: user.email ?? null,
        authMethod: user.authMethod ?? null,
        // Only personal access tokens are scoped; browser sessions can do everything.
        scopes: user.authMethod === 'pat' ? (user.scopes ?? []) : null
      },
      mfa: this.mfaService.status(user)
    };
  }
}