'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ detect if we're on a device page
  const isDevice = pathname.startsWith('/device');

  useEffect(() => {
    async function loadRole() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data) setRole(data.role);

      setLoading(false);
    }

    loadRole();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <html lang="en">
        <body>
          <div className="p-10">Loading...</div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>

        {/* ✅ NAV BAR (hidden on device pages) */}
        {!isDevice && (
          <div className="flex justify-between items-center bg-gray-800 text-white p-4">

            <div className="flex gap-4">

              {role === 'admin' && (
                <>
                  <Link href="/admin">Settings</Link>
                  <Link href="/dashboard/devices">Devices</Link>
                  <Link href="/transactions">Transactions</Link>
                </>
              )}

              {role === 'sales_rep' && (
                <>
                  <Link href="/admin">Settings</Link>
                  <Link href="/dashboard/devices">Devices</Link>
                  <Link href="/transactions">Transactions</Link>
                </>
              )}

              {role === 'merchant' && (
                <>
                  <Link href="/dashboard/devices">Devices</Link>
                  <Link href="/transactions">Transactions</Link>
                </>
              )}

              {!role && (
                <Link href="/">Login</Link>
              )}

            </div>

            {/* ✅ LOGOUT */}
            {role && (
              <button
                onClick={handleLogout}
                className="bg-red-500 px-3 py-1 rounded"
              >
                Logout
              </button>
            )}

          </div>
        )}

        {/* ✅ PAGE CONTENT */}
        <div>{children}</div>

      </body>
    </html>
  );
}