import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { SearchHistoryService } from 'src/app/services/search-history.service';
import { SearchService } from 'src/app/services/search.service';
import { ProductService } from 'src/app/services/product.service';

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit, OnDestroy {

  keyword = '';
  activeCategory = '';
  sortOrder: 'default' | 'price-asc' | 'price-desc' = 'default';

  products: any[] = [];

  loading = true;
  loadError = false;

  readonly skeletonItems = [1, 2, 3, 4, 5, 6, 7, 8];

  private paramsSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public searchService: SearchService,
    private searchHistory: SearchHistoryService,
    private productService: ProductService
  ) {}

  ngOnInit(): void {
    this.loadCatalog();
  }

  // Đợi catalog từ API sẵn sàng rồi mới chạy search —
  // tránh kết quả rỗng khi F5 thẳng vào /search
  private loadCatalog(): void {
    this.loading = true;
    this.loadError = false;

    this.productService.getProducts().subscribe(
      () => {
        this.loading = false;
        if (this.paramsSub) {
          this.paramsSub.unsubscribe();
        }
        this.paramsSub = this.route.queryParams.subscribe(params => {
          // `q` là query canonical; `keyword` chỉ còn đọc lại cho link cũ.
          const q = typeof params['q'] === 'string' ? params['q'] : '';
          const legacyKeyword = typeof params['keyword'] === 'string' ? params['keyword'] : '';

          // Chuẩn hóa URL cũ `?keyword=...` sang `?q=...` bằng replaceUrl
          // (không tạo thêm entry history nên không phá back/forward).
          if (legacyKeyword) {
            const next: any = { ...params, q: q || legacyKeyword };
            delete next['keyword'];
            this.router.navigate([], {
              relativeTo: this.route,
              queryParams: next,
              replaceUrl: true
            });
            return; // queryParams phát lại sau điều hướng sẽ chạy nhánh chính
          }

          this.keyword        = q;
          this.activeCategory = params['category'] || '';
          this.runSearch();
        });
      },
      () => {
        this.loading = false;
        this.loadError = true;
      }
    );
  }

  retry(): void {
    this.productService.refresh();
    this.loadCatalog();
  }

  ngOnDestroy(): void {
    if (this.paramsSub) {
      this.paramsSub.unsubscribe();
    }
  }

  private runSearch(): void {
    this.products = this.searchService.search(this.keyword, this.activeCategory);
    if (this.keyword.trim()) {
      this.searchHistory.addToHistory(this.keyword.trim());
    }
  }

  get sortedProducts(): any[] {
    const list = [...this.products];
    if (this.sortOrder === 'price-asc') {
      return list.sort((a, b) => Number(a.price) - Number(b.price));
    }
    if (this.sortOrder === 'price-desc') {
      return list.sort((a, b) => Number(b.price) - Number(a.price));
    }
    return list;
  }

  get categories(): string[] {
    return this.searchService.getCategories();
  }

  setCategory(cat: string): void {
    // merge giữ nguyên query hiện tại (`q`) trên URL khi đổi category/sort.
    this.router.navigate(['/search'], {
      queryParams: { category: cat },
      queryParamsHandling: 'merge'
    });
  }

  setSortOrder(order: 'default' | 'price-asc' | 'price-desc'): void {
    this.sortOrder = order;
  }

}
