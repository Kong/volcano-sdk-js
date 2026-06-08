'use client';

/**
 * Sign In Page
 *
 * Allows users to:
 * - Sign in with email/password
 * - Continue as guest (anonymous)
 * - Navigate to sign up or password reset
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/context/AuthContext';

export default function SignInPage() {
  const { user, loading, error, signIn, signUpAnonymous } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle sign in
  const handleSignIn = async (credentials) => {
    const result = await signIn(credentials);

    if (!result.error) {
      router.push('/dashboard');
    }

    return result;
  };

  // Handle anonymous sign up
  const handleAnonymousSignIn = async () => {
    const result = await signUpAnonymous();

    if (!result.error) {
      router.push('/dashboard');
    }

    return result;
  };

  // Don't render form if already authenticated
  if (user) {
    return null;
  }

  return (
    <AuthForm
      mode="signin"
      onSubmit={handleSignIn}
      onAnonymousSignIn={handleAnonymousSignIn}
      loading={loading}
      error={error}
    />
  );
}
