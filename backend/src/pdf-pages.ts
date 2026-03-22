/**
 * Extract plain text per page from a PDF buffer (text-based PDFs; scanned pages may be empty).
 */
export async function extractTextPagesFromPdfBuffer(buffer: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pieces = textContent.items
      .map((item) =>
        item && typeof item === 'object' && 'str' in item ? String((item as { str: string }).str) : '',
      )
      .filter(Boolean);
    const joined = pieces.join(' ').replace(/\s+/g, ' ').trim();
    pages.push(joined);
  }

  return pages;
}
