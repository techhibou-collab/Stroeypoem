'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import UserSessionActions from '@/components/user-session-actions';
import { fetchApiJson, getApiUrl, type Poem } from '@/lib/api';

export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  const poemId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [poem, setPoem] = useState<Poem | null>(null);
  const [userName, setUserName] = useState('');
  const [upiRefId, setUpiRefId] = useState('');
  const [selectedScreenshot, setSelectedScreenshot] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadPoem = async () => {
      if (!poemId) {
        setStatus('error');
        setMessage('Invalid poem selected.');
        return;
      }

      try {
        const poemData = await fetchApiJson<Poem>(`/api/poems/${encodeURIComponent(poemId)}`);
        setPoem(poemData);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to load poem details.');
      }
    };

    void loadPoem();
  }, [poemId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (!poemId || !userName.trim() || !upiRefId.trim()) {
      return;
    }

    setStatus('submitting');
    setMessage('');

    const payload = new FormData();
    payload.append('poemId', poemId);
    payload.append('userName', userName.trim());
    payload.append('upiRefId', upiRefId.trim());

    if (selectedScreenshot) {
      payload.append('paymentScreenshot', selectedScreenshot);
    }

    try {
      const response = await fetch(getApiUrl('/api/payments'), {
        method: 'POST',
        body: payload,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit payment');
      }

      setStatus('success');
      setMessage(data.message || 'Payment submitted for approval');
      form.reset();
      setSelectedScreenshot(null);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unable to submit payment');
    }
  };

  return (
    <div className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,_#fffcf8,_#f7f3ec_70%)] px-4 py-4 font-serif text-[#4a3f35] selection:bg-[#8a735c]/30 sm:px-6">
      <div className="fixed inset-4 z-0 hidden border-2 border-[#d8cbb8] pointer-events-none sm:inset-6 sm:block">
        <div className="absolute inset-1 border border-[#d8cbb8]"></div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-2rem)] max-w-5xl items-center">
        <div className="w-full overflow-hidden rounded-3xl border-2 border-[#e8dfd5] bg-white/90 p-5 shadow-2xl shadow-[#d8cbb8]/50 backdrop-blur-xl sm:p-6 lg:p-7">
          <div className="mb-5 text-center lg:mb-6">
            <div className="mb-4 flex justify-end">
              <UserSessionActions showLogin={false} />
            </div>
            <h1 className="mb-2 text-2xl font-extrabold uppercase tracking-[0.28em] text-[#6b5846] sm:text-3xl">Unlock Poem</h1>
            <p className="font-sans text-sm font-medium tracking-wide text-[#8a735c]">
              Pay via UPI to unlock reading and music{poem ? ` for ${poem.title}.` : '.'}
            </p>
            <div className="my-3 flex w-full justify-center opacity-70">
              <span className="text-xl text-[#8a735c]">* * *</span>
            </div>
          </div>

          {status === 'success' ? (
            <div className="animate-in zoom-in-95 py-6 text-center font-sans duration-500">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#c3e6cb] bg-[#f0f8f3] shadow-inner">
                <span className="text-3xl">OK</span>
              </div>
              <h2 className="mb-3 font-serif text-2xl font-bold italic text-[#3d684a]">Payment Submitted</h2>
              <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-[#6b5846]">
                {message || 'Thank you. Our team is verifying your payment.'}
                <br />
                Reference ID <strong className="rounded bg-[#f7f3ec] px-2 py-1 font-mono">#{upiRefId}</strong>
              </p>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-full border border-[#6b5846] bg-[#8a735c] px-6 py-3.5 text-sm font-bold uppercase tracking-widest text-white shadow-md transition-all hover:bg-[#6b5846] active:scale-95"
              >
                Return to Home
              </Link>
            </div>
          ) : (
            <div className="grid items-stretch gap-4 lg:grid-cols-[0.9fr,1.1fr] lg:gap-5">
              <div className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-[#e8dfd5] bg-[#fdfcfb] p-4 lg:p-5">
                <div className="absolute top-0 left-0 h-1 w-full bg-[#8a735c]/20"></div>
                <span className="mb-1 font-sans text-[11px] font-bold uppercase tracking-[0.24em] text-[#8a735c]">
                  Amount to Pay
                </span>
                <span className="mb-1 text-4xl text-[#5a4838] sm:text-5xl">Rs {Number(poem?.price || 0)}</span>
                {poem && <span className="mb-4 text-center text-sm font-semibold text-[#8a735c]">{poem.title}</span>}

                <div className="mb-4 flex h-36 w-36 items-center justify-center rounded-xl border border-[#e8dfd5] bg-white p-2 shadow-inner sm:h-40 sm:w-40">
                  <div className="flex h-full w-full items-center justify-center rounded-lg border-4 border-dashed border-[#8a735c]/50 transition-colors hover:border-[#8a735c]">
                    <span className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-[#6b5846]/70">QR CODE</span>
                  </div>
                </div>

                <div className="flex w-full flex-col items-center font-sans">
                  <span className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#8a735c]">UPI ID</span>
                  <span className="w-full rounded-lg border border-[#e8dfd5] bg-[#f7f3ec] px-4 py-2 text-center font-mono text-sm font-bold tracking-tight text-[#6b563b] shadow-sm">
                    poetryhub@upi
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col justify-between gap-4 font-sans">
                <div className="grid gap-4">
                  <div>
                    <label htmlFor="userName" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                      User Name
                    </label>
                    <input
                      id="userName"
                      type="text"
                      required
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full rounded-xl border-2 border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3 font-medium text-[#5a4838] outline-none transition-all placeholder:text-[#d1c2b3] focus:border-[#8a735c] focus:ring-[#8a735c]"
                    />
                  </div>

                  <div>
                    <label htmlFor="refId" className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                      12-digit UPI Reference ID
                    </label>
                    <input
                      id="refId"
                      type="text"
                      required
                      maxLength={12}
                      value={upiRefId}
                      onChange={(e) => setUpiRefId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="e.g. 123456789012"
                      className="w-full rounded-xl border-2 border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3 font-mono text-base font-medium text-[#5a4838] outline-none transition-all placeholder:text-[#d1c2b3] focus:border-[#8a735c] focus:ring-[#8a735c]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8a735c]">
                      Payment Screenshot
                      <span className="text-[10px] font-medium text-[#a89684]">(Optional)</span>
                    </label>
                    <label className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-[#e8dfd5] bg-[#fdfcfb] px-4 py-3 text-center text-sm font-bold uppercase tracking-wider text-[#8a735c] shadow-sm transition-colors hover:border-[#8a735c]/50 hover:bg-[#8a735c]/5">
                      {selectedScreenshot?.name || '+ Attach File'}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => setSelectedScreenshot(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {status === 'error' && message && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={status === 'submitting' || !poemId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#5a4838] bg-[#8a735c] px-4 py-3 text-base font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-[#6b5846] active:scale-[0.98] disabled:opacity-60"
                >
                  {status === 'submitting' ? 'Submitting...' : 'Submit Details'}
                </button>
              </form>
            </div>
          )}

          <div className="mt-5 text-center">
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
