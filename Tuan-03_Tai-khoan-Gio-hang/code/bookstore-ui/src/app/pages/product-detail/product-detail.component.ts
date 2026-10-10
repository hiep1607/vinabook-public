import { DOCUMENT } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  HostListener,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';

import {
  ActivatedRoute,
  Router
} from '@angular/router';

import { ProductService } from 'src/app/services/product.service';

import { CartService } from 'src/app/services/cart.service';
import { ReviewService } from 'src/app/services/review.service';
import { AuthService } from 'src/app/services/auth.service';
import { NotificationService } from 'src/app/services/notification.service';
import { WishlistService } from 'src/app/services/wishlist.service';
import { RecentlyViewedService } from 'src/app/services/recently-viewed.service';
import { MotionService } from 'src/app/services/motion.service';
import { Book3dViewerComponent } from 'src/app/components/book-3d-viewer/book-3d-viewer.component';

const STICKY_BAR_MAX_WIDTH = 768;

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss']
})
export class ProductDetailComponent implements OnInit, OnDestroy, AfterViewChecked {

  @ViewChild('relatedSlider') relatedSlider?: ElementRef<HTMLElement>;
  @ViewChild('ctaActions') ctaActions?: ElementRef<HTMLElement>;
  @ViewChild('stickyBar') stickyBarEl?: ElementRef<HTMLElement>;
  @ViewChild(Book3dViewerComponent) bookViewer?: Book3dViewerComponent;

  product: any;

  previewOpen = false;
  previewAvailable = false;
  private previewSubscription?: Subscription;
  private productSubscription?: Subscription;

  reviews: any[] = [];

  relatedBooks: any[] = [];
  loading = true;
  loadError = false;

  private subscriptions = new Subscription();

  // Số lượng mua (stepper)
  qty = 1;

  stickyBarVisible = false;
  private originalCtaVisible = true;
  private stickyObserver?: IntersectionObserver;

  // Phân trang đánh giá
  visibleReviewCount = 5;

  // Form state
  reviewContent = '';
  reviewRating = 0;
  hoverRating = 0;

  // Whether the current user already has a review (edit mode)
  isEditing = false;

  readonly stars = [1, 2, 3, 4, 5];

  constructor(
    private route: ActivatedRoute,
    private cartService: CartService,
    private router: Router,
    private reviewService: ReviewService,
    public authService: AuthService,
    private notification: NotificationService,
    public wishlistService: WishlistService,
    private productService: ProductService,
    private zone: NgZone,
    private recentlyViewed: RecentlyViewedService,
    private motion: MotionService,
    @Inject(DOCUMENT) private doc: Document
  ) {}

  ngOnInit(): void {

    // Subscribe paramMap (không dùng snapshot) để bấm "sách cùng thể loại"
    // điều hướng sang sản phẩm khác vẫn nạp lại dữ liệu (component được tái sử dụng)
    this.subscriptions.add(this.route.paramMap.subscribe(params => {

      const id = Number(params.get('id'));

      this.resetState();
      this.loading = true;
      this.loadError = false;

      this.productSubscription?.unsubscribe();
      this.productSubscription = this.productService.getProduct(id).subscribe(product => {

        this.product = product;
        this.loading = false;

        if (!this.product) {
          this.router.navigate(['/']);
          return;
        }

        this.loadReviews();
        this.previewSubscription = this.productService.getPreview(id).subscribe({
          next: preview => {
            this.previewAvailable = preview.enabled && preview.pageCount > 0 && preview.pages.some(page =>
              page.enabled !== false && (page.contentType === 'text' ? !!page.textContent?.trim() : !!page.imageUrl));
          },
          error: () => { this.previewAvailable = false; }
        });
        this.loadUserReview();
        this.loadRelatedBooks();


        this.recentlyViewed.add(id);
        setTimeout(() => this.setupStickyObserver());

      }, () => {
        this.loading = false;
        this.loadError = true;
      });

    }));

    // Cache rates tải bất đồng bộ - đồng bộ lại danh sách review khi sẵn sàng
    this.subscriptions.add(this.reviewService.changes$.subscribe(() => {
      if (this.product) {
        this.loadReviews();
        if (!this.isEditing) {
          this.loadUserReview();
        }
      }
    }));

  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.teardownStickyBar();
    this.doc.body.classList.remove('preview-reader-open');
    this.productSubscription?.unsubscribe();
    this.previewSubscription?.unsubscribe();
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    if (this.stickyObserver) {
      this.applyStickyState(this.originalCtaVisible);
    }
  }

  private setupStickyObserver(): void {
    const target = this.ctaActions?.nativeElement;

    if (!target || this.stickyObserver || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.stickyObserver = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      this.zone.run(() => this.applyStickyState(visible));
    }, { threshold: 0 });

    this.stickyObserver.observe(target);
    this.applyStickyState(true);
  }

  applyStickyState(originalCtaVisible: boolean): void {
    this.originalCtaVisible = originalCtaVisible;

    const mobileWidth = window.innerWidth <= STICKY_BAR_MAX_WIDTH;
    const next = mobileWidth && !originalCtaVisible && !!this.product && !this.loadError;

    if (next !== this.stickyBarVisible) {
      this.stickyBarVisible = next;
      document.body.classList.toggle('has-sticky-buy-bar', next);
    }
  }

  private teardownStickyBar(): void {
    this.stickyObserver?.disconnect();
    this.stickyObserver = undefined;
    document.body.classList.remove('has-sticky-buy-bar');
    this.stickyBarVisible = false;
  }

  ngAfterViewChecked(): void {
    const el = this.stickyBarEl?.nativeElement;
    if (el && this.stickyBarVisible && el.parentElement !== this.doc.body) {
      this.doc.body.appendChild(el);
    }
  }

  /** Trạng thái theo từng sản phẩm - phải xóa khi đổi sang sản phẩm khác */
  private resetState(): void {
    this.previewSubscription?.unsubscribe();
    this.previewAvailable = false;
    this.qty = 1;
    this.visibleReviewCount = 5;
    this.reviewContent = '';
    this.reviewRating = 0;
    this.hoverRating = 0;
    this.isEditing = false;
    this.relatedBooks = [];
    this.previewOpen = false;
    this.doc.body.classList.remove('preview-reader-open');
    window.scrollTo({ top: 0 });
  }

  onPreviewRequested(): void {
    if (!this.product || this.previewOpen || !this.previewAvailable) { return; }
    this.previewOpen = true;
    this.doc.body.classList.add('preview-reader-open');
  }

  closePreview(): void {
    this.previewOpen = false;
    this.doc.body.classList.remove('preview-reader-open');
  }

  private loadRelatedBooks(): void {

    if (!this.product.categoryId) {
      return;
    }

    this.subscriptions.add(this.productService
      .getProductsByCategory(this.product.categoryId)
      .subscribe(list => {
        this.relatedBooks = list
          .filter(p => p.id !== this.product.id)
          .slice(0, 8);
      }));

  }

  loadReviews(): void {
    this.reviews = this.reviewService.getReviews(this.product.id);
  }

  private loadUserReview(): void {

    if (!this.authService.isLoggedIn()) {
      return;
    }

    const existing = this.reviewService.getUserReview(
      this.product.id,
      this.authService.currentUser.email
    );

    if (existing) {
      this.reviewContent = existing.content;
      this.reviewRating  = existing.rating;
      this.isEditing     = true;
    }

  }

  // ---- wishlist ----

  get isWishlisted(): boolean {
    if (!this.authService.isLoggedIn()) {
      return false;
    }
    return this.wishlistService.isInWishlist(
      this.authService.currentUser.email,
      this.product.id
    );
  }

  toggleWishlist(): void {
    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập để lưu sản phẩm yêu thích');
      this.router.navigate(['/login']);
      return;
    }

    const added = this.wishlistService.toggleWishlist(
      this.authService.currentUser.email,
      this.product.id
    );

    this.notification.success(
      added ? 'Đã thêm vào danh sách yêu thích ♥' : 'Đã xóa khỏi danh sách yêu thích'
    );
  }

  // ---- star picker helpers ----

  setRating(star: number): void {
    this.reviewRating = star;
  }

  setHover(star: number): void {
    this.hoverRating = star;
  }

  clearHover(): void {
    this.hoverRating = 0;
  }

  starClass(star: number): string {

    const active = this.hoverRating
      ? star <= this.hoverRating
      : star <= this.reviewRating;

    return active ? 'star on' : 'star';

  }

  // ---- computed display values ----

  get averageRating(): number {
    return this.reviewService.getAverageRating(this.product.id);
  }

  get reviewCount(): number {
    return this.reviews.length;
  }

  get visibleReviews(): any[] {
    return this.reviews.slice(0, this.visibleReviewCount);
  }

  showMoreReviews(): void {
    this.visibleReviewCount += 5;
  }

  slideRelated(direction: 1 | -1): void {
    const viewport = this.relatedSlider?.nativeElement;
    if (!viewport) {
      return;
    }
    viewport.scrollBy({
      left: direction * Math.max(260, viewport.clientWidth * 0.82),
      behavior: 'smooth'
    });
  }

  get ratingHint(): string {
    const labels = ['', 'Không hài lòng', 'Chưa tốt', 'Bình thường', 'Hài lòng', 'Rất hài lòng'];
    return labels[this.hoverRating || this.reviewRating] || 'Chọn mức đánh giá';
  }

  reviewInitial(name: string): string {
    return (name || 'V').trim().charAt(0).toUpperCase();
  }

  // ---- quantity stepper ----

  /** Trần số lượng = tồn kho backend (product.quantity); không có thì 99 */
  get maxQty(): number {
    if (!this.product || this.product.quantity === undefined || this.product.quantity === null) {
      return 99;
    }
    return Math.max(0, this.product.quantity);
  }

  increaseQty(): void {
    if (this.qty < this.maxQty) {
      this.qty++;
    }
  }

  decreaseQty(): void {
    if (this.qty > 1) {
      this.qty--;
    }
  }

  displayStars(rating: number): string {
    const full  = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  // ---- actions ----

  addReview(): void {

    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập để đánh giá');
      this.router.navigate(['/login']);
      return;
    }

    if (this.reviewRating === 0) {
      this.notification.error('Vui lòng chọn số sao');
      return;
    }

    if (!this.reviewContent.trim()) {
      this.notification.error('Vui lòng nhập nội dung đánh giá');
      return;
    }

    const user = this.authService.currentUser;
    const wasEditing = this.isEditing;

    this.reviewService
      .upsertReview(this.product.id, {
        userId:  user.userId,
        email:   user.email,
        name:    user.name,
        content: this.reviewContent.trim(),
        rating:  this.reviewRating
      })
      .subscribe(
        () => {

          this.isEditing     = true;
          this.reviewContent = this.reviewContent.trim();

          this.notification.success(
            wasEditing
              ? 'Cập nhật đánh giá thành công'
              : 'Đánh giá đã được gửi'
          );

        },
        () => {
          this.notification.error('Gửi đánh giá thất bại. Vui lòng thử lại sau');
        }
      );

  }

  addToCart(): void {

    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập trước');
      this.router.navigate(['/login']);
      return;
    }

    if (this.maxQty === 0) {
      this.notification.error('Sản phẩm hiện đã hết hàng');
      return;
    }

    this.cartService.addToCart(this.product, this.qty);
    this.motion.addToCart(this.bookViewer?.getMotionSource());
    this.notification.success('Đã thêm vào giỏ hàng');

  }

  buyNow(): void {

    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập trước');
      this.router.navigate(['/login']);
      return;
    }

    if (this.maxQty === 0) {
      this.notification.error('Sản phẩm hiện đã hết hàng');
      return;
    }

    this.cartService.setBuyNowItem(this.product, this.qty);
    this.router.navigate(['/checkout']);

  }

}
