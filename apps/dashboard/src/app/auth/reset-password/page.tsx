import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ResetPasswordForm } from './ResetPasswordForm';

export default function ResetPasswordPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    redirect('/dashboard');
  }

  return (
    <Suspense fallback={<main className="min-h-screen bg-white dark:bg-black" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
