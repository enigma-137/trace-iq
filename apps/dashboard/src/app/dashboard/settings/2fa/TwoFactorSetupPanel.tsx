'use client';

import { FormEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { buildOtpAuthUri, formatTotpSecret, useMfaStatus, type RegisteredFactor } from '@/lib/mfa';
import { DashboardDialog } from '../../DashboardDialog';
import { Skeleton } from '@/components/Skeleton';
import { readApiError } from '@/lib/api-error';
import { createOtpSubmissionGuard, isCompleteOtpCode, normalizeOtpCode } from '@/lib/otp-code';

type EnrollResponse = {
  id: string;
  totp: { secret: string; uri: string; qr_code: string };
};

export function TwoFactorSetupPanel({ userEmail }: { userEmail?: string | null }) {
  const { enrolled, factors, refresh } = useMfaStatus();
  const verifiedFactor = factors.find((factor) => factor.status === 'verified');
  const [account] = useState(userEmail ?? '');
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader />

      {status ? (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${status.tone === 'success'
            ? 'border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
            : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
            }`}
        >
          {status.message}
        </p>
      ) : null}

      {enrolled === null ? (
        <PanelSkeleton />
      ) : enrolled ? (
        <EnabledState
          factor={verifiedFactor ?? null}
          onDisabled={(message) => {
            setStatus({ tone: 'success', message });
            void refresh();
          }}
          onError={(message) => setStatus({ tone: 'error', message })}
          onCodeChange={() => setStatus(null)}
        />
      ) : (
        <SetupFlow
          account={account}
          onVerified={(message) => {
            setStatus({ tone: 'success', message });
            void refresh();
          }}
          onError={(message) => setStatus({ tone: 'error', message })}
          onCodeChange={() => setStatus(null)}
        />
      )}
    </section>
  );
}

function PageHeader() {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
        Dashboard / Security
      </p>
      {/* <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
        Two-factor authentication
      </h1> */}
      <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-neutral-400">
        Manage the additional verification required when signing into your TraceIQ account.
      </p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
        <div className="order-2 grid gap-4 md:order-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-56" />
        </div>
        <div className="order-1 flex items-center justify-center rounded-lg bg-neutral-50 p-6 dark:bg-slate-900/40 md:order-2">
          <Skeleton className="h-40 w-40 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Shared pieces                                                                                  */
/* -------------------------------------------------------------------------------------------- */

function HeroIllustration({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="order-1 flex items-center justify-center rounded-lg bg-neutral-50 p-6 dark:bg-slate-900/40 md:order-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-auto w-full max-w-[300px] object-contain sm:max-w-[360px] md:max-w-[320px]"
      />
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: 'neutral' | 'success'; children: ReactNode }) {
  if (tone === 'success') {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200  px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckIcon className="size-3.5" />
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <DotIcon className="size-2" />
      {children}
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function DotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 8 8" fill="currentColor" aria-hidden>
      <circle cx="4" cy="4" r="4" />
    </svg>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Enabled state                                                                                  */
/* -------------------------------------------------------------------------------------------- */

function EnabledState({
  factor,
  onDisabled,
  onError,
  onCodeChange
}: {
  factor: RegisteredFactor | null;
  onDisabled: (message: string) => void;
  onError: (message: string) => void;
  onCodeChange: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [code, setCode] = useState('');
  const removalSubmissionGuard = useRef(createOtpSubmissionGuard()).current;
  const codeInputRef = useRef<HTMLInputElement>(null);

  function handleRemove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void removeWithCode(code);
  }

  async function removeWithCode(rawCode: string) {
    if (!factor) {
      onError('Authenticator factor not found. Refresh and try again.');
      return;
    }
    const normalizedCode = normalizeOtpCode(rawCode);
    if (!isCompleteOtpCode(normalizedCode)) {
      onError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!removalSubmissionGuard.tryStart()) return;

    setIsRemoving(true);
    let removed = false;
    try {
      // Unenroll requires an AAL2 session, so confirm the factor with a fresh
      // challenge first (upgrades this session), then remove it.
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: normalizedCode
      });
      if (verify.error) throw verify.error;
      const unenroll = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenroll.error) throw unenroll.error;

      removed = true;
      setIsConfirmOpen(false);
      setCode('');
      onDisabled('Two-factor authentication disabled.');
    } catch (error) {
      onError(await readApiError(error, 'Could not remove two-factor authentication.'));
    } finally {
      removalSubmissionGuard.finish();
      setIsRemoving(false);
      if (!removed) {
        window.requestAnimationFrame(() => {
          codeInputRef.current?.focus();
          codeInputRef.current?.select();
        });
      }
    }
  }

  function handleCodeChange(value: string) {
    const normalizedCode = normalizeOtpCode(value);
    setCode(normalizedCode);
    onCodeChange();
    if (isCompleteOtpCode(normalizedCode)) void removeWithCode(normalizedCode);
  }

  return (
    <div className="grid gap-6">
      <div className="overflow-hidden rounded-xl border border-emerald-200/70 bg-white dark:border-emerald-900/50 dark:bg-slate-950">
        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
          <div className="order-2 grid gap-4 md:order-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Security
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                Two-factor authentication
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                Your account has an extra layer of protection.
              </p>
            </div>

            <StatusBadge tone="success">Protected</StatusBadge>

            <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Two-factor authentication is enabled. Signing in requires a code from your authenticator app.
            </p>

            <div className="grid gap-1 rounded-md border border-neutral-100 bg-neutral-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Factor
              </span>
              <span className="text-neutral-800 dark:text-slate-200">
                {factor?.friendlyName ?? 'Authenticator app'}
              </span>
            </div>
          </div>

          <HeroIllustration src="/brand/enabled.png" alt="Illustration of a robot mascot with a shield, representing a protected account" />
        </div>
      </div>

      <div className="rounded-xl border border-red-200/70 bg-white p-6 dark:border-red-900/40 dark:bg-slate-950">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-red-500 dark:text-red-400">
          Danger zone
        </p>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p className="max-w-md text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            Removing two-factor authentication will reduce the security of your account.
          </p>
          <button
            className="h-10 shrink-0 rounded-md border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
            type="button"
            disabled={isRemoving}
            onClick={() => setIsConfirmOpen(true)}
          >
            {isRemoving ? 'Removing…' : 'Remove two-factor authentication'}
          </button>
        </div>
      </div>

      <DashboardDialog
        open={isConfirmOpen}
        title="Remove two-factor authentication?"
        description="Enter a current code from your authenticator app to confirm. After removal, sign-in will not ask for a code."
        onClose={() => {
          if (!isRemoving) setIsConfirmOpen(false);
        }}
        children={
          <form onSubmit={handleRemove}>
            <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="removeTotpCode">
              Current verification code
              <input
                ref={codeInputRef}
                className={inputClass}
                id="removeTotpCode"
                value={code}
                onChange={(event) => handleCodeChange(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]*"
                placeholder="123456"
                disabled={isRemoving}
                autoFocus
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-neutral-500 dark:text-slate-400">
              Removing 2FA weakens the security of your account and its projects.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                type="button"
                disabled={isRemoving}
                onClick={() => setIsConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60"
                type="submit"
                disabled={isRemoving}
              >
                {isRemoving ? 'Confirming…' : 'Confirm and remove'}
              </button>
            </div>
          </form>
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Setup flow (disabled state + enroll + verify)                                                  */
/* -------------------------------------------------------------------------------------------- */

function SetupFlow({
  account,
  onVerified,
  onError,
  onCodeChange
}: {
  account: string;
  onVerified: (message: string) => void;
  onError: (message: string) => void;
  onCodeChange: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const verificationSubmissionGuard = useRef(createOtpSubmissionGuard()).current;
  const codeInputRef = useRef<HTMLInputElement>(null);

  async function handleEnroll() {
    setIsEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setIsEnrolling(false);
    if (error) {
      onError(error.message);
      return;
    }
    setEnroll(data as EnrollResponse);
    setCode('');
  }

  function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verifyCode(code);
  }

  async function verifyCode(rawCode: string) {
    const normalizedCode = normalizeOtpCode(rawCode);
    if (!enroll || !isCompleteOtpCode(normalizedCode)) {
      onError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    if (!verificationSubmissionGuard.tryStart()) return;

    setIsVerifying(true);
    let verified = false;
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: challenge.data.id,
        code: normalizedCode
      });
      if (verify.error) throw verify.error;

      verified = true;
      onVerified('Two-factor authentication enabled.');
    } catch (error) {
      onError(await readApiError(error, 'Could not verify the authenticator code.'));
    } finally {
      verificationSubmissionGuard.finish();
      setIsVerifying(false);
      if (!verified) {
        window.requestAnimationFrame(() => {
          codeInputRef.current?.focus();
          codeInputRef.current?.select();
        });
      }
    }
  }

  function handleCodeChange(value: string) {
    const normalizedCode = normalizeOtpCode(value);
    setCode(normalizedCode);
    onCodeChange();
    if (isCompleteOtpCode(normalizedCode)) void verifyCode(normalizedCode);
  }

  const otpauthUri = enroll ? buildOtpAuthUri(enroll.totp.secret, account) : null;

  if (!enroll) {
    return (
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
          <div className="order-2 grid gap-4 md:order-1">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Security
              </p>
              {/* <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                Two-factor authentication
              </h2> */}
              <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                Protect your account with an additional verification step when you sign in.
              </p>
            </div>

            <StatusBadge tone="neutral">Not enabled</StatusBadge>

            <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
              Use an authenticator app to generate a secure one-time code when signing in.
            </p>

            <div>
              <button
                className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                type="button"
                disabled={isEnrolling}
                onClick={() => void handleEnroll()}
              >
                {isEnrolling ? 'Generating…' : 'Enable two-factor authentication'}
              </button>
            </div>

            <ul className="grid gap-2 border-t border-neutral-100 pt-4 text-sm text-neutral-500 dark:border-slate-800 dark:text-neutral-400">
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                Protects your account if your password is compromised
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                Works with standard authenticator apps
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                Verification codes remain time-limited
              </li>
            </ul>
          </div>

          <HeroIllustration src="/brand/disabled.png" alt="Illustration of a worried robot mascot, representing an unprotected account" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 sm:p-8">
      <SetupStepper step={2} />

      <form className="mt-6 grid gap-6" onSubmit={handleVerify}>
        <div className="grid items-start gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <div className="mx-auto overflow-hidden rounded-md bg-white p-3 ring-1 ring-neutral-200 dark:ring-slate-700">
            <QRCodeSVG value={otpauthUri ?? ''} size={168} level="M" aria-label="TraceIQ two-factor QR code" />
          </div>
          <div className="grid gap-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Scan with your authenticator app</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                Open your authenticator app and tap &ldquo;Add account&rdquo;, then scan this code. Your account appears as &ldquo;TraceIQ&rdquo;.
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Can&apos;t scan? Enter this key manually
              </p>
              <p className="mt-2 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm text-neutral-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {formatTotpSecret(enroll.totp.secret)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-slate-400">
                Account name
              </p>
              <p className="mt-1 text-sm text-neutral-700 dark:text-slate-300">
                TraceIQ{account ? ` (${account})` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="grid items-end gap-3 border-t border-neutral-100 pt-6 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400" htmlFor="totpCode">
            Verification code
            <input
              ref={codeInputRef}
              className={inputClass}
              id="totpCode"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]*"
              placeholder="123456"
              disabled={isVerifying}
              autoFocus
            />
          </label>
          <button
            className="min-h-10 rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            type="submit"
            disabled={isVerifying}
          >
            {isVerifying ? 'Verifying…' : 'Verify and enable'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SetupStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Set up authenticator', 'Scan & verify', 'Protected'];
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500" aria-label="Setup progress">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === step;
        const isDone = stepNumber < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${isDone
                ? 'bg-emerald-600 text-white'
                : isActive
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  : 'bg-neutral-100 text-neutral-400 dark:bg-slate-800 dark:text-neutral-500'
                }`}
              aria-hidden
            >
              {isDone ? <CheckIcon className="size-3" /> : stepNumber}
            </span>
            <span className={isActive ? 'text-neutral-900 dark:text-white' : ''}>{label}</span>
            {stepNumber !== steps.length ? <span className="mx-1 h-px w-4 bg-neutral-200 dark:bg-slate-700" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

const inputClass =
  'min-h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
