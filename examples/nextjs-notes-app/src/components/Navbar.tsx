'use client';

/**
 * Navigation Bar Component
 *
 * Displays navigation and user status.
 * Shows different options based on authentication state.
 */

import Link from 'next/link';
import type { JSX } from 'react';
import { useAuth } from '@/context/AuthContext';
import { NavbarGuestLinks, NavbarUserLinks } from './NavbarLinks';

export function Navbar(): JSX.Element {
  const { user, isAnonymous, signOut, loading } = useAuth();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo / Brand */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl">🌋</span>
              <span className="font-bold text-xl text-gray-900">Volcano Notes</span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-4">
            {loading ? (
              // Loading skeleton
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
            ) : user === null ? (
              // Not authenticated
              <NavbarGuestLinks />
            ) : (
              // Authenticated user
              <NavbarUserLinks user={user} isAnonymous={isAnonymous} signOut={signOut} />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
