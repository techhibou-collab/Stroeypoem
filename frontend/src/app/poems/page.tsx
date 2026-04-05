'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import PoemReaderPage from '@/components/poem-reader-page';

function PoemByTitleContent() {
  const searchParams = useSearchParams();
  const title = searchParams.get('title');

  return <PoemReaderPage poemTitle={title} />;
}

export default function PoemByTitlePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f3ec] p-8 text-center text-[#8a735c]">Loading poem…</div>}>
      <PoemByTitleContent />
    </Suspense>
  );
}
