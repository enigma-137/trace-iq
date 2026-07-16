import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface DashboardUser {
  id: string;
  email?: string;
}

interface SupabaseUserResponse {
  id?: string;
  email?: string;
}

@Injectable()
export class AuthService {
  async getDashboardUser(authorizationHeader?: string): Promise<DashboardUser> {
    const token = this.getBearerToken(authorizationHeader);
    const user = await this.getSupabaseUser(token);

    if (!user.id) {
      throw new UnauthorizedException('Supabase session is missing a user ID.');
    }

    return {
      id: user.id,
      email: user.email
    };
  }

  private getBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return authorizationHeader.slice('Bearer '.length).trim();
  }

  private async getSupabaseUser(token: string): Promise<SupabaseUserResponse> {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new UnauthorizedException('Supabase API auth environment variables are not configured.');
    }

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired dashboard session.');
    }

    return (await response.json()) as SupabaseUserResponse;
  }
}
