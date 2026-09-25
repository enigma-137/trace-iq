import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Password reset and recovery UI', () => {
  it('includes a forgot password link on the sign in view', () => {
    const authFormSource = readFileSync(
      new URL('../src/app/auth/login/AuthForm.tsx', import.meta.url),
      'utf8'
    );

    expect(authFormSource).toContain('href="/auth/forgot-password"');
    expect(authFormSource).toContain('Forgot password?');
  });

  it('provides the forgot password form with email submission and reset redirect', () => {
    const forgotFormSource = readFileSync(
      new URL('../src/app/auth/forgot-password/ForgotPasswordForm.tsx', import.meta.url),
      'utf8'
    );

    expect(forgotFormSource).toContain('resetPasswordForEmail');
    expect(forgotFormSource).toContain('next=/auth/reset-password');
    expect(forgotFormSource).toContain('Send password reset link');
  });

  it('provides the reset password form with password confirmation and update user action', () => {
    const resetFormSource = readFileSync(
      new URL('../src/app/auth/reset-password/ResetPasswordForm.tsx', import.meta.url),
      'utf8'
    );

    expect(resetFormSource).toContain('updateUser');
    expect(resetFormSource).toContain('newPassword');
    expect(resetFormSource).toContain('confirmPassword');
    expect(resetFormSource).toContain('Update password');
  });

  it('includes PasswordSettingsPanel after TwoFactorPanel in settings page', () => {
    const settingsPageSource = readFileSync(
      new URL('../src/app/dashboard/settings/page.tsx', import.meta.url),
      'utf8'
    );

    expect(settingsPageSource).toContain('PasswordSettingsPanel');
    const twoFactorIndex = settingsPageSource.indexOf('<TwoFactorPanel />');
    const passwordPanelIndex = settingsPageSource.indexOf('<PasswordSettingsPanel');
    const patIndex = settingsPageSource.indexOf('<PersonalAccessTokensPanel />');

    expect(twoFactorIndex).toBeGreaterThan(-1);
    expect(passwordPanelIndex).toBeGreaterThan(twoFactorIndex);
    expect(patIndex).toBeGreaterThan(passwordPanelIndex);
  });
});
