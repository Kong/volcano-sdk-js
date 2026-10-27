'use client';

/**
 * Dashboard Page
 *
 * The main authenticated view where users can:
 * - View their notes
 * - Create new notes
 * - Edit existing notes
 * - Delete notes
 *
 * Protected route - redirects to sign in if not authenticated.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { GuestAccountBanner, QuickTips, SdkCodeReference } from '@/components/DashboardSections';
import { NotesList } from '@/components/NotesList';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, loading, isAnonymous } = useAuth();
  const router = useRouter();

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
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

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Notes</h1>
        <p className="mt-1 text-gray-600">Create, edit, and organize your notes.</p>
      </div>

      {/* Anonymous User Banner */}
      {isAnonymous && <GuestAccountBanner />}

      {/* Notes List */}
      <NotesList />

      {/* Tips Section */}
      <QuickTips />

      {/* SDK Code Reference */}
      <SdkCodeReference />
    </div>
  );
}
