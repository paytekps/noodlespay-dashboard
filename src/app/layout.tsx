'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { canAccessPath, isPublicPath, isUserRole, landingPageForRole, roleLabel, type UserRole } from '../lib/roles';

const homeRoutes = new Set(['/admin', '/sales', '/dashboard']);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const isDevice = pathname.startsWith('/device');
  const isPublicPage = isPublicPath(pathname);
  const isMarketingPage = isPublicPage && !isDevice;

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setRole(null);
        setPermissions(new Set());
        setLoading(false);
        return;
      }

      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!active) return;
      const verifiedRole = isUserRole(data?.role) ? data.role : null;
      setRole(verifiedRole);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && verifiedRole) {
        const response = await fetch('/api/dashboard/access', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (active) setPermissions(new Set(response.ok && Array.isArray(payload.permissions) ? payload.permissions : []));
      } else {
        setPermissions(new Set());
      }
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
    setPermissions(new Set());
    router.push('/');
  }

  if (loading && !isDevice) {
    return <html lang="en"><body><div className="p-10">Loading...</div></body></html>;
  }

  const allowed = isPublicPage || Boolean(role && canAccessPath(role, pathname));
  const navClass = (href: string) => {
    const active = pathname === href || (!homeRoutes.has(href) && pathname.startsWith(`${href}/`));
    return `rounded px-3 py-2 text-sm font-medium transition ${active ? 'bg-white text-gray-900' : 'text-gray-200 hover:bg-gray-700 hover:text-white'}`;
  };

  return (
    <html lang="en">
      <body>
        {!isDevice && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900 px-4 py-3 text-white">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-3 text-lg font-bold tracking-tight">Gimml</span>
              {isMarketingPage ? <><Link className={navClass('/')} href="/">Home</Link><Link className={navClass('/how-it-works')} href="/how-it-works">How it works</Link><Link className={navClass('/pricing')} href="/pricing">Plans</Link><Link className={navClass('/contact')} href="/contact">Contact</Link></> : <>
                {permissions.has('overview.view') && <Link className={navClass(role === 'super_admin' || role === 'admin' ? '/admin' : role === 'sales_rep' ? '/sales' : '/dashboard')} href={role === 'super_admin' || role === 'admin' ? '/admin' : role === 'sales_rep' ? '/sales' : '/dashboard'}>Overview</Link>}
                {(role === 'super_admin' || role === 'admin') && <Link className={navClass('/admin/merchants')} href="/admin/merchants">Merchants</Link>}
                {permissions.has('devices.view') && <Link className={navClass('/dashboard/devices')} href="/dashboard/devices">Devices</Link>}
                {permissions.has('plans.view') && <Link className={navClass('/dashboard/terminal')} href="/dashboard/terminal">{role === 'merchant' ? 'Plans & Options' : 'Plans & Features'}</Link>}
                {permissions.has('transactions.view') && <Link className={navClass('/transactions')} href="/transactions">Transactions</Link>}
                {permissions.has('batches.view') && <Link className={navClass('/dashboard/settlements')} href="/dashboard/settlements">Batches</Link>}
                {permissions.has('integrations.view') && <Link className={navClass('/dashboard/integrations')} href="/dashboard/integrations">{role === 'super_admin' || role === 'admin' ? 'Integrations' : 'Integration Status'}</Link>}
                {(role === 'super_admin' || role === 'admin') && permissions.has('integrations.manage') && <Link className={navClass('/admin/closed-loop-tests')} href="/admin/closed-loop-tests">Card Testing</Link>}
                {(role === 'super_admin' || role === 'admin') && permissions.has('sales.manage') && <Link className={navClass('/admin/inquiries')} href="/admin/inquiries">Sales</Link>}
                {permissions.has('users.manage') && <Link className={navClass('/admin/users')} href="/admin/users">Users</Link>}
                {role === 'super_admin' && permissions.has('permissions.manage') && <Link className={navClass('/admin/permissions')} href="/admin/permissions">Permissions</Link>}
              </>}
            </div>
            {isMarketingPage ? <div className="flex items-center gap-2"><Link href="/signup" className="rounded bg-emerald-400 px-3 py-2 text-sm font-bold text-gray-950">Get started</Link><Link href={role ? landingPageForRole(role) : '/login'} className="rounded border border-gray-600 px-3 py-2 text-sm font-medium">{role ? 'Open dashboard' : 'Account login'}</Link></div> : role && <div className="flex items-center gap-3">
              <span className="text-sm text-gray-300">{roleLabel(role)}</span>
              <button onClick={handleLogout} className="rounded border border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-800">Sign out</button>
            </div>}
          </div>
        )}
        <div>{allowed ? children : <div className="p-10">Opening your dashboard...</div>}</div>
        {isMarketingPage && <footer className="border-t bg-white px-6 py-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 text-sm text-gray-600 sm:flex-row"><div><div className="font-bold text-gray-950">Gimml</div><div className="mt-1">Simple, ready-to-use donations and payments.</div></div><div className="flex flex-wrap gap-5"><Link href="/how-it-works">How it works</Link><Link href="/pricing">Plans</Link><Link href="/contact">Contact</Link><Link href="/login">Account login</Link></div></div></footer>}
      </body>
    </html>
  );
}
