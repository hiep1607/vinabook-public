import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { ProductService } from 'src/app/services/product.service';
import { SearchService } from 'src/app/services/search.service';

type BooksMode = 'all' | 'new' | 'bestseller' | 'sale';
type SortOrder = 'newest' | 'bestselling' | 'price-asc' | 'price-desc';

/** Một sách được coi là "MỚI" nếu nhập kho trong vòng 60 ngày */
const NEW_BADGE_DAYS = 60;

@Component({
  selector: 'app-books',
  templateUrl: './books.component.html',
  styleUrls: ['./books.component.scss']
})
export class BooksComponent implements OnInit, OnDestroy {

  mode: BooksMode = 'all';
  title = 'Tất cả sách';

  keyword = '';
  sortOrder: SortOrder = 'newest';

  /** Danh sách sau filter + sort (chưa phân trang) */
  filtered: any[] = [];
  /** Trang hiện tại */
  pageItems: any[] = [];
  currentPage = 1;
  pageSize = 12;
  totalPages = 1;

  loading = true;
  error = '';

  readonly skeletonItems = [1, 2, 3, 4, 5, 6, 7, 8];

  private dataSub!: Subscription;
  private productsSub!: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productService: ProductService,
    private searchService: SearchService
  ) {}

  ngOnInit(): void {
    this.dataSub = this.route.data.subscribe(data => {
      this.mode = data['mode'] || 'all';
      this.title = this.modeTitle(this.mode);
      this.keyword = this.route.snapshot.queryParamMap.get('q') || '';
      const requestedSort = this.route.snapshot.queryParamMap.get('sort') as SortOrder;
      this.sortOrder = ['newest', 'bestselling', 'price-asc', 'price-desc'].includes(requestedSort)
        ? requestedSort
        : 'newest';
      this.currentPage = Math.max(1, Number(this.route.snapshot.queryParamMap.get('page')) || 1);
      this.loadBooks();
    });
  }

  ngOnDestroy(): void {
    if (this.dataSub)     { this.dataSub.unsubscribe(); }
    if (this.productsSub) { this.productsSub.unsubscribe(); }
  }

  private modeTitle(mode: BooksMode): string {
    if (mode === 'new')        { return 'Sách mới'; }
    if (mode === 'bestseller') { return 'Sách bán chạy'; }
    if (mode === 'sale')       { return 'Sách khuyến mãi'; }
    return 'Tất cả sách';
  }

  private loadBooks(): void {
    this.loading = true;
    this.error = '';

    this.productsSub = this.productService.getProducts().subscribe(
      () => {
        this.loading = false;
        this.applyFilters();
      },
      () => {
        this.loading = false;
        this.error = 'Không tải được danh sách sách. Vui lòng kiểm tra kết nối.';
      }
    );
  }

  retry(): void {
    this.productService.refresh();
    this.loadBooks();
  }

  /** Filter theo mode + keyword, sort, rồi cắt trang */
  applyFilters(): void {

    // 1. Nguồn: search accent-insensitive trên catalog cache (keyword rỗng = tất cả)
    let list = this.searchService.search(this.keyword, '');

    // 2. Filter + sort mặc định theo mode
    if (this.mode === 'sale') {
      list = list.filter(p => p.discount > 0);
      list.sort((a, b) => b.discount - a.discount);
    } else if (this.mode === 'bestseller') {
      list = [...list].sort((a, b) => b.sold - a.sold);
    } else if (this.mode === 'new') {
      list = [...list].sort((a, b) => this.compareNewest(a, b));
    } else {
      list = this.applySort([...list]);
    }

    this.filtered = list;
    this.totalPages = Math.max(1, Math.ceil(list.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    this.slicePage();
  }

  /** Sort của trang "Tất cả sách" theo dropdown */
  private applySort(list: any[]): any[] {
    if (this.sortOrder === 'bestselling') {
      return list.sort((a, b) => b.sold - a.sold);
    }
    if (this.sortOrder === 'price-asc') {
      return list.sort((a, b) => a.price - b.price);
    }
    if (this.sortOrder === 'price-desc') {
      return list.sort((a, b) => b.price - a.price);
    }
    return list.sort((a, b) => this.compareNewest(a, b));
  }

  /** Mới nhất: enteredDate desc, fallback id desc khi thiếu/bằng ngày */
  private compareNewest(a: any, b: any): number {
    const da = a.enteredDate ? new Date(a.enteredDate).getTime() : 0;
    const db = b.enteredDate ? new Date(b.enteredDate).getTime() : 0;
    if (db !== da) {
      return db - da;
    }
    return b.id - a.id;
  }

  private slicePage(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    this.pageItems = this.filtered.slice(start, start + this.pageSize);
  }

  // ---- template handlers ----

  onSearchChange(): void {
    this.currentPage = 1;
    this.applyFilters();
    this.syncUrl();
  }

  setSortOrder(order: SortOrder): void {
    this.sortOrder = order;
    this.currentPage = 1;
    this.applyFilters();
    this.syncUrl();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
    this.slicePage();
    this.syncUrl();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.keyword.trim() || null,
        sort: this.sortOrder !== 'newest' ? this.sortOrder : null,
        page: this.currentPage > 1 ? this.currentPage : null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  /** Badge "MỚI" (chỉ trang Sách mới): nhập kho trong NEW_BADGE_DAYS ngày */
  isNew(product: any): boolean {
    if (this.mode !== 'new' || !product.enteredDate) {
      return false;
    }
    const entered = new Date(product.enteredDate).getTime();
    return Date.now() - entered <= NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
  }

  /** Hạng #1/#2/#3 (chỉ trang Bestseller, trang 1) */
  rankOf(index: number): number {
    if (this.mode !== 'bestseller') {
      return 0;
    }
    const rank = (this.currentPage - 1) * this.pageSize + index + 1;
    return rank <= 3 ? rank : 0;
  }

}
