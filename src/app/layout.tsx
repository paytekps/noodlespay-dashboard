'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { canAccessPath, isUserRole, landingPageForRole, roleLabel, type UserRole } from '../lib/roles';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const isDevice = pathname.startsWith('/device');
  const isPublicPage = pathname === '/' || isDevice;

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!active) return;
      setRole(isUserRole(data?.role) ? data.role : null);
      setLoading(false);
    }

    loadAccess();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void loadAccess();
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loading || isPublicPage) return;
    if (!role) {
      router.replace('/');
    } else if (!canAccessPath(role, pathname)) {
      router.replace(landingPageForRole(role));
    }
  }, [isPublicPage, loading, pathname, role, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setRole(null);
    router.push('/');
  }

  if (loading && !isDevice) {
    return <html lang="en"><body><div className="p-10">Loading...</div></body></html>;
  }

  const allowed = isPublicPage || Boolean(role && canAccessPath(role, pathname));

  return (
    <html lang="en">
      <body>
        {!isDevice && (
          <div className="flex items-center justify-between bg-gray-800 p-4 text-white">
            <div className="flex items-center gap-4">
              {(role === 'super_admin' || role === 'admin') && <><Link href="/admin">Admin</Link><Link href="/dashboard/devices">Devices</Link><Link href="/transactions">Transactions</Link></>}
              {role === 'sales_rep' && <><Link href="/sales">Sales Home</Link><Link href="/dashboard/devices">Assigned Devices</Link><Link href="/transactions">Transactions</Link></>}
              {role === 'merchant' && <><Link href="/dashboard">Merchant Home</Link><Link href="/dashboard/devices">My Devices</Link><Link href="/transactions">My Transactions</Link></>}
              {!role && <Link href="/">Login</Link>}
            </div>
            {role && <div className="flex items-center gap-3"><span className="text-sm text-gray-300">{roleLabel(role)}</span><button onClick={handleLogout} className="rounded bg-red-500 px-3 py-1">Logout</button></div>}
          </div>
        )}
        <div>{allowed ? children : <div className="p-10">Opening your dashboard...</div>}</div>
      </body>
    </html>
  );
}
