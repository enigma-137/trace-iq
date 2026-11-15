import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../auth/auth.service';
import { LinearIssuesService } from './linear-issues.service';

/** Linear actions on error issues, next to the other error issue routes. */
@Controller('v1/dashboard/errors')
export class LinearIssuesController {
  constructor(
    private readonly authService: AuthService,
    private readonly issues: LinearIssuesService
  ) {}

  /** Creates (or returns the existing) Linear issue for an error issue. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('issues/:id/linear-issue')
  @HttpCode(200)
  async create(
    @Param('id') id: string,
    @Body() body: { projectId?: string },
    @Headers('authorization') authorization?: string
  ) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireScope(user, 'errors:write');
    return this.issues.createForError(user, id, body?.projectId);
  }
}
