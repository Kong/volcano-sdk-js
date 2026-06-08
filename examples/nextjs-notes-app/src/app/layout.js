/**
 * Root Layout
 *
 * This is the root layout for the entire application.
 * It wraps all pages with:
 * - Global styles (Tailwind CSS)
 * - AuthProvider (authentication state)
 * - Navbar (navigation)
 */

import './globals.css';

import { Navbar } from '@/components/Navbar';
import { AuthProvider } from '@/context/AuthContext';

// ---------------------------------------------------------------------------
// METADATA
// ---------------------------------------------------------------------------

export const metadata = {
  title: 'Volcano Notes - Example App',
  description: 'A notes application demonstrating the Volcano SDK',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌋</text></svg>',
  },
};

// ---------------------------------------------------------------------------
// LAYOUT COMPONENT
// ---------------------------------------------------------------------------

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        {/*
          AuthProvider wraps the entire app to provide authentication state.
          This allows any component to access user info via useAuth().
        */}
        <AuthProvider>
          {/* Navigation bar - shown on all pages */}
          <Navbar />

          {/* Main content */}
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
