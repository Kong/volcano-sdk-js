'use client';

/**
 * Authentication Form Controls
 *
 * AuthForm's feedback messages, submit button, and guest sign-in.
 */

import { type JSX, useCallback } from 'react';
import type { AuthMode } from './useAuthForm';

export function AuthFeedback({ error, success }: { error: Error | null; success: boolean }): JSX.Element {
  return (
    <>
      {/* Error Message */}
      {error !== null && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error.message === '' ? 'An error occurred' : error.message}
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          Check your email for password reset instructions.
        </div>
      )}
    </>
  );
}

export function SubmitButton({ loading, submitText }: { loading: boolean; submitText: string }): JSX.Element {
  return (
    <div>
      <button
        type="submit"
        disabled={loading}
        className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-volcano-600 hover:bg-volcano-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-volcano-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
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
  );
}

interface GuestSignInProps {
  mode: AuthMode;
  onAnonymousSignIn: (() => Promise<unknown>) | undefined;
  loading: boolean;
}

export function GuestSignIn({ mode, onAnonymousSignIn, loading }: GuestSignInProps): JSX.Element | null {
  const handleClick = useCallback(() => {
    void onAnonymousSignIn?.();
  }, [onAnonymousSignIn]);

  if (mode !== 'signin' || onAnonymousSignIn === undefined) {
    return null;
  }
  return (
    <>
      {/* Anonymous Sign In (sign in page only) */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-50 text-gray-500">Or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full flex justify-center py-2.5 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-volcano-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Continue as Guest
      </button>
    </>
  );
}
