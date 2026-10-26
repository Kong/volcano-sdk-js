'use client';

/**
 * Authentication Form Hook
 *
 * Holds AuthForm's field values and submits them.
 */

import { useState } from 'react';

/**
 * @param {Object} options
 * @param {string} options.mode - Form mode ('signin', 'signup', or 'forgot-password')
 * @param {Function} options.onSubmit - Submit handler
 * @param {boolean} options.showName - Whether the form collects a name
 */
export function useAuthForm({ mode, onSubmit, showName }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [success, setSuccess] = useState(false);

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

  return {
    fields: { email, setEmail, password, setPassword, name, setName },
    success,
    handleSubmit,
  };
}
