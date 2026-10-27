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
import { AuthFields } from './AuthFormFields';
import { AuthFeedback, GuestSignIn, SubmitButton } from './AuthFormControls';
import { type AuthFormSubmit, type AuthMode, useAuthForm } from './useAuthForm';

interface AlternateLinkConfig {
  text: string;
  linkText: string;
  href: string;
}

interface AuthModeConfig {
  title: string;
  submitText: string;
  showPassword: boolean;
  showName: boolean;
  alternateLink: AlternateLinkConfig;
  forgotPasswordLink: boolean;
}

// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

const config: Record<AuthMode, AuthModeConfig> = {
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

interface AuthFormProps {
  /** Form mode */
  mode: AuthMode;
  /** Submit handler */
  onSubmit: AuthFormSubmit;
  /** Loading state */
  loading: boolean;
  /** Error to display */
  error: Error | null;
  /** Anonymous sign in handler */
  onAnonymousSignIn?: () => Promise<unknown>;
}

export function AuthForm({ mode, onSubmit, loading, error, onAnonymousSignIn }: AuthFormProps) {
  const { title, submitText, showPassword, showName, alternateLink, forgotPasswordLink } = config[mode];
  const { fields, success, handleSubmit } = useAuthForm({ mode, onSubmit, showName });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <AuthHeader title={title} />

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <AuthFeedback error={error} success={success} />

          <AuthFields fields={fields} showName={showName} showPassword={showPassword} mode={mode} />

          {/* Forgot Password Link */}
          {forgotPasswordLink && <ForgotPasswordLink />}

          <SubmitButton loading={loading} submitText={submitText} />

          <GuestSignIn mode={mode} onAnonymousSignIn={onAnonymousSignIn} loading={loading} />
        </form>

        {/* Alternate Link */}
        <AlternateLink alternateLink={alternateLink} />
      </div>
    </div>
  );
}

function AuthHeader({ title }: { title: string }) {
  return (
    <div className="text-center">
      <Link href="/" className="inline-flex items-center space-x-2">
        <span className="text-4xl">🌋</span>
      </Link>
      <h2 className="mt-4 text-3xl font-bold text-gray-900">{title}</h2>
    </div>
  );
}

function ForgotPasswordLink() {
  return (
    <div className="text-right">
      <Link href="/auth/forgot-password" className="text-sm text-volcano-600 hover:text-volcano-500">
        Forgot your password?
      </Link>
    </div>
  );
}

function AlternateLink({ alternateLink }: { alternateLink: AlternateLinkConfig }) {
  return (
    <p className="text-center text-sm text-gray-600">
      {alternateLink.text}{' '}
      <Link href={alternateLink.href} className="font-medium text-volcano-600 hover:text-volcano-500">
        {alternateLink.linkText}
      </Link>
    </p>
  );
}
