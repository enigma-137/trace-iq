import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreatePersonalAccessTokenRequest, PersonalAccessTokensService } from './personal-access-tokens.service';

@Controller('v1/dashboard/personal-access-tokens')
export class PersonalAccessTokensController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokensService: PersonalAccessTokensService
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.tokensService.list(user);
  }

  @Post()
  async create(@Body() body: CreatePersonalAccessTokenRequest, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.tokensService.create(user, body);
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    return this.tokensService.revoke(user, id);
  }
}
