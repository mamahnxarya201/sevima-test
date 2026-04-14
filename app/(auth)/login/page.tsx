'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password });
      if (authError) {
        setError(authError.message ?? 'Login failed');
        return;
      }
      router.replace('/');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf5]">
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#3a6095] flex items-center justify-center shrink-0">
              <MaterialIcon icon="account_tree" className="text-white text-xl" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            FlowForge
          </h1>
          <p className="text-sm text-stone-500 mt-1">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-[0_8px_40px_rgb(0,0,0,0.04)] p-8">
          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-50/80 border border-red-200 text-sm text-red-700 animate-in fade-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-stone-800 mb-2">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-stone-200/80 text-sm bg-white/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/5 focus:border-stone-400 transition-all placeholder:text-stone-400"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-800 mb-2">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border border-stone-200/80 text-sm bg-white/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/5 focus:border-stone-400 transition-all placeholder:text-stone-400"
                placeholder="••••••••"
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-2xl text-sm font-bold bg-stone-900 text-white hover:bg-stone-800 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all active:scale-[0.98]"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-stone-500 mt-4">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-stone-900 font-medium hover:underline">
            Register workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
