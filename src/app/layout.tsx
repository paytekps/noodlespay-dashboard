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
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
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
    if (role !== 'super_admin' && role !== 'admin') {
      setPreviewRole(null);
      sessionStorage.removeItem('gimml_preview_role');
      return;
    }

    const saved = sessionStorage.getItem('gimml_preview_role');
    if (saved === 'admin' || saved === 'sales_rep' || saved === 'merchant') {
      setPreviewRole(saved);
    }
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

  return (
    <html lang="en">
      <body>
        {!isDevice && (
          <div className="flex items-center justify-between bg-gray-800 p-4 text-white">
            <div className="flex items-center gap-4">
              {(effectiveRole === 'super_admin' || effectiveRole === 'admin') && <><Link href="/admin">Admin</Link>{effectiveRole === 'super_admin' && <Link href="/admin/users">Users &amp; Access</Link>}<Link href="/dashboard/devices">Devices</Link><Link href="/transactions">Transactions</Link></>}
              {effectiveRole === 'sales_rep' && <><Link href="/sales">Sales Home</Link><Link href="/dashboard/devices">Assigned Devices</Link><Link href="/transactions">Transactions</Link></>}
              {effectiveRole === 'merchant' && <><Link href="/dashboard">Merchant Home</Link><Link href="/dashboard/devices">My Devices</Link><Link href="/transactions">My Transactions</Link></>}
              {!effectiveRole && <Link href="/">Login</Link>}
            </div>
            {role && <div className="flex items-center gap-3">
              {canPreview && <label className="flex items-center gap-2 text-sm"><span>View as</span><select value={previewRole ?? 'off'} onChange={(event) => changePreview(event.target.value)} className="rounded bg-white px-2 py-1 text-gray-900"><option value="off">My account</option><option value="admin">Administrator</option><option value="sales_rep">Sales representative</option><option value="merchant">Merchant</option></select></label>}
              <span className="text-sm text-gray-300">{roleLabel(role)}</span>
              <button onClick={handleLogout} className="rounded bg-red-500 px-3 py-1">Logout</button>
            </div>}
          </div>
        )}
        {!isDevice && previewRole && <div className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900"><span>Preview mode: showing the {roleLabel(previewRole)} website. Your real account remains {role ? roleLabel(role) : 'Administrator'}.</span><button onClick={() => changePreview('off')} className="rounded border border-amber-500 px-3 py-1">Exit preview</button></div>}
        <div>{allowed ? children : <div className="p-10">Opening your dashboard...</div>}</div>
      </body>
    </html>
  );
}
