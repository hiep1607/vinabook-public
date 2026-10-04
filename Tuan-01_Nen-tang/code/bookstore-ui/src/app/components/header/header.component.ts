import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from 'src/app/services/auth.service';
import { CartService } from 'src/app/services/cart.service';
import { CategoryService } from 'src/app/services/category.service';
import { SearchHistoryService } from 'src/app/services/search-history.service';
import { SearchService, SuggestionItem } from 'src/app/services/search.service';
import { WishlistService } from 'src/app/services/wishlist.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {

  keyword = '';
  showSuggestions = false;
  showCategoryDropdown = false;
  suggestions: SuggestionItem[] = [];
  recentSearches: string[] = [];
  categories: any[] = [];
  activeCategory: number | null = null;
  isMobile = false;
  showMobileNav = false;

  @ViewChild('searchBoxRef') searchBoxRef!: ElementRef;
  @ViewChild('categoryMenuRef') categoryMenuRef!: ElementRef;

  private debounceTimer: any;
  private dropdownCloseTimer: any;
  private subscriptions = new Subscription();

  constructor(
    public cartService: CartService,
    public authService: AuthService,
    public wishlistService: WishlistService,
    public searchService: SearchService,
    private searchHistory: SearchHistoryService,
    private categoryService: CategoryService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.isMobile = window.innerWidth < 768;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile = window.innerWidth < 768;
    if (!this.isMobile) {
      this.showMobileNav = false;
    }
  }

  toggleMobileNav(): void {
    this.showMobileNav = !this.showMobileNav;
  }

  closeMobileNav(): void {
    this.showMobileNav = false;
  }

  ngOnInit(): void {
    this.subscriptions.add(this.categoryService.getAll().subscribe(cats => {
      this.categories = cats;
    }));
    this.subscriptions.add(this.route.queryParams.subscribe(params => {
      this.activeCategory = params['categoryId'] ? parseInt(params['categoryId'], 10) : null;
    }));
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.dropdownCloseTimer);
    this.subscriptions.unsubscribe();
  }

  // Close dropdowns when user clicks outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (
      this.searchBoxRef &&
      !this.searchBoxRef.nativeElement.contains(target)
    ) {
      this.showSuggestions = false;
    }

    if (
      this.categoryMenuRef &&
      !this.categoryMenuRef.nativeElement.contains(target)
    ) {
      this.showCategoryDropdown = false;
    }
  }

  onFocus(): void {
    this.recentSearches = this.searchHistory.getHistory();
    this.suggestions = this.keyword.trim()
      ? this.searchService.getSuggestions(this.keyword)
      : [];
    this.showSuggestions = true;
  }

  onInput(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.recentSearches = this.searchHistory.getHistory();
      this.suggestions = this.keyword.trim()
        ? this.searchService.getSuggestions(this.keyword)
        : [];
      this.showSuggestions = true;
    }, 300);
  }

  onKeydownEnter(): void {
    this.search();
  }

  onKeydownEscape(): void {
    this.showSuggestions = false;
  }

  selectSuggestion(item: SuggestionItem): void {
    this.keyword = item.value;
    this.showSuggestions = false;
    this.searchHistory.addToHistory(item.value);
    this.router.navigate(['/search'], { queryParams: { q: item.value } });
  }

  selectHistory(query: string): void {
    this.keyword = query;
    this.showSuggestions = false;
    this.router.navigate(['/search'], { queryParams: { q: query } });
  }

  removeHistory(query: string, event: MouseEvent): void {
    event.stopPropagation();
    this.searchHistory.removeFromHistory(query);
    this.recentSearches = this.searchHistory.getHistory();
    if (this.recentSearches.length === 0 && this.suggestions.length === 0) {
      this.showSuggestions = false;
    }
  }

  clearAllHistory(event: MouseEvent): void {
    event.stopPropagation();
    this.searchHistory.clearHistory();
    this.recentSearches = [];
    if (this.suggestions.length === 0) {
      this.showSuggestions = false;
    }
  }

  search(): void {
    const kw = this.keyword.trim();
    if (!kw) {
      return;
    }
    this.showSuggestions = false;
    this.searchHistory.addToHistory(kw);
    this.router.navigate(['/search'], { queryParams: { q: kw } });
  }

  typeLabel(type: string): string {
    if (type === 'product')  { return 'Tên sách'; }
    if (type === 'author')   { return 'Tác giả'; }
    if (type === 'category') { return 'Thể loại'; }
    return '';
  }

  /** Tên icon lucide cho từng loại gợi ý */
  typeIcon(type: string): string {
    if (type === 'product')  { return 'book'; }
    if (type === 'author')   { return 'user'; }
    if (type === 'category') { return 'tag'; }
    return 'search';
  }

  toggleCategoryDropdown(event: Event): void {
    event.preventDefault();
    if (this.isMobile) {
      this.showCategoryDropdown = !this.showCategoryDropdown;
    }
  }

  /**
   * Hover-intent cho desktop: mở ngay khi rê vào, nhưng đóng trễ 250ms —
   * chuột lượn ra ngoài/băng qua khe hở rồi quay lại sẽ không làm panel flicker.
   */
  onCategoryHover(show: boolean): void {
    if (this.isMobile) {
      return;
    }
    clearTimeout(this.dropdownCloseTimer);
    if (show) {
      this.showCategoryDropdown = true;
    } else {
      this.dropdownCloseTimer = setTimeout(() => {
        this.showCategoryDropdown = false;
      }, 250);
    }
  }

  selectCategory(categoryId: number): void {
    this.showCategoryDropdown = false;
    this.showMobileNav = false;
    this.navigateToCategory(categoryId);
  }

  navigateToCategory(categoryId: number): void {
    this.router.navigate(['/category', categoryId]);
  }

}
