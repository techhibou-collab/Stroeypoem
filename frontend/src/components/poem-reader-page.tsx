'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import UserSessionActions from '@/components/user-session-actions';
import { ApiError, fetchApiJson, type Poem, type PoemPage, type PoemReadResponse } from '@/lib/api';
import { stopAllPoemAudio } from '@/lib/audio';
import { clearUserSession, getUserAuthHeaders, getUserToken } from '@/lib/user-auth';

type PoemReaderPageProps = {
  poemId?: string | null;
  poemTitle?: string | null;
};

const priceFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

const isAssetUrl = (value: string) => /^https?:\/\//i.test(value);
const isImageUrl = (value: string) =>
  isAssetUrl(value) && /\.(avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(value);

export default function PoemReaderPage({ poemId, poemTitle }: PoemReaderPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const redirectPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const [poem, setPoem] = useState<Poem | null>(null);
  const [pages, setPages] = useState<PoemPage[]>([]);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [musicPlayBlocked, setMusicPlayBlocked] = useState(false);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const token = getUserToken();

    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    setIsCheckingUser(false);
  }, [redirectPath, router]);

  useEffect(() => {
    let isCancelled = false;

    const loadPoem = async () => {
      if (isCheckingUser) {
        return;
      }

      if (!poemId && !poemTitle) {
        setPoem(null);
        setPages([]);
        setHasMorePages(false);
        setIsPurchased(false);
        setCurrentPage(0);
        setErrorMessage('Poem title is required.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        const poemData = poemId
          ? await fetchApiJson<Poem>(`/api/poems/${encodeURIComponent(poemId)}`)
          : await fetchApiJson<Poem>(
              `/api/poems/by-title?title=${encodeURIComponent(String(poemTitle || ''))}`,
            );

        const readData = await fetchApiJson<PoemReadResponse>(`/api/poems/${poemData.id}/read`, {
          headers: getUserAuthHeaders(),
        });

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setPoem(poemData);
          setPages(readData.pages);
          setHasMorePages(readData.hasMorePages);
          setIsPurchased(readData.isPurchased);
          setCurrentPage(0);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearUserSession();
          router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
          return;
        }

        const reason = error instanceof Error ? error.message : 'Unable to load poem';

        startTransition(() => {
          setPoem(null);
          setPages([]);
          setHasMorePages(false);
          setIsPurchased(false);
          setErrorMessage(reason);
        });
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPoem();

    return () => {
      isCancelled = true;
    };
  }, [isCheckingUser, poemId, poemTitle, redirectPath, router]);

  useEffect(() => {
    const el = backgroundMusicRef.current;
    const url = poem?.music_file_url;

    if (!el || !url || !isPurchased) {
      setMusicPlayBlocked(false);
      return;
    }

    el.loop = true;
    el.volume = 0.85;

    const tryPlay = () => {
      void el.play().catch(() => {
        setMusicPlayBlocked(true);
      });
    };

    setMusicPlayBlocked(false);
    tryPlay();

    return () => {
      el.pause();
      el.currentTime = 0;
      try {
        el.removeAttribute('src');
        el.load();
      } catch {
        // ignore
      }
      setMusicPlayBlocked(false);
    };
  }, [poem?.id, poem?.music_file_url, isPurchased]);

  const pageTheme = {
    bg: 'bg-[#f4eee6]',
    text: 'text-[#6b563b]',
    border: 'border-[#d8cbb8]',
    accent: 'bg-[#8a7251] text-white',
  };

  const totalPages = 1 + pages.length + (hasMorePages && !isPurchased ? 1 : 0);
  const lastPreviewPage = pages.length;
  const isLocked = !isPurchased && hasMorePages && currentPage > lastPreviewPage;
  const currentContent = currentPage > 0 ? pages[currentPage - 1] : null;

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const musicUrl = poem?.music_file_url && isPurchased ? poem.music_file_url : null;

  const handlePlayMusicClick = () => {
    const el = backgroundMusicRef.current;
    if (!el) {
      return;
    }

    void el.play().then(() => setMusicPlayBlocked(false)).catch(() => {
      setMusicPlayBlocked(true);
    });
  };

  const handleProceedToPayment = () => {
    stopAllPoemAudio();
  };

  return (
    <div
      className={`min-h-screen ${pageTheme.bg} ${pageTheme.text} flex flex-col overflow-hidden font-serif selection:bg-[#d8cbb8]/50`}
    >
      {musicUrl ? (
        <audio
          ref={backgroundMusicRef}
          src={musicUrl}
          loop
          playsInline
          preload="auto"
          className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
          aria-hidden
          data-poem-background="true"
        />
      ) : null}

      <div className="fixed inset-4 z-0 hidden border-2 border-[#d8cbb8] pointer-events-none sm:inset-6 sm:block">
        <div className="absolute inset-1 border border-[#d8cbb8]"></div>
      </div>

      <header className={`sticky top-0 z-50 border-b ${pageTheme.border} bg-[#f4eee6]/80 backdrop-blur-md`}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-[#8a7251] ${pageTheme.text}`}
          >
            Back
          </Link>

          <div className="flex items-center gap-4">
            <span
              className={`rounded-full px-4 py-1.5 text-xs font-sans tracking-wide shadow-sm ${
                poem?.music_file_url && isPurchased ? 'bg-[#8a7251] text-white' : 'bg-[#e5ddd3] text-[#8a7251]'
              }`}
            >
              {poem?.music_file_url && isPurchased ? 'Music Ready' : 'Music Locked'}
            </span>
            {musicPlayBlocked && musicUrl ? (
              <button
                type="button"
                onClick={handlePlayMusicClick}
                className="rounded-full border border-[#8a7251] bg-[#fdfcfb] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#6b5846] shadow-sm transition-colors hover:bg-[#e5ddd3]"
              >
                Play music
              </button>
            ) : null}
            <UserSessionActions showLogin={false} />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-center p-6 sm:p-12 lg:w-4/5 xl:w-[800px]">
        <div className="relative flex min-h-[50vh] w-full flex-col items-center justify-center">
          {isLoading ? (
            <div className="w-full max-w-xl rounded-3xl border border-[#d8cbb8] bg-white/70 px-8 py-14 text-center shadow-sm">
              <p className="text-lg font-sans text-[#8a7251]">
                {isCheckingUser ? 'Checking reader session...' : 'Loading poem...'}
              </p>
            </div>
          ) : errorMessage || !poem ? (
            <div className="w-full max-w-xl rounded-3xl border border-[#d8cbb8] bg-white/70 px-8 py-14 text-center shadow-sm">
              <h1 className="text-3xl font-bold text-[#6b563b]">Poem unavailable</h1>
              <p className="mt-4 text-sm font-sans text-[#8a7251]">
                {errorMessage || 'We could not find this poem in the database.'}
              </p>
              <Link
                href="/"
                className="mt-8 inline-flex items-center justify-center rounded-full bg-[#8a7251] px-6 py-3 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-[#6b563b]"
              >
                Back to Home
              </Link>
            </div>
          ) : !isLocked ? (
            <div className="flex h-full w-full animate-in fade-in flex-col items-center justify-center duration-700 ease-out">
              {currentPage === 0 ? (
                <div className="-mt-4 w-full space-y-6 text-center sm:-mt-6">
                  <h1
                    className="mx-auto max-w-sm text-4xl font-extrabold uppercase leading-tight tracking-widest text-[#796349] sm:text-5xl md:text-6xl"
                    style={{ textShadow: '1px 1px 0px rgba(255,255,255,0.7)' }}
                  >
                    {poem.title}
                  </h1>

                  <div className="flex w-full justify-center opacity-70">
                    <span className="text-3xl text-[#9c8466] sm:text-4xl">*</span>
                  </div>

                  <div className="relative mx-auto h-52 w-52 transform transition-transform duration-700 hover:scale-105 sm:h-64 sm:w-64 md:h-72 md:w-72">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={poem.cover_image_url || 'https://via.placeholder.com/600x800/f5efe6/6b5846?text=Poetry+Hub'}
                      alt={poem.title}
                      className="h-full w-full rounded-[50%] object-contain drop-shadow-2xl mix-blend-multiply"
                    />
                  </div>

                  <div className="mx-auto mt-8 max-w-2xl text-center text-[#796349]">
                    <p className="font-sans text-sm uppercase tracking-[0.28em] text-[#8a7251] sm:text-base">Description</p>
                    <p className="mt-3 text-base italic leading-7 sm:text-lg sm:leading-relaxed">
                      {poem.description || 'No description added yet.'}
                    </p>
                    <p className="mt-4 font-sans text-sm font-semibold uppercase tracking-[0.28em] text-[#8a7251]">
                      Price: Rs {priceFormatter.format(Number(poem.price) || 0)}
                    </p>
                    <div className="mt-1 flex w-full justify-center opacity-60">
                      <span className="text-xl">* * *</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-xl space-y-8 px-4 text-center">
                  <div className="mb-8 flex justify-center opacity-40">
                    <span className="text-2xl text-[#8a7251]">*</span>
                  </div>

                  {currentContent ? (
                    currentContent.content === '[PDF_PAGE]' && poem.pdf_file_url ? (
                      <div className="w-full h-[70vh] rounded-2xl overflow-hidden border border-[#d8cbb8] shadow-inner">
                        <iframe
                          src={`${poem.pdf_file_url}#page=${currentContent.page_number}&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                          className="w-full h-full border-0"
                          title={`PDF Page ${currentContent.page_number}`}
                        />
                      </div>
                    ) : isImageUrl(currentContent.content) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={currentContent.content}
                        alt={`${poem.title} page ${currentContent.page_number}`}
                        className="mx-auto max-h-[60vh] rounded-3xl object-contain shadow-xl"
                      />
                    ) : (
                      <p
                        className={`whitespace-pre-line text-2xl font-medium leading-[2.2] sm:text-2xl md:text-3xl ${pageTheme.text}`}
                      >
                        {currentContent.content}
                      </p>
                    )
                  ) : (
                    <p className={`font-sans text-lg leading-8 ${pageTheme.text}`}>
                      No preview content is available for this page yet.
                    </p>
                  )}

                  <div className="mt-12 flex justify-center opacity-40">
                    <span className="text-2xl text-[#8a7251]">*</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`z-20 mx-auto w-full max-w-md animate-in zoom-in-95 rounded-2xl border-2 ${pageTheme.border} ${pageTheme.bg} p-8 text-center font-sans shadow-2xl duration-500 sm:p-12`}
            >
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-[#d8cbb8] bg-[#ebddca] shadow-inner">
                <span className="select-none text-3xl">LOCK</span>
              </div>
              <h2 className="mb-4 font-serif text-3xl font-bold text-[#6b563b]">Story Locked</h2>
              <p className="mx-auto mb-8 max-w-sm text-[#8a7251]">
                Unlock the rest of this poetry collection and enable the background music.
              </p>

              <div className="mx-auto mb-8 flex max-w-xs items-center justify-between rounded-xl border border-[#d8cbb8] bg-white/50 p-4">
                <span className="font-medium text-[#8a7251]">Full Access</span>
                <span className="text-2xl font-bold text-[#6b563b]">
                  Rs {priceFormatter.format(Number(poem.price) || 0)}
                </span>
              </div>

              <Link
                href={`/payments/${poem.id}`}
                onClick={handleProceedToPayment}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-bold transition-transform hover:shadow-lg active:scale-95 ${pageTheme.accent} shadow-md`}
              >
                Proceed to Payment
              </Link>
            </div>
          )}
        </div>

        <div
          className={`relative z-10 mt-8 mb-4 flex w-full shrink-0 items-center justify-between border-t ${pageTheme.border} bg-[#f4eee6]/90 px-2 pt-4 pb-5 font-sans`}
        >
          <button
            onClick={handlePrev}
            disabled={currentPage === 0}
            className={`group flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-all ${
              currentPage === 0 ? 'opacity-30' : 'text-[#8a7251] hover:bg-[#e5ddd3] hover:text-[#6b563b]'
            }`}
          >
            Prev
          </button>

          <span className="flex items-center gap-3 text-sm font-medium uppercase tracking-widest text-[#8a7251]">
            <span className="block h-px w-12 bg-[#d8cbb8]"></span>
            Page {Math.min(currentPage + 1, Math.max(totalPages, 1))}
            <span className="block h-px w-12 bg-[#d8cbb8]"></span>
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages - 1}
            className={`group flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-all ${
              currentPage >= totalPages - 1 ? 'opacity-30' : 'text-[#8a7251] hover:bg-[#e5ddd3] hover:text-[#6b563b]'
            }`}
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
