import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AuthForm } from './AuthForm';

export default function LoginPage() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    redirect('/dashboard');
  }

  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <AuthForm />
    </Suspense>
  );
}
