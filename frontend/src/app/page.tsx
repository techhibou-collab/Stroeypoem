import Link from 'next/link';
import UserSessionActions from '@/components/user-session-actions';
import { fetchApiJson, type Poem } from '@/lib/api';

export const dynamic = 'force-dynamic';

const priceFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

async function getPoems(): Promise<Poem[]> {
  return fetchApiJson<Poem[]>('/api/poems', { fallback: [] });
}

const buildReaderLoginHref = (poem: Poem) =>
  `/login?redirect=${encodeURIComponent(`/poems?title=${encodeURIComponent(poem.title)}`)}`;

export default async function Home() {
  const poems = await getPoems();

  return (
    <div className="min-h-screen bg-[#f7f3ec] text-[#4a3f35] flex flex-col font-serif selection:bg-[#8a735c]/30">
      <header className="border-b border-[#e8dfd5] bg-[#f7f3ec]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-[#5a4838]">Poetry Hub</h1>
          <UserSessionActions />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-widest text-[#6b5846] uppercase leading-tight mx-auto max-w-4xl">
            Discover Beautiful Words
          </h2>
          <p className="text-lg text-[#8a735c] max-w-2xl mx-auto italic font-medium">
            Read the first few pages for free. Unlock the full experience and immerse yourself in an ocean of poetry.
          </p>
          <div className="flex justify-center w-full my-6 opacity-50">
            <span className="text-sm md:text-base uppercase tracking-[0.4em] text-[#8a735c]">
              Fresh poems from the admin panel
            </span>
          </div>
        </div>

        {poems.length === 0 ? (
          <div className="rounded-3xl border border-[#e8dfd5] bg-white px-8 py-14 text-center shadow-sm">
            <h3 className="text-2xl font-bold text-[#5a4838]">No poems published yet</h3>
            <p className="mt-3 text-sm font-sans text-[#8a735c]">
              Add a poem from the admin panel and it will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {poems.map((poem) => {
              const coverImage =
                poem.cover_image_url ||
                'https://via.placeholder.com/600x800/f5efe6/6b5846?text=Poetry+Hub';

              return (
                <article
                  key={poem.id}
                  className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-[#dfd2c4] bg-[linear-gradient(180deg,#fffdf9_0%,#f9f3ea_100%)] shadow-[0_18px_45px_rgba(119,93,62,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-[#b89470] hover:shadow-[0_26px_55px_rgba(119,93,62,0.16)]"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,#f0ddc6_0%,rgba(240,221,198,0)_72%)] opacity-80" />

                  <div className="flex flex-col gap-6 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <span className="rounded-full border border-[#dbcbb9] bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.28em] text-[#8a735c] font-sans">
                        Poetry Hub
                      </span>
                      <span className="rounded-full bg-[#efe4d6] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[#7a6348] font-sans">
                        {poem.free_pages} Free Pages
                      </span>
                    </div>

                    <div className="grid gap-6 md:grid-cols-[210px,1fr] md:items-stretch">
                      <div className="relative mx-auto w-full max-w-[220px]">
                        <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[1.75rem] bg-[#d8c1a4]/60 blur-sm transition-transform duration-300 group-hover:translate-x-4 group-hover:translate-y-4" />
                        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-[#e4d7c9] bg-[linear-gradient(160deg,#fffdf9_0%,#f0e2d0_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[1.3rem] bg-[#f7f1e7]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coverImage}
                              alt={poem.title}
                              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex min-h-full flex-col justify-between gap-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <h3 className="text-2xl font-bold uppercase tracking-[0.16em] text-[#5a4838] transition-colors group-hover:text-[#8a735c] sm:text-3xl">
                              {poem.title}
                            </h3>
                            <div className="h-px w-20 bg-[#d8cbb8]" />
                          </div>

                          <p className="line-clamp-4 text-sm leading-7 text-[#6b5846] font-sans sm:text-[15px]">
                            {poem.description || 'No description added yet.'}
                          </p>
                        </div>

                        <div className="mt-auto flex flex-col gap-4 border-t border-[#e5d8ca] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#8a735c] font-sans">
                              Unlock Price
                            </p>
                            <p className="text-2xl font-bold text-[#5a4838] font-sans">
                              Rs {priceFormatter.format(Number(poem.price) || 0)}
                            </p>
                          </div>

                          <Link
                            href={buildReaderLoginHref(poem)}
                            className="inline-flex items-center justify-center rounded-full border border-[#8a735c] bg-[#8a735c] px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-sm transition-all hover:bg-[#6b5846] hover:border-[#6b5846] active:scale-95"
                          >
                            Read This
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-[#e8dfd5] py-8 text-center text-[#8a735c] text-sm font-sans uppercase tracking-wider font-semibold">
        <p>Copyright 2026 Poetry Hub MVP. Built for beautiful reading.</p>
      </footer>
    </div>
  );
}
