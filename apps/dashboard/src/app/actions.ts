'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function joinWaitlist(email: string) {
  if (!email || typeof email !== 'string') {
    return { success: false, error: 'Email is required.' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  try {
    const supabase = createSupabaseServerClient();
    
    const { error } = await supabase
      .from('waitlist')
      .insert([{ email }]);

    if (error) {
      if (error.code === '23505') {
        // Unique key constraint violation: email already exists
        return { success: true, message: 'You are already on the waitlist! We will be in touch soon.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true, message: 'Welcome to the waitlist! We will notify you when early access opens.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}
