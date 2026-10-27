'use client';

/**
 * Navigation Bar Links
 *
 * The links Navbar shows to a signed-in user and to a visitor.
 */

import type { User } from '@volcano.dev/sdk';
import Link from 'next/link';
import type { JSX } from 'react';
import { useAsyncHandler } from '@/hooks/eventHandlers';

interface NavbarUserLinksProps {
  /** Current user */
  user: User;
  /** True if user is anonymous */
  isAnonymous: boolean;
  /** Sign out handler */
  signOut: () => Promise<unknown>;
}

export function NavbarUserLinks({ user, isAnonymous, signOut }: NavbarUserLinksProps): JSX.Element {
  const handleSignOut = useAsyncHandler(signOut);

  return (
    <>
      <Link href="/dashboard" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
        Dashboard
      </Link>

      <div className="flex items-center space-x-3">
        {/* User info */}
        <div className="text-sm text-gray-500">
          {isAnonymous ? (
            <span className="flex items-center">
              <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2" />
              Guest User
            </span>
          ) : (
            <span className="flex items-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2" />
              {user.email}
            </span>
          )}
        </div>

        {/* Sign out button */}
        <button
          onClick={handleSignOut}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          Sign Out
        </button>
      </div>
    </>
  );
}

export function NavbarGuestLinks(): JSX.Element {
  return (
    <>
      <Link href="/auth/signin" className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
        Sign In
      </Link>
      <Link
        href="/auth/signup"
        className="bg-volcano-600 hover:bg-volcano-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
      >
        Sign Up
      </Link>
    </>
  );
}
