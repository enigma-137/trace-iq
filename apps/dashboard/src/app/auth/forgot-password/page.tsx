import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export default function ForgotPasswordPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    redirect('/dashboard');
  }

  return (
    <Suspense fallback={<main className="min-h-screen bg-white dark:bg-black" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
