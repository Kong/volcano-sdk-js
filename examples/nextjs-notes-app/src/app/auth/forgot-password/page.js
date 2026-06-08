'use client';

/**
 * Forgot Password Page
 *
 * Allows users to request a password reset email.
 * Shows success message when email is sent.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage() {
  const { user, loading, error, resetPassword } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle password reset
  const handleResetPassword = async ({ email }) => {
    return await resetPassword(email);
  };

  // Don't render form if already authenticated
  if (user) {
    return null;
  }

  return (
    <AuthForm
      mode="forgot-password"
      onSubmit={handleResetPassword}
      loading={loading}
      error={error}
    />
  );
}
