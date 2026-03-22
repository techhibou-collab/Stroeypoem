'use client';

import { useSearchParams } from 'next/navigation';
import PoemReaderPage from '@/components/poem-reader-page';

export default function PoemByTitlePage() {
  const searchParams = useSearchParams();
  const title = searchParams.get('title');

  return <PoemReaderPage poemTitle={title} />;
}
