import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { ProductService } from 'src/app/services/product.service';
import { CategoryService } from 'src/app/services/category.service';
import { HomepageService } from 'src/app/services/homepage.service';
import { RecentlyViewedService } from 'src/app/services/recently-viewed.service';
import { NotificationService } from 'src/app/services/notification.service';
import { DEFAULT_HOMEPAGE_CONFIG, HomepageConfig } from 'src/app/models/homepage-config';
import { MotionService } from 'src/app/services/motion.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {

  latestBooks: any[] = [];
  bestSellers: any[] = [];
  heroBooks: any[] = [];
  categories: any[] = [];
  homeConfig: HomepageConfig = DEFAULT_HOMEPAGE_CONFIG;
  private allProducts: any[] = [];
  private allCategories: any[] = [];

  /** Số liệu lấy từ catalog thật. */
  stats = { books: 0, categories: 0 };

  loading = true;
  loadError = false;

  readonly skeletonItems = [1, 2, 3, 4, 5];

  /** Chỉ số bìa sách đang nổi bật ở hero (tự xoay vòng). */
  heroActive = 0;
  private heroTimer?: any;

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private homepageService: HomepageService,
    private recentlyViewed: RecentlyViewedService,
    private notification: NotificationService,
    private router: Router,
    private motion: MotionService
  ) {}

  ngOnInit(): void {
    this.homepageService.getConfig().subscribe(config => {
      this.homeConfig = config;
      this.applyHeroBooks();
      this.applyCategories();
    });

    this.loadCatalog();

    this.categoryService.getAll().subscribe(cats => {
      this.allCategories = cats;
      this.applyCategories();
      this.stats.categories = cats.length;
    });
  }

  ngOnDestroy(): void {
    this.stopHeroRotation();
  }

  loadCatalog(): void {
    this.loading = true;
    this.loadError = false;

    this.productService.getProducts().subscribe(
      products => {
        this.allProducts = products;
        this.latestBooks = [...products]
          .sort((a, b) => b.id - a.id)
          .slice(0, 8);
        this.bestSellers = [...products]
          .sort((a, b) => (b.sold || 0) - (a.sold || 0))
          .slice(0, 8);
        this.applyHeroBooks();
        this.applyRecentBooks();
        this.stats.books = products.length;
        this.loading = false;
        this.startHeroRotation();
      },
      () => {
        this.loading = false;
        this.loadError = true;
      }
    );
  }

  /** Sách đã xem gần đây — map ID từ RecentlyViewedService qua catalog hiện có. */
  recentBooks: any[] = [];

  applyRecentBooks(): void {
    const ids = this.recentlyViewed.getIds();
    // Bỏ qua ID không còn tồn tại trong catalog; mới xem nhất trước; tối đa 6.
    this.recentBooks = ids
      .map(id => this.allProducts.find(product => product.id === id))
      .filter(Boolean)
      .slice(0, 6);
  }

  /** Nút "Xóa lịch sử": xóa localStorage + cập nhật UI ngay, báo toast. */
  clearRecentlyViewed(): void {
    this.recentlyViewed.clear();
    this.recentBooks = [];
    this.notification.success('Đã xóa lịch sử xem');
  }

  benefitIcon(icon: string): string {
    const iconMap: { [key: string]: string } = {
      'truck': 'truck',
      'shield-check': 'shield-check',
      'refresh-ccw': 'refresh-ccw',
      'headphones': 'headphones',
      'book-open': 'book',
      'badge-check': 'shield-check',
      'gift': 'heart',
      'heart-handshake': 'heart'
    };
    return iconMap[icon] || 'book';
  }

  private applyHeroBooks(): void {
    if (!this.allProducts.length) {
      return;
    }
    const selectedIds = this.homeConfig.hero.productIds || [];
    const selected = selectedIds
      .map(id => this.allProducts.find(product => product.id === id))
      .filter(Boolean);
    this.heroBooks = selected.length ? selected : this.bestSellers.slice(0, 5);
    this.heroActive = 0;
    this.startHeroRotation();
  }

  private applyCategories(): void {
    if (!this.allCategories.length) {
      return;
    }
    const selectedIds = this.homeConfig.categories.categoryIds || [];
    const selected = selectedIds
      .map(id => this.allCategories.find(category => category.categoryId === id))
      .filter(Boolean);
    this.categories = selected.length ? selected : this.allCategories;
  }

  /** Tự xoay bìa nổi bật ở hero mỗi 3.5s. */
  private startHeroRotation(): void {
    this.stopHeroRotation();
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this.heroBooks.length < 2 || reduceMotion) {
      return;
    }
    this.heroTimer = setInterval(() => {
      this.heroActive = (this.heroActive + 1) % this.heroBooks.length;
    }, 3500);
  }

  private stopHeroRotation(): void {
    if (this.heroTimer) {
      clearInterval(this.heroTimer);
      this.heroTimer = undefined;
    }
  }

  retry(): void {
    this.productService.refresh();
    this.loadCatalog();
  }

  navigateToCategory(categoryId: number): void {
    this.router.navigate(['/category', categoryId]);
  }

  async goToProduct(id: number, source?: Event): Promise<void> {
    const cover = source?.currentTarget instanceof HTMLImageElement
      ? source.currentTarget
      : null;
    this.stopHeroRotation();
    const readyToNavigate = await this.motion.prepareBookRouteTransition(cover);
    if (readyToNavigate) {
      await this.router.navigate(['/product', id]);
    }
  }

  @ViewChild('productSlider')
  productSlider!: ElementRef;

  @ViewChild('bestSellerSlider')
  bestSellerSlider!: ElementRef;

  slideProductsRight() {
    this.scrollSlider(this.productSlider, 1);
  }

  slideProductsLeft() {
    this.scrollSlider(this.productSlider, -1);
  }

  slideBestSellerRight() {
    this.scrollSlider(this.bestSellerSlider, 1);
  }

  slideBestSellerLeft() {
    this.scrollSlider(this.bestSellerSlider, -1);
  }

  private scrollSlider(ref: ElementRef, direction: 1 | -1): void {
    const viewport = ref.nativeElement.parentElement as HTMLElement;
    viewport.scrollBy({
      left: direction * Math.max(280, viewport.clientWidth * 0.85),
      behavior: 'smooth'
    });
  }
}
