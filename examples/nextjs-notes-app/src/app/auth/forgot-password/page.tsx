'use client';

/**
 * Forgot Password Page
 *
 * Allows users to request a password reset email.
 * Shows success message when email is sent.
 */

import { useRouter } from 'next/navigation';
import { type JSX, useCallback, useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormValues } from '@/components/useAuthForm';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage(): JSX.Element | null {
  const { user, loading, error, resetPassword } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user !== null) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle password reset
  const handleResetPassword = useCallback(async ({ email }: AuthFormValues) => resetPassword(email), [resetPassword]);

  // Don't render form if already authenticated
  if (user !== null) {
    return null;
  }

  return <AuthForm mode="forgot-password" onSubmit={handleResetPassword} loading={loading} error={error} />;
}
