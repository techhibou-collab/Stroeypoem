'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import PoemPdfFlipbook from '@/components/poem-pdf-flipbook';
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
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfTocOpen, setPdfTocOpen] = useState(false);
  const [pageTurnNonce, setPageTurnNonce] = useState(0);
  const [pageTurnDirection, setPageTurnDirection] = useState<'forward' | 'backward'>('forward');
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
          setPageTurnNonce(0);
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
  const currentContent = currentPage > 0 && currentPage <= pages.length ? pages[currentPage - 1] : null;
  const usePdfFlipbook =
    Boolean(poem?.pdf_file_url) &&
    pages.length > 0 &&
    pages.every((p) => p.content === '[PDF_PAGE]');
  const pdfReadingMode = Boolean(usePdfFlipbook && currentPage > 0);

  useEffect(() => {
    if (!pdfReadingMode) {
      setPdfTocOpen(false);
    }
  }, [pdfReadingMode]);

  useEffect(() => {
    if (usePdfFlipbook) {
      return;
    }
    if (currentContent?.content === '[PDF_PAGE]') {
      setIsPdfLoading(true);
    }
  }, [currentPage, currentContent, usePdfFlipbook]);

  const moveToPage = (pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= totalPages || pageIndex === currentPage) {
      return;
    }

    if (!pdfReadingMode) {
      setPageTurnDirection(pageIndex > currentPage ? 'forward' : 'backward');
      setPageTurnNonce((prev) => prev + 1);
    }

    setCurrentPage(pageIndex);
  };

  const handleNext = () => {
    if (currentPage < totalPages - 1) {
      moveToPage(currentPage + 1);
    }
  };

  const goToPage = (pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < totalPages) {
      moveToPage(pageIndex);
    }
  };

  const handlePrev = () => {
    if (currentPage > 0) {
      moveToPage(currentPage - 1);
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

  const readerPaperAnimationClass =
    pageTurnNonce > 0
      ? pageTurnDirection === 'forward'
        ? 'reader-paper-sheet--turn-forward'
        : 'reader-paper-sheet--turn-backward'
      : '';

  return (
    <div
      className={`min-h-0 h-dvh ${pageTheme.bg} ${pageTheme.text} flex flex-col overflow-hidden font-serif selection:bg-[#d8cbb8]/50`}
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
        <div
          className={`mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 ${
            pdfReadingMode ? 'w-full max-w-none' : 'max-w-3xl'
          }`}
        >
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

      <main
        className={`relative z-10 flex w-full flex-1 flex-col min-h-0 ${
          pdfReadingMode
            ? 'max-w-none items-stretch justify-stretch p-0'
            : 'mx-auto items-center justify-center p-6 sm:p-12 lg:w-4/5 xl:w-[800px]'
        }`}
      >
        <div className={`relative flex w-full flex-col items-center justify-center ${pdfReadingMode ? "min-h-0 flex-1" : "min-h-[50vh]"}`}>
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
            pdfReadingMode ? (
              <div className="relative flex min-h-0 w-full flex-1 animate-in fade-in flex-col duration-500 ease-out">
                {pdfTocOpen ? (
                  <button
                    type="button"
                    className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px]"
                    aria-label="Close page list"
                    onClick={() => setPdfTocOpen(false)}
                  />
                ) : null}
                <div className="flex min-h-0 flex-1 flex-col px-1 sm:px-2">
                  {poem ? (
                    <PoemPdfFlipbook
                      pdfUrl={poem.pdf_file_url!}
                      pages={pages}
                      activeBookIndex={currentPage - 1}
                      onBookIndexChange={(idx) => setCurrentPage(idx + 1)}
                      poemTitle={poem.title}
                    />
                  ) : null}
                </div>
                <div
                  className={`flex shrink-0 items-center justify-between gap-2 border-t ${pageTheme.border} bg-[#f4eee6]/95 px-3 py-3 backdrop-blur-md sm:px-6`}
                >
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={currentPage === 0}
                    className={`rounded-full px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest shadow-sm sm:px-8 sm:text-xs ${
                      currentPage === 0
                        ? 'cursor-not-allowed opacity-25'
                        : 'border border-[#d8cbb8] bg-white text-[#8a7251] hover:bg-[#e5ddd3]'
                    }`}
                  >
                    ← Previous
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#8a7251] opacity-70 sm:text-[10px]">
                      {currentPage === 0 ? 'Title' : `Page ${currentPage}`} / {totalPages - 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPdfTocOpen((o) => !o)}
                      className="font-sans text-[10px] font-bold uppercase tracking-widest text-[#8a7251] underline decoration-[#d8cbb8] underline-offset-2"
                    >
                      {pdfTocOpen ? 'Close list' : 'All pages'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={currentPage >= totalPages - 1}
                    className={`rounded-full px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest shadow-sm sm:px-8 sm:text-xs ${
                      currentPage >= totalPages - 1
                        ? 'cursor-not-allowed opacity-25'
                        : 'bg-[#8a7251] text-white ring-4 ring-[#8a7251]/10 hover:bg-[#6b5846]'
                    }`}
                  >
                    Next →
                  </button>
                </div>
                {pdfTocOpen && poem ? (
                  <div className="fixed bottom-[76px] left-2 right-2 z-40 max-h-[42vh] overflow-y-auto rounded-2xl border border-[#d8cbb8] bg-[#fdfcfb]/98 p-4 shadow-2xl backdrop-blur-md sm:left-auto sm:right-4 sm:max-w-sm">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#8a7251] opacity-70">
                      Jump to page
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          goToPage(0);
                          setPdfTocOpen(false);
                        }}
                        className={`rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider ${
                          currentPage === 0 ? 'bg-[#8a7251] text-white' : 'bg-[#f4eee6] text-[#8a7251] hover:bg-[#e5ddd3]'
                        }`}
                      >
                        Title Page
                      </button>
                      {pages.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            goToPage(i + 1);
                            setPdfTocOpen(false);
                          }}
                          className={`rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider ${
                            currentPage === i + 1 ? 'bg-[#8a7251] text-white' : 'bg-[#f4eee6] text-[#8a7251] hover:bg-[#e5ddd3]'
                          }`}
                        >
                          Page {i + 1}
                        </button>
                      ))}
                      {hasMorePages && !isPurchased ? (
                        <button
                          type="button"
                          onClick={() => {
                            goToPage(pages.length + 1);
                            setPdfTocOpen(false);
                          }}
                          className={`rounded-xl border border-dashed px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider ${
                            currentPage === pages.length + 1
                              ? 'bg-amber-600 text-white'
                              : 'border-amber-200 bg-amber-50/80 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          Locked content
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
            <div className="flex h-full w-full animate-in fade-in flex-col md:flex-row duration-700 ease-out overflow-hidden">
              <div className={`w-full md:w-1/4 p-6 flex flex-col border-b md:border-b-0 md:border-r ${pageTheme.border} bg-white/40 backdrop-blur-md z-10 overflow-hidden`}>
                <div className="flex flex-col items-center mb-6">
                  <div className="relative h-32 w-32 transform transition-transform duration-500 hover:scale-105">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={poem.cover_image_url || 'https://via.placeholder.com/600x800/f5efe6/6b5846?text=Poetry+Hub'}
                      alt={poem.title}
                      className="h-full w-full rounded-xl object-cover shadow-lg border-2 border-white"
                    />
                  </div>
                  <h1 className="mt-4 text-lg font-bold text-[#5a4838] font-serif text-center line-clamp-1 px-2">
                    {poem.title}
                  </h1>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                  <p className="text-[10px] font-bold text-[#8a7251] uppercase tracking-widest mb-2 px-2 opacity-60">Chapters / Pages</p>

                  <button
                    onClick={() => goToPage(0)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-between ${
                      currentPage === 0
                        ? 'bg-[#8a7251] text-white shadow-md'
                        : 'hover:bg-[#d8cbb8]/40 text-[#8a7251]'
                    }`}
                  >
                    <span>Title Page</span>
                    {currentPage === 0 && <span className="text-[8px]">●</span>}
                  </button>

                  {pages.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => goToPage(i + 1)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-between ${
                        currentPage === i + 1
                          ? 'bg-[#8a7251] text-white shadow-md'
                          : 'hover:bg-[#d8cbb8]/40 text-[#8a7251]'
                      }`}
                    >
                      <span className="truncate">Page {i + 1}</span>
                      {currentPage === i + 1 && <span className="text-[8px]">●</span>}
                    </button>
                  ))}

                  {hasMorePages && !isPurchased && (
                    <button
                      onClick={() => goToPage(pages.length + 1)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-between border border-dashed ${
                        currentPage === pages.length + 1
                          ? 'bg-amber-600 text-white shadow-md'
                          : 'hover:bg-amber-100/50 text-amber-700 border-amber-200'
                      }`}
                    >
                      <span>Locked Content 🔒</span>
                    </button>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-[#d8cbb8]/30 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#8a7251] opacity-40">Poetry Hub Premium</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-white/10 p-4 md:p-12">
                <div className="mx-auto flex min-h-full w-full max-w-4xl items-center justify-center">
                  <div className="reader-paper-stage w-full">
                    <div className="reader-paper-underlay reader-paper-underlay--rear" aria-hidden />
                    <div className="reader-paper-underlay reader-paper-underlay--mid" aria-hidden />
                    <div
                      key={`reader-paper-${currentPage}-${pageTurnNonce}`}
                      className={`reader-paper-sheet ${readerPaperAnimationClass} ${
                        currentPage === 0 ? 'reader-paper-sheet--cover' : ''
                      }`}
                    >
                      <div className="reader-paper-fibers" aria-hidden />
                      <div className="reader-paper-edge-glow" aria-hidden />

                      {currentPage === 0 ? (
                        <div className="flex min-h-[42rem] flex-col items-center justify-center px-8 py-16 text-center md:px-16">
                          <div className="space-y-4">
                            <p className="text-xs font-sans uppercase tracking-[0.4em] text-[#8a7251] opacity-60">Welcome to</p>
                            <h2 className="text-4xl font-extrabold uppercase tracking-tighter leading-none text-[#796349] md:text-6xl">
                              Poetry
                              <br />
                              <span className="text-[#9c8466]">Hub</span>
                            </h2>
                          </div>
                          <div className="mt-8 flex justify-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#8a7251]/30" />
                            <span className="h-2 w-2 rounded-full bg-[#8a7251]/60" />
                            <span className="h-2 w-2 rounded-full bg-[#8a7251]/30" />
                          </div>
                          <p className="mt-8 text-lg font-medium italic text-[#8a7251]">Begin your reading journey</p>
                          <button
                            onClick={handleNext}
                            className="mt-10 rounded-full bg-[#8a7251] px-10 py-4 font-bold uppercase tracking-widest text-white shadow-xl transition-all hover:bg-[#6b5846] hover:shadow-2xl active:scale-95"
                          >
                            Start Reading
                          </button>
                        </div>
                      ) : (
                        <div className="reader-paper-body w-full space-y-6 px-6 py-8 md:px-10 md:py-10">
                          <div className="flex items-center justify-between border-b border-[#d8cbb8]/40 pb-4 text-[#8a7251]">
                            <span className="text-xs font-bold uppercase tracking-widest">Page {currentContent?.page_number}</span>
                            <span className="text-xs font-sans italic opacity-60">Reading: {poem.title}</span>
                          </div>

                          {currentContent ? (
                            currentContent.content === '[PDF_PAGE]' && poem.pdf_file_url ? (
                              <div className="group relative h-[75vh] min-h-[500px] w-full overflow-hidden rounded-[2rem] border border-[#d8cbb8] bg-white shadow-2xl">
                                {isPdfLoading && (
                                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 backdrop-blur-sm">
                                    <div className="flex flex-col items-center gap-4">
                                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#8a7251] border-t-transparent" />
                                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a7251]">
                                        Loading PDF Page {currentContent.page_number}...
                                      </p>
                                    </div>
                                  </div>
                                )}
                                <iframe
                                  ref={iframeRef}
                                  key={`pdf-page-${currentContent.page_number}`}
                                  src={`${poem.pdf_file_url}#page=${currentContent.page_number}&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                                  onLoad={() => setIsPdfLoading(false)}
                                  className="h-full w-full border-0"
                                  title={`PDF Page ${currentContent.page_number}`}
                                />
                                <div className="pointer-events-none absolute inset-0 border-[12px] border-white/5" />
                              </div>
                            ) : isImageUrl(currentContent.content) ? (
                              <div className="group relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={currentContent.content}
                                  alt={`${poem.title} page ${currentContent.page_number}`}
                                  className="mx-auto max-h-[70vh] rounded-[2rem] object-contain shadow-2xl transition-transform duration-500 group-hover:scale-[1.01]"
                                />
                              </div>
                            ) : (
                              <div className="reader-paper-prose">
                                <p
                                  className={`text-center font-serif text-2xl font-medium leading-[1.8] whitespace-pre-line md:text-3xl ${pageTheme.text}`}
                                >
                                  {currentContent.content}
                                </p>
                              </div>
                            )
                          ) : (
                            <div className="rounded-3xl border-2 border-dashed border-[#d8cbb8] bg-white/30 py-20 text-center">
                              <p className="text-lg italic text-[#8a7251]">No content found for this page.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )
          ) : (
            <div
              className={`z-20 mx-auto w-full max-w-md animate-in zoom-in-95 rounded-3xl border-2 ${pageTheme.border} ${pageTheme.bg} p-10 text-center font-sans shadow-2xl duration-500`}
            >
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-inner">
                <span className="text-2xl">🔒</span>
              </div>
              <h2 className="mb-4 font-serif text-3xl font-bold text-[#6b563b]">Collection Locked</h2>
              <p className="mx-auto mb-8 text-sm text-[#8a7251] leading-relaxed">
                You&apos;ve reached the end of the free preview.<br/> 
                Purchase this collection to unlock all <strong>{totalPages - 1} pages</strong> and enjoy the background music.
              </p>

              <div className="mx-auto mb-8 flex items-center justify-between rounded-2xl border border-[#d8cbb8] bg-white/80 p-5 shadow-sm">
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[#8a7251]">Full Access</p>
                  <p className="text-xl font-bold text-[#6b563b]">Rs {priceFormatter.format(Number(poem.price) || 0)}</p>
                </div>
                <div className="h-8 w-px bg-[#d8cbb8]" />
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[#8a7251]">Includes</p>
                  <p className="text-xs font-semibold text-[#8a7251]">Music + All Pages</p>
                </div>
              </div>

              <Link
                href={`/payments/${poem.id}`}
                onClick={handleProceedToPayment}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold transition-all hover:scale-[1.02] shadow-xl hover:shadow-amber-200/50 ${pageTheme.accent}`}
              >
                Unlock Everything
              </Link>
            </div>
          )}
        </div>

        {/* Global Footer Navigation (hidden in full-screen PDF reading — controls are inline there) */}
        {!pdfReadingMode ? (
        <div
          className={`relative z-50 mt-auto flex w-full shrink-0 items-center justify-between border-t ${pageTheme.border} bg-[#f4eee6]/80 backdrop-blur-md px-6 py-6 font-sans`}
        >
          <button
            onClick={handlePrev}
            disabled={currentPage === 0}
            className={`flex items-center gap-2 rounded-full px-8 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-sm ${
              currentPage === 0 
                ? 'opacity-20 cursor-not-allowed' 
                : 'bg-white text-[#8a7251] border border-[#d8cbb8] hover:bg-[#e5ddd3]'
            }`}
          >
            ← Previous
          </button>

          <div className="flex flex-col items-center gap-1">
             <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all ${Math.floor((currentPage/totalPages)*10) >= i ? 'w-4 bg-[#8a7251]' : 'w-2 bg-[#d8cbb8]'}`} />
                ))}
             </div>
             <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#8a7251] opacity-60">
               {currentPage === 0 ? 'Title' : `Page ${currentPage}`} / {totalPages - 1}
             </span>
          </div>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages - 1}
            className={`flex items-center gap-2 rounded-full px-8 py-3 text-xs font-bold uppercase tracking-widest transition-all shadow-sm ${
              currentPage >= totalPages - 1 
                ? 'opacity-20 cursor-not-allowed' 
                : 'bg-[#8a7251] text-white hover:bg-[#6b5846] ring-4 ring-[#8a7251]/10'
            }`}
          >
            Next →
          </button>
        </div>
        ) : null}
      </main>
    </div>
  );
}
