'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { isUserRole, landingPageForRole } from '../../lib/roles';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) { setError('The email or password was not accepted.'); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Your account could not be loaded. Please try again.'); setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !isUserRole(profile.role)) { await supabase.auth.signOut(); setError('This account does not have an assigned Gimml user type.'); setLoading(false); return; }
    router.push(landingPageForRole(profile.role));
  }

  return <main className="mx-auto max-w-md px-6 py-20"><Link href="/" className="text-sm font-semibold text-emerald-700">← Back to Gimml</Link><div className="mt-6 rounded-2xl border bg-white p-8 shadow-sm"><h1 className="text-3xl font-black">Account login</h1><p className="mt-2 text-gray-600">For owners, administrators, sales representatives, and merchants.</p>{error && <div className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}<form onSubmit={handleLogin} className="mt-6 space-y-4"><label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="block text-sm font-medium">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><button disabled={loading} className="w-full rounded-lg bg-gray-950 px-4 py-3 font-bold text-white disabled:opacity-50">{loading ? 'Signing in...' : 'Sign in'}</button></form></div></main>;
}
