import { Suspense } from 'react';
import { AuthForm } from './AuthForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-shell" />}>
      <AuthForm />
    </Suspense>
  );
}

