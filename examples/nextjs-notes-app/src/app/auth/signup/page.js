'use client';

/**
 * Sign Up Page
 *
 * Allows new users to create an account.
 * Collects email, password, and optional name.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { useAuth } from '@/context/AuthContext';

export default function SignUpPage() {
  const { user, loading, error, signUp } = useAuth();
  const router = useRouter();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Handle sign up
  const handleSignUp = async (data) => {
    const result = await signUp(data);

    if (!result.error) {
      router.push('/dashboard');
    }

    return result;
  };

  // Don't render form if already authenticated
  if (user) {
    return null;
  }

  return <AuthForm mode="signup" onSubmit={handleSignUp} loading={loading} error={error} />;
}
