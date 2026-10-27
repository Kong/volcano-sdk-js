'use client';

/**
 * Authentication Form Fields
 *
 * The name, email, and password inputs AuthForm shows for its mode.
 */

import type { Dispatch, SetStateAction } from 'react';
import { useInputChange } from '@/hooks/eventHandlers';
import type { AuthFormFieldValues, AuthMode } from './useAuthForm';

type StringSetter = Dispatch<SetStateAction<string>>;

interface AuthFieldsProps {
  /** Field values and setters from useAuthForm */
  fields: AuthFormFieldValues;
  /** Show the name field */
  showName: boolean;
  /** Show the password field */
  showPassword: boolean;
  /** Form mode */
  mode: AuthMode;
}

export function AuthFields({ fields, showName, showPassword, mode }: AuthFieldsProps) {
  const { name, setName, email, setEmail, password, setPassword } = fields;

  return (
    <div className="space-y-4">
      {/* Name Field (signup only) */}
      {showName && <NameField name={name} setName={setName} />}

      {/* Email Field */}
      <EmailField email={email} setEmail={setEmail} />

      {/* Password Field */}
      {showPassword && <PasswordField password={password} setPassword={setPassword} mode={mode} />}
    </div>
  );
}

function NameField({ name, setName }: { name: string; setName: StringSetter }) {
  const handleChange = useInputChange(setName);

  return (
    <div>
      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
        Name
      </label>
      <input
        id="name"
        name="name"
        type="text"
        value={name}
        onChange={handleChange}
        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
        placeholder="John Doe"
      />
    </div>
  );
}

function EmailField({ email, setEmail }: { email: string; setEmail: StringSetter }) {
  const handleChange = useInputChange(setEmail);

  return (
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
        onChange={handleChange}
        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
        placeholder="you@example.com"
      />
    </div>
  );
}

function PasswordField({
  password,
  setPassword,
  mode,
}: {
  password: string;
  setPassword: StringSetter;
  mode: AuthMode;
}) {
  const handleChange = useInputChange(setPassword);

  return (
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
        onChange={handleChange}
        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-volcano-500 focus:border-volcano-500 sm:text-sm"
        placeholder="••••••••"
        minLength={8}
      />
      {mode === 'signup' && <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>}
    </div>
  );
}
