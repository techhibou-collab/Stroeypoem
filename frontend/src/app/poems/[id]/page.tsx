import { use } from 'react';
import PoemReaderPage from '@/components/poem-reader-page';

export default function PoemByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  return <PoemReaderPage poemId={resolvedParams.id} />;
}
