'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import { isUserRole, landingPageForRole } from '../lib/roles';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const router = useRouter();

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert(error.message);
      return;
    }

    // ✅ get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // ✅ get profile (CRITICAL FIX)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !isUserRole(profile.role)) {
      await supabase.auth.signOut();
      alert('This account does not have an assigned Gimml user type.');
      return;
    }

    router.push(landingPageForRole(profile.role));
  }

  return (
    <div className="p-10">
      <h1 className="text-xl font-bold">Gimml Login</h1>

      <input
        placeholder="Email"
        className="border p-2 block mt-4"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="Password"
        type="password"
        className="border p-2 block mt-2"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="bg-blue-500 text-white px-4 py-2 mt-4"
        onClick={handleLogin}
      >
        Login
      </button>
    </div>
  );
}
