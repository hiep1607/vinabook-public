import { BookPreviewManifest } from '../../models/book-preview';

export interface PreviewProduct {
  id: number;
  name: string;
  author?: string;
  image?: string;
  originalImage?: string;
  spineImage?: string;
  backImage?: string;
  pageCount?: number;
  coverType?: string;
  width?: number;
  height?: number;
}

export type ReaderPage = {
  id: string;
  printedNumber?: number;
} & ({ kind: 'image'; url: string } | { kind: 'text'; text: string; heading?: string; fontFamily?: 'serif' | 'sans'; fontSize?: number; textAlign?: 'left' | 'center' });

export interface ReaderBook {
  productId: number;
  title: string;
  author: string;
  cover: string;
  backCover?: string;
  spine?: string;
  totalPages?: number;
  hardcover: boolean;
  width: number;
  height: number;
  pages: ReaderPage[];
}

export function adaptPreview(product: PreviewProduct, manifest: BookPreviewManifest): ReaderBook {
  const ratio = product.width && product.height ? product.width / product.height : 2.16 / 3.05;
  return {
    productId: product.id, title: product.name, author: product.author || '',
    cover: product.image || product.originalImage || '',
    backCover: product.backImage, spine: product.spineImage,
    totalPages: product.pageCount,
    hardcover: /hard|cứng/i.test(product.coverType || ''),
    width: 3.05 * Math.max(.5, Math.min(.85, ratio)), height: 3.05,
    pages: manifest.enabled && manifest.productId === product.id
      ? manifest.pages.filter(p => p.enabled !== false).sort((a, b) => a.pageOrder - b.pageOrder)
        .map((p): ReaderPage => p.contentType === 'text'
          ? { id: String(p.previewPageId || p.pageOrder), kind: 'text', text: p.textContent || '',
              heading: p.heading, fontFamily: p.fontFamily, fontSize: p.fontSize, textAlign: p.textAlign,
              printedNumber: p.originalPageNumber }
          : { id: String(p.previewPageId || p.pageOrder), kind: 'image', url: p.imageUrl,
              printedNumber: p.originalPageNumber })
      : []
  };
}
