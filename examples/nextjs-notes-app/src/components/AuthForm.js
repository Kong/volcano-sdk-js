'use client';

/**
 * Authentication Form Component
 *
 * Reusable form for sign in, sign up, and password reset.
 * Handles form validation and error display.
 *
 * @example
 * <AuthForm
 *   mode="signin"
 *   onSubmit={handleSignIn}
 *   loading={loading}
 *   error={error}
 * />
 */

import Link from 'next/link';
import { useState } from 'react';

/**
 * @typedef {'signin' | 'signup' | 'forgot-password'} AuthMode
 */

/**
 * @param {Object} props
 * @param {AuthMode} props.mode - Form mode
 * @param {Function} props.onSubmit - Submit handler
 * @param {boolean} props.loading - Loading state
 * @param {Error|null} props.error - Error to display
 * @param {Function} [props.onAnonymousSignIn] - Anonymous sign in handler
 */
export function AuthForm({ mode, onSubmit, loading, error, onAnonymousSignIn }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [success, setSuccess] = useState(false);

  // ---------------------------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------------------------

  const config = {
    signin: {
      title: 'Sign in to your account',
      submitText: 'Sign In',
      showPassword: true,
      showName: false,
      alternateLink: {
        text: "Don't have an account?",
        linkText: 'Sign up',
        href: '/auth/signup',
      },
      forgotPasswordLink: true,
    },
    signup: {
      title: 'Create your account',
      submitText: 'Sign Up',
      showPassword: true,
      showName: true,
      alternateLink: {
        text: 'Already have an account?',
        linkText: 'Sign in',
        href: '/auth/signin',
      },
      forgotPasswordLink: false,
    },
    'forgot-password': {
      title: 'Reset your password',
      submitText: 'Send Reset Link',
      showPassword: false,
      showName: false,
      alternateLink: {
        text: 'Remember your password?',
        linkText: 'Sign in',
        href: '/auth/signin',
      },
      forgotPasswordLink: false,
    },
  };

  const { title, submitText, showPassword, showName, alternateLink, forgotPasswordLink } =
    config[mode];

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);

    const result = await onSubmit({
      email,
      password,
      metadata: showName ? { name } : undefined,
    });

    // Show success message for password reset
    if (mode === 'forgot-password' && !result?.error) {
      setSuccess(true);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <span className="text-4xl">🌋</span>
          </Link>
          <h2 className="mt-4 text-3xl font-bold text-gray-900">{title}</h2>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error.message || 'An error occurred'}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              Check your email for password reset instructions.
            </div>
          )}

          <div className="space-y-4">
            {/* Name Field (signup only) */}
            {showName && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
                  placeholder="John Doe"
                />
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>

            {/* Password Field */}
            {showPassword && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
                  placeholder="••••••••"
                  minLength={8}
                />
                {mode === 'signup' && (
                  <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
                )}
              </div>
            )}
          </div>

          {/* Forgot Password Link */}
          {forgotPasswordLink && (
            <div className="text-right">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-volcano-600 hover:text-volcano-500"
              >
                Forgot your password?
              </Link>
            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-volcano-600 hover:bg-volcano-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-volcano-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading...
                </span>
              ) : (
                submitText
              )}
            </button>
          </div>

          {/* Anonymous Sign In (sign in page only) */}
          {mode === 'signin' && onAnonymousSignIn && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or</span>
              </div>
            </div>
          )}

          {mode === 'signin' && onAnonymousSignIn && (
            <button
              type="button"
              onClick={onAnonymousSignIn}
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-volcano-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue as Guest
            </button>
          )}
        </form>

        {/* Alternate Link */}
        <p className="text-center text-sm text-gray-600">
          {alternateLink.text}{' '}
          <Link
            href={alternateLink.href}
            className="font-medium text-volcano-600 hover:text-volcano-500"
          >
            {alternateLink.linkText}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default AuthForm;
