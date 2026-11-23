'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, MapPin, BarChart3, ShieldCheck } from 'lucide-react';

export default function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <div className="app-canvas relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-10 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="animate-fade-up relative w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 text-center">
          <div className="bg-brand-gradient mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-xl shadow-teal-900/30 ring-1 ring-white/20">
            <MapPin className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            <span className="text-brand-gradient">Qorannoo Dhibayyuu</span>
          </h1>
          <p className="mt-1 text-sm font-medium text-teal-900/70">
            Dhibayyuu Sub-City Data Collection Platform
          </p>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-teal-900/45">
            <BarChart3 className="h-3.5 w-3.5" />
            Industry · Hotel · Health · Education · Agriculture
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-3xl border border-teal-100 bg-white/85 p-6 shadow-xl shadow-teal-900/10 backdrop-blur-sm sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="bg-brand-gradient w-full shadow-lg shadow-teal-700/25"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-[11px] leading-relaxed text-teal-900/70">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
            <p>
              Authorized survey staff only. Contact the Dhibayyuu Sub-City
              administration office for an account.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-teal-900/40">
          Dhibayyuu Sub-City · Bishoftu City Administration
        </p>
      </div>
    </div>
  );
}
