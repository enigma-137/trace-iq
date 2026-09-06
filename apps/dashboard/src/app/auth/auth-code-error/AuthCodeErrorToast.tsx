'use client';

import { useEffect } from 'react';
import { toast } from '@/lib/toast';

export function AuthCodeErrorToast() {
  useEffect(() => {
    toast.error(
      'The authentication link expired, was already used, or was misconfigured. Please try signing in again.',
      { title: 'Sign-in failed' }
    );
  }, []);

  return null;
}
