'use client';

/**
 * Authentication Form Fields
 *
 * The name, email, and password inputs AuthForm shows for its mode.
 */

import { useCallback } from 'react';

/**
 * @param {Object} props
 * @param {Object} props.fields - Field values and setters from useAuthForm
 * @param {boolean} props.showName - Show the name field
 * @param {boolean} props.showPassword - Show the password field
 * @param {string} props.mode - Form mode ('signin', 'signup', or 'forgot-password')
 */
export function AuthFields({ fields, showName, showPassword, mode }) {
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

function NameField({ name, setName }) {
  const handleChange = useCallback((e) => setName(e.target.value), [setName]);

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

function EmailField({ email, setEmail }) {
  const handleChange = useCallback((e) => setEmail(e.target.value), [setEmail]);

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

function PasswordField({ password, setPassword, mode }) {
  const handleChange = useCallback((e) => setPassword(e.target.value), [setPassword]);

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
