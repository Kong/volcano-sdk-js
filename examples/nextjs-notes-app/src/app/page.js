'use client';

/**
 * Landing Page
 *
 * The home page of the application.
 * Shows a welcome message and links to sign in/sign up.
 * Redirects authenticated users to the dashboard.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          {/* Logo */}
          <div className="text-6xl mb-6">🌋</div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Volcano Notes</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            A simple notes app built with the{' '}
            <span className="text-volcano-600 font-semibold">Volcano SDK</span>.
            <br />
            Authentication, database, and more — all in one.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-volcano-600 hover:bg-volcano-700 transition-colors"
            >
              Get Started
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
          Built with the Volcano SDK
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="w-12 h-12 bg-volcano-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-volcano-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication</h3>
            <p className="text-gray-600">
              Sign up, sign in, and password recovery. Anonymous login for quick access.
            </p>
            <pre className="mt-4 text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
              <code className="text-gray-700">
                {`await volcano.auth.signIn({
  email, password
});`}
              </code>
            </pre>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 11h6m-6 4h6"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Database Queries</h3>
            <p className="text-gray-600">
              Query PostgreSQL directly from the browser with a chainable API.
            </p>
            <pre className="mt-4 text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
              <code className="text-gray-700">
                {`await volcano
  .from('notes')
  .select('*')
  .order('created_at');`}
              </code>
            </pre>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Row-Level Security</h3>
            <p className="text-gray-600">
              Automatic data isolation. Users only see their own notes.
            </p>
            <pre className="mt-4 text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto">
              <code className="text-gray-700">
                {`-- RLS Policy
WHERE user_id = auth.uid()`}
              </code>
            </pre>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            Built with{' '}
            <a
              href="https://github.com/Kong/sdk-volcano-js"
              className="text-volcano-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Volcano SDK
            </a>
            {' · '}
            <a
              href="https://nextjs.org"
              className="text-volcano-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Next.js
            </a>
            {' · '}
            <a
              href="https://tailwindcss.com"
              className="text-volcano-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Tailwind CSS
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
