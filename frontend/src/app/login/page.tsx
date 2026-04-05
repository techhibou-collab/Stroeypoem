'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { getApiUrl, type UserAuthResponse } from '@/lib/api';
import { getUserToken, setUserSession } from '@/lib/user-auth';

type AuthMode = 'login' | 'register';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(() => searchParams.get('redirect') || '/', [searchParams]);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (getUserToken()) {
      router.replace(redirectPath);
    }
  }, [redirectPath, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch(getApiUrl(mode === 'login' ? '/api/users/login' : '/api/users/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = (await response.json()) as Partial<UserAuthResponse> & { error?: string };

      if (!response.ok || !data.token || !data.user) {
        throw new Error(data.error || `Unable to ${mode === 'login' ? 'login' : 'create account'}`);
      }

      setUserSession(data.token, data.user);
      router.replace(redirectPath);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to continue');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fffcf8,_#f7f3ec_70%)] px-4 py-6 font-serif text-[#4a3f35] selection:bg-[#8a735c]/30 sm:px-6">
      <div className="fixed inset-4 z-0 hidden pointer-events-none border-2 border-[#d8cbb8] sm:inset-6 sm:block">
        <div className="absolute inset-1 border border-[#d8cbb8]"></div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-md items-center">
        <div className="w-full rounded-3xl border-2 border-[#e8dfd5] bg-white/90 p-8 shadow-2xl shadow-[#d8cbb8]/50 backdrop-blur-xl sm:p-10">
          <div className="mb-8 text-center">
            <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.35em] text-[#8a735c]">Reader Access</p>
            <h1 className="text-3xl font-extrabold uppercase tracking-[0.18em] text-[#6b5846]">
              {mode === 'login' ? 'Login' : 'Create Account'}
            </h1>
            <p className="mt-4 font-sans text-sm text-[#8a735c]">
              Login with your email and password before reading any poem.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 font-sans">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
                mode === 'login' ? 'bg-[#8a735c] text-white' : 'border border-[#e8dfd5] text-[#8a735c] hover:bg-[#f7f3ec]'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors ${
                mode === 'register'
                  ? 'bg-[#8a735c] text-white'
                  : 'border border-[#e8dfd5] text-[#8a735c] hover:bg-[#f7f3ec]'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 font-sans">
            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full rounded-xl border-2 border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3.5 font-medium text-[#5a4838] outline-none transition-all placeholder:text-[#d1c2b3] focus:border-[#8a735c] focus:ring-[#8a735c]"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border-2 border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3.5 font-medium text-[#5a4838] outline-none transition-all placeholder:text-[#d1c2b3] focus:border-[#8a735c] focus:ring-[#8a735c]"
              />
            </div>

            {status === 'error' && message && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="flex w-full items-center justify-center rounded-xl border border-[#5a4838] bg-[#8a735c] px-4 py-4 text-base font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-[#6b5846] active:scale-[0.98] disabled:opacity-60"
            >
              {status === 'submitting'
                ? mode === 'login'
                  ? 'Signing In...'
                  : 'Creating Account...'
                : mode === 'login'
                  ? 'Login'
                  : 'Create Account'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="font-sans text-sm font-bold uppercase tracking-[0.2em] text-[#8a735c] transition-colors hover:text-[#5a4838]"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fffcf8,_#f7f3ec_70%)] font-serif text-[#8a735c]">
          Loading…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
