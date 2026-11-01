export interface ProductPreviewPage {
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

export interface ProductPreviewManifest {
  productId: number;
  enabled: boolean;
  rightsConfirmed?: boolean;
  pageCount: number;
  pages: ProductPreviewPage[];
}
