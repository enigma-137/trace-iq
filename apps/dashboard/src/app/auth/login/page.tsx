import { Suspense } from 'react';
import { AuthForm } from './AuthForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white dark:bg-black" />}>
      <AuthForm />
    </Suspense>
  );
}
