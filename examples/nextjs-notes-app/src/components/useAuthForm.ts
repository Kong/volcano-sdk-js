'use client';

/**
 * Authentication Form Hook
 *
 * Holds AuthForm's field values and submits them.
 */

import type { UserMetadata } from '@volcano.dev/sdk';
import { type Dispatch, type SetStateAction, type SubmitEvent, useState } from 'react';

export type AuthMode = 'signin' | 'signup' | 'forgot-password';

/**
 * The values AuthForm submits
 */
export interface AuthFormValues {
  email: string;
  password: string;
  /** The user's name, when the form collects one */
  metadata: UserMetadata | undefined;
}

export type AuthFormSubmit = (values: AuthFormValues) => Promise<{ error: Error | null }>;

export interface AuthFormFieldValues {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
}

interface UseAuthFormOptions {
  mode: AuthMode;
  onSubmit: AuthFormSubmit;
  /** Whether the form collects a name */
  showName: boolean;
}

interface UseAuthFormReturn {
  fields: AuthFormFieldValues;
  success: boolean;
  handleSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
}

export function useAuthForm({ mode, onSubmit, showName }: UseAuthFormOptions): UseAuthFormReturn {
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

  const submit = async (): Promise<void> => {
    const result = await onSubmit({
      email,
      password,
      metadata: showName ? { name } : undefined,
    });

    // Show success message for password reset
    if (mode === 'forgot-password' && !result.error) {
      setSuccess(true);
    }
  };

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setSuccess(false);
    void submit();
  };

  return {
    fields: { email, setEmail, password, setPassword, name, setName },
    success,
    handleSubmit,
  };
}
