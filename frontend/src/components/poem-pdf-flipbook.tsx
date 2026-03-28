'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiUrl, type PoemPage } from '@/lib/api';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

const HTMLFlipBook = dynamic(() => import('react-pageflip'), { ssr: false });

function resolvePdfUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  return getApiUrl(path);
}

let workerSrcSet = false;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!workerSrcSet && typeof window !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerSrcSet = true;
  }
  return pdfjs;
}

type PdfCanvasSlideProps = {
  pdfDocument: PDFDocumentProxy | null;
  pageNumber: number;
  maxWidth: number;
};

function PdfCanvasSlide({ pdfDocument, pageNumber, maxWidth }: PdfCanvasSlideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        setRenderError(null);
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = maxWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;

        try {
          await task.promise;
        } finally {
          if (renderTaskRef.current === task) {
            renderTaskRef.current = null;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/RenderingCancelledException|cancelled|aborted/i.test(msg) || cancelled) {
          return;
        }
        setRenderError(msg || 'Could not render page');
      }
    };

    void run();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdfDocument, pageNumber, maxWidth]);

  if (renderError) {
    return (
      <p className="px-4 py-8 text-center font-sans text-sm text-red-700" role="alert">
        {renderError}
      </p>
    );
  }

  return <canvas ref={canvasRef} className="mx-auto block max-h-full max-w-full" />;
}

type PageFlipApi = {
  getCurrentPageIndex: () => number;
  turnToPage: (page: number) => void;
  flip?: (page: number) => void;
};

type PoemPdfFlipbookProps = {
  pdfUrl: string;
  pages: PoemPage[];
  activeBookIndex: number;
  onBookIndexChange: (index: number) => void;
  poemTitle: string;
};

export default function PoemPdfFlipbook({
  pdfUrl,
  pages,
  activeBookIndex,
  onBookIndexChange,
  poemTitle,
}: PoemPdfFlipbookProps) {
  const pageIdsKey = useMemo(() => pages.map((p) => p.id).join(','), [pages]);
  const resolvedUrl = pdfUrl.startsWith('http') ? pdfUrl : resolvePdfUrl(pdfUrl);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [dims, setDims] = useState({ w: 360, h: 510 });
  const [pageAspect, setPageAspect] = useState(1.414);

  const containerRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<{ pageFlip: () => PageFlipApi | null }>(null);
  const pendingIndexRef = useRef(activeBookIndex);
  const activeBookIndexRef = useRef(activeBookIndex);

  activeBookIndexRef.current = activeBookIndex;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingDoc(true);
      setLoadError(null);
      setPdfDocument(null);

      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: resolvedUrl, withCredentials: false });
        const doc = await task.promise;
        if (!cancelled) {
          setPdfDocument(doc);
          const first = pages[0]?.page_number ?? 1;
          const page = await doc.getPage(first);
          const v = page.getViewport({ scale: 1 });
          if (!cancelled && v.width > 0) {
            setPageAspect(v.height / v.width);
          }
        } else {
          await doc.destroy().catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load PDF');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDoc(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
    // pageIdsKey captures page set; `pages[0]` read only inside loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl, pageIdsKey]);

  useEffect(() => {
    return () => {
      void pdfDocument?.destroy().catch(() => undefined);
    };
  }, [pdfDocument]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }

    const measure = () => {
      const cr = el.getBoundingClientRect();
      const cw = Math.max(120, cr.width);
      const ch = Math.max(120, cr.height);
      // StPageFlip uses two-page spreads when blockWidth >= 2 * setting.width. Keep width > cw/2 for one page per view.
      const minWForSinglePage = Math.floor(cw / 2) + 2;

      let w = cw;
      let h = w * pageAspect;
      if (h > ch) {
        h = ch;
        w = h / pageAspect;
      }
      w = Math.max(w, minWForSinglePage);
      h = w * pageAspect;
      if (h > ch) {
        h = ch;
        w = h / pageAspect;
      }
      if (w < minWForSinglePage) {
        w = minWForSinglePage;
        h = Math.min(ch, w * pageAspect);
      }

      const next = { w: Math.max(80, Math.floor(w)), h: Math.max(80, Math.floor(h)) };
      setDims((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pageAspect]);

  const getFlipApi = useCallback((): PageFlipApi | null => {
    const raw = flipRef.current?.pageFlip?.() as PageFlipApi | null | undefined;
    return raw ?? null;
  }, []);

  const applyBookIndex = useCallback(
    (index: number) => {
      if (pages.length === 0) {
        return false;
      }
      const safe = Math.max(0, Math.min(index, pages.length - 1));
      pendingIndexRef.current = safe;
      const api = getFlipApi();
      if (!api || typeof api.getCurrentPageIndex !== 'function') {
        return false;
      }
      const current = api.getCurrentPageIndex();
      if (current === safe) {
        return true;
      }
      if (typeof api.turnToPage === 'function') {
        api.turnToPage(safe);
        return true;
      }
      if (typeof api.flip === 'function') {
        api.flip(safe);
        return true;
      }
      return false;
    },
    [getFlipApi, pages.length],
  );

  useEffect(() => {
    pendingIndexRef.current = activeBookIndex;
    let frame = 0;
    let attempts = 0;
    const maxAttempts = 45;

    const tick = () => {
      if (applyBookIndex(activeBookIndex)) {
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeBookIndex, applyBookIndex, dims.w, dims.h]);

  const handleInit = useCallback(() => {
    applyBookIndex(pendingIndexRef.current);
  }, [applyBookIndex]);

  const handleFlip = useCallback(
    (e: { data: unknown }) => {
      const idx = typeof e.data === 'number' ? e.data : Number(e.data);
      if (!Number.isFinite(idx) || idx < 0 || idx >= pages.length) {
        return;
      }
      if (idx !== activeBookIndexRef.current) {
        onBookIndexChange(idx);
      }
    },
    [onBookIndexChange, pages.length],
  );

  const flipBookKey = pages.map((p) => p.id).join('-') || 'empty';

  if (loadError) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-xl border border-[#d8cbb8] bg-white/90 px-6 py-10 text-center font-sans text-sm text-[#8a7251] shadow-inner">
        {loadError}
      </div>
    );
  }

  const innerPad = 12;
  const canvasMax = Math.max(40, dims.w - innerPad * 2);

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#d8cbb8]/30 px-1 pb-2 text-[#8a7251] sm:px-2">
        <span className="truncate font-sans text-[10px] font-bold uppercase tracking-widest sm:text-xs">
          {poemTitle}
        </span>
        <span className="shrink-0 font-sans text-[10px] uppercase tracking-widest opacity-70 sm:text-xs">
          Page {pages[activeBookIndex]?.page_number ?? activeBookIndex + 1} / {pages.length}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {(isLoadingDoc || !pdfDocument) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f4eee6]/95 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#8a7251] border-t-transparent" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a7251]">Loading book…</p>
            </div>
          </div>
        )}

        {pdfDocument && pages.length > 0 ? (
          <HTMLFlipBook
            key={flipBookKey}
            ref={flipRef}
            className="mx-auto"
            style={{}}
            width={dims.w}
            height={dims.h}
            minWidth={dims.w}
            maxWidth={dims.w}
            minHeight={dims.h}
            maxHeight={dims.h}
            size="fixed"
            startPage={Math.min(activeBookIndex, pages.length - 1)}
            drawShadow
            flippingTime={600}
            usePortrait
            startZIndex={0}
            autoSize
            maxShadowOpacity={0.5}
            showCover={false}
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            swipeDistance={28}
            showPageCorners
            disableFlipByClick={false}
            onInit={handleInit}
            onFlip={handleFlip}
          >
            {pages.map((p) => (
              <div
                key={p.id}
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-sm border border-[#e5ddd3] bg-[#faf8f5] shadow-md"
              >
                <PdfCanvasSlide
                  pdfDocument={pdfDocument}
                  pageNumber={p.page_number}
                  maxWidth={canvasMax}
                />
              </div>
            ))}
          </HTMLFlipBook>
        ) : null}
      </div>

      <p className="shrink-0 pt-1 text-center font-sans text-[9px] uppercase tracking-[0.2em] text-[#8a7251]/60 sm:text-[10px]">
        Swipe or drag corners to turn
      </p>
    </div>
  );
}
