export interface BookPreviewPage {
  previewPageId?: number;
  pageOrder: number;
  originalPageNumber?: number;
  imageUrl: string;
  contentType?: 'image' | 'text';
  textContent?: string;
  heading?: string;
  fontFamily?: 'serif' | 'sans';
  fontSize?: number;
  textAlign?: 'left' | 'center';
  enabled?: boolean;
}

export interface BookPreviewManifest {
  productId: number;
  enabled: boolean;
  rightsConfirmed?: boolean;
  pageCount: number;
  pages: BookPreviewPage[];
}
