import { Injectable } from '@angular/core';
import { ProductService } from './product.service';

export interface SuggestionItem {
  type: 'product' | 'author' | 'category';
  label: string;
  value: string;
  product?: any;
}

@Injectable({ providedIn: 'root' })
export class SearchService {

  // Catalog hydrated từ backend ngay khi service khởi tạo; các method
  // tìm kiếm vẫn đồng bộ trên mảng cache này (đủ cho catalog cỡ nhỏ).
  private catalog: any[] = [];

  constructor(private productService: ProductService) {
    this.productService.getProducts().subscribe(products => {
      this.catalog = products;
    });
  }

  // Strip Vietnamese diacritics for accent-insensitive matching.
  // NFD decomposes accented vowels into base + combining mark pairs;
  // the regex removes the combining marks. đ/Đ are not composite so
  // must be replaced explicitly.
  normalize(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  getCategories(): string[] {
    const cats = this.catalog.map(p => p.category);
    return [...new Set(cats)];
  }

  // Returns this.catalog matching keyword in name/author/category, with an
  // optional additional AND filter on a specific category.
  search(keyword: string, category: string = ''): any[] {
    const norm = this.normalize(keyword.trim());

    return this.catalog.filter(p => {
      const matchesKeyword = norm === ''
        || this.normalize(p.name).includes(norm)
        || this.normalize(p.author).includes(norm)
        || this.normalize(p.category).includes(norm);

      const matchesCategory = category === ''
        || p.category === category;

      return matchesKeyword && matchesCategory;
    });
  }

  // Returns typed suggestion items for the header dropdown.
  // Max: 4 product name matches, 2 unique author matches, 2 unique category matches.
  getSuggestions(keyword: string): SuggestionItem[] {
    if (!keyword.trim()) {
      return [];
    }

    const norm = this.normalize(keyword.trim());
    const results: SuggestionItem[] = [];

    // Product name matches
    const productMatches = this.catalog
      .filter(p => this.normalize(p.name).includes(norm))
      .slice(0, 4);

    for (const p of productMatches) {
      results.push({ type: 'product', label: p.name, value: p.name, product: p });
    }

    // Unique author matches (not already covered by a product match above)
    const seenAuthors = new Set<string>();
    for (const p of this.catalog) {
      if (
        this.normalize(p.author).includes(norm) &&
        !seenAuthors.has(p.author) &&
        seenAuthors.size < 2
      ) {
        seenAuthors.add(p.author);
        results.push({ type: 'author', label: p.author, value: p.author });
      }
    }

    // Unique category matches
    const seenCats = new Set<string>();
    for (const p of this.catalog) {
      if (
        this.normalize(p.category).includes(norm) &&
        !seenCats.has(p.category) &&
        seenCats.size < 2
      ) {
        seenCats.add(p.category);
        results.push({ type: 'category', label: p.category, value: p.category });
      }
    }

    return results;
  }

}
