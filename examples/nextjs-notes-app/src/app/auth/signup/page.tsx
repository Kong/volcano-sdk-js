'use client';

/**
 * Sign Up Page
 *
 * Allows new users to create an account.
 * Collects email, password, and optional name.
 */

import { useRouter } from 'next/navigation';
import { type JSX, useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/context/AuthContext';
import { useDashboardRedirect } from '@/hooks/useDashboardRedirect';

export default function SignUpPage(): JSX.Element | null {
  const { user, loading, error, signUp } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user !== null) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle sign up
  const handleSignUp = useDashboardRedirect(signUp);

  // Don't render form if already authenticated
  if (user !== null) {
    return null;
  }

  return <AuthForm mode="signup" onSubmit={handleSignUp} loading={loading} error={error} />;
}
