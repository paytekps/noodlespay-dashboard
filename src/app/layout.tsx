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
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
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
    const timer = window.setTimeout(() => {
      if (role !== 'super_admin' && role !== 'admin') {
        setPreviewRole(null);
        sessionStorage.removeItem('gimml_preview_role');
        return;
      }

      const saved = sessionStorage.getItem('gimml_preview_role');
      if (saved === 'admin' || saved === 'sales_rep' || saved === 'merchant') {
        setPreviewRole(saved);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [role]);

  const effectiveRole = previewRole ?? role;

  useEffect(() => {
    if (loading || isPublicPage) return;
    if (!effectiveRole) {
      router.replace('/');
    } else if (!canAccessPath(effectiveRole, pathname)) {
      router.replace(landingPageForRole(effectiveRole));
    }
  }, [effectiveRole, isPublicPage, loading, pathname, router]);

  function changePreview(value: string) {
    if (value === 'off') {
      sessionStorage.removeItem('gimml_preview_role');
      setPreviewRole(null);
      if (role) router.push(landingPageForRole(role));
      return;
    }

    if (value === 'admin' || value === 'sales_rep' || value === 'merchant') {
      sessionStorage.setItem('gimml_preview_role', value);
      setPreviewRole(value);
      router.push(landingPageForRole(value));
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('gimml_preview_role');
    setPreviewRole(null);
    setRole(null);
    router.push('/');
  }

  if (loading && !isDevice) {
    return <html lang="en"><body><div className="p-10">Loading...</div></body></html>;
  }

  const allowed = isPublicPage || Boolean(effectiveRole && canAccessPath(effectiveRole, pathname));
  const canPreview = role === 'super_admin' || role === 'admin';
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
                {(effectiveRole === 'super_admin' || effectiveRole === 'admin') && <><Link className={navClass('/admin')} href="/admin">Overview</Link><Link className={navClass('/admin/merchants')} href="/admin/merchants">Merchants</Link><Link className={navClass('/dashboard/devices')} href="/dashboard/devices">Devices</Link><Link className={navClass('/dashboard/terminal')} href="/dashboard/terminal">Plans &amp; Features</Link><Link className={navClass('/transactions')} href="/transactions">Transactions</Link><Link className={navClass('/dashboard/settlements')} href="/dashboard/settlements">Batches</Link><Link className={navClass('/dashboard/integrations')} href="/dashboard/integrations">Integrations</Link><Link className={navClass('/admin/closed-loop-tests')} href="/admin/closed-loop-tests">Card Testing</Link><Link className={navClass('/admin/inquiries')} href="/admin/inquiries">Sales</Link>{effectiveRole === 'super_admin' && <><Link className={navClass('/admin/users')} href="/admin/users">Users</Link><Link className={navClass('/admin/permissions')} href="/admin/permissions">Permissions</Link></>}</>}
                {effectiveRole === 'sales_rep' && <><Link className={navClass('/sales')} href="/sales">Overview</Link><Link className={navClass('/dashboard/devices')} href="/dashboard/devices">Devices</Link><Link className={navClass('/transactions')} href="/transactions">Transactions</Link><Link className={navClass('/dashboard/settlements')} href="/dashboard/settlements">Batches</Link><Link className={navClass('/dashboard/integrations')} href="/dashboard/integrations">Integration Status</Link></>}
                {effectiveRole === 'merchant' && <><Link className={navClass('/dashboard')} href="/dashboard">Overview</Link><Link className={navClass('/dashboard/devices')} href="/dashboard/devices">Devices</Link><Link className={navClass('/dashboard/terminal')} href="/dashboard/terminal">Plans &amp; Options</Link><Link className={navClass('/transactions')} href="/transactions">Transactions</Link><Link className={navClass('/dashboard/settlements')} href="/dashboard/settlements">Batches</Link><Link className={navClass('/dashboard/integrations')} href="/dashboard/integrations">Integration Status</Link></>}
              </>}
            </div>
            {isMarketingPage ? <div className="flex items-center gap-2"><Link href="/signup" className="rounded bg-emerald-400 px-3 py-2 text-sm font-bold text-gray-950">Get started</Link><Link href={role ? landingPageForRole(role) : '/login'} className="rounded border border-gray-600 px-3 py-2 text-sm font-medium">{role ? 'Open dashboard' : 'Account login'}</Link></div> : role && <div className="flex items-center gap-3">
              {canPreview && <label className="flex items-center gap-2 text-sm"><span>View as</span><select value={previewRole ?? 'off'} onChange={(event) => changePreview(event.target.value)} className="rounded bg-white px-2 py-1 text-gray-900"><option value="off">My account</option><option value="admin">Administrator</option><option value="sales_rep">Sales representative</option><option value="merchant">Merchant</option></select></label>}
              <span className="text-sm text-gray-300">{roleLabel(role)}</span>
              <button onClick={handleLogout} className="rounded border border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-800">Sign out</button>
            </div>}
          </div>
        )}
        {!isDevice && previewRole && <div className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900"><span>Preview mode: showing the {roleLabel(previewRole)} website. Your real account remains {role ? roleLabel(role) : 'Administrator'}.</span><button onClick={() => changePreview('off')} className="rounded border border-amber-500 px-3 py-1">Exit preview</button></div>}
        <div>{allowed ? children : <div className="p-10">Opening your dashboard...</div>}</div>
        {isMarketingPage && <footer className="border-t bg-white px-6 py-10"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 text-sm text-gray-600 sm:flex-row"><div><div className="font-bold text-gray-950">Gimml</div><div className="mt-1">Simple, ready-to-use donations and payments.</div></div><div className="flex flex-wrap gap-5"><Link href="/how-it-works">How it works</Link><Link href="/pricing">Plans</Link><Link href="/contact">Contact</Link><Link href="/login">Account login</Link></div></div></footer>}
      </body>
    </html>
  );
}
