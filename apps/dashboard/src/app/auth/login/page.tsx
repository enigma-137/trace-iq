import { Suspense } from 'react';
import { AuthForm } from './AuthForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-neutral-50" />}>
      <AuthForm />
    </Suspense>
  );
}
