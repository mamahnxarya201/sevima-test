'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/auth-client';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    tenantName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.adminPassword !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName: form.tenantName,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Registration failed');
        return;
      }

      const tenantId = data.tenant.id;

      // 2. Register the user via Better Auth
      const { error: signUpError } = await authClient.signUp.email({
        email: form.adminEmail,
        password: form.adminPassword,
        name: form.adminEmail.split('@')[0],
        role: 'ADMIN',
        tenantId: tenantId,
      } as any);

      if (signUpError) {
        setError(signUpError.message ?? 'Auth registration failed');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.replace('/login'), 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf5]">
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#3a6095] flex items-center justify-center shrink-0">
              <MaterialIcon icon="account_tree" className="text-white text-xl" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            FlowForge
          </h1>
          <p className="text-sm text-stone-500 mt-1">Set up your isolated workflow tenant</p>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-[0_8px_40px_rgb(0,0,0,0.04)] p-8">
          {success ? (
            <div className="text-center py-6 animate-in fade-in slide-in-from-bottom-2">
              <div className="text-4xl mb-4">✨</div>
              <p className="text-base font-semibold text-stone-800">Workspace provisioned!</p>
              <p className="text-sm text-stone-500 mt-1">Taking you to the canvas...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-50/80 border border-red-200 text-sm text-red-700 animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                {[
                  { id: 'tenantName', label: 'Workspace Name', type: 'text', placeholder: 'Acme Corp', key: 'tenantName' as const },
                  { id: 'adminEmail', label: 'Admin Email', type: 'email', placeholder: 'admin@acme.com', key: 'adminEmail' as const },
                  { id: 'adminPassword', label: 'Password', type: 'password', placeholder: '••••••••', key: 'adminPassword' as const },
                  { id: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: '••••••••', key: 'confirmPassword' as const },
                ].map(({ id, label, type, placeholder, key }) => (
                  <div key={id}>
                    <label className="block text-sm font-semibold text-stone-800 mb-2">{label}</label>
                    <input
                      id={id}
                      type={type}
                      required
                      value={form[key]}
                      onChange={update(key)}
                      className="w-full px-4 py-3 rounded-2xl border border-stone-200/80 text-sm bg-white/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-stone-900/5 focus:border-stone-400 transition-all placeholder:text-stone-400"
                      placeholder={placeholder}
                    />
                  </div>
                ))}

                <button
                  id="register-submit"
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-2xl text-sm font-bold bg-stone-900 text-white hover:bg-stone-800 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all active:scale-[0.98] mt-2"
                >
                  {loading ? 'Provisioning engine...' : 'Deploy Workspace'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-stone-500 mt-4">
          Already have a workspace?{' '}
          <Link href="/login" className="text-stone-900 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
