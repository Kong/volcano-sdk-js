'use client';

/**
 * Navigation Bar Component
 *
 * Displays navigation and user status.
 * Shows different options based on authentication state.
 */

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export function Navbar() {
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
            ) : user ? (
              // Authenticated user
              <>
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
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
                    onClick={signOut}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              // Not authenticated
              <>
                <Link
                  href="/auth/signin"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="bg-volcano-600 hover:bg-volcano-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
