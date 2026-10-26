'use client';

/**
 * Landing Page
 *
 * The home page of the application.
 * Shows a welcome message and links to sign in/sign up.
 * Redirects authenticated users to the dashboard.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { HomeFeatures, HomeFooter, HomeHero } from '@/components/HomeSections';
import { useAuth } from '@/context/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-volcano-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <HomeHero />

      {/* Features Section */}
      <HomeFeatures />

      {/* Footer */}
      <HomeFooter />
    </div>
  );
}
