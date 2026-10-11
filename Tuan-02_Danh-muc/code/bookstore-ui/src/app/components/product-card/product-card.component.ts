import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { CartService } from 'src/app/services/cart.service';
import { NotificationService } from 'src/app/services/notification.service';
import { MotionService } from 'src/app/services/motion.service';
import { ReviewService } from 'src/app/services/review.service';
import { WishlistService } from 'src/app/services/wishlist.service';

@Component({
  selector: 'app-product-card',
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss']
})
export class ProductCardComponent implements OnInit, OnDestroy {

  @Input() product: any;

  displayRating = 0;
  displayCount  = 0;

  private reviewSub!: Subscription;

  constructor(
    private router: Router,
    private reviewService: ReviewService,
    public wishlistService: WishlistService,
    public authService: AuthService,
    private cartService: CartService,
    private notification: NotificationService,
    private motion: MotionService
  ) {}

  ngOnInit(): void {
    // Rates tải bất đồng bộ từ backend — cập nhật lại sao mỗi khi cache đổi
    this.reviewSub = this.reviewService.changes$.subscribe(() => {
      this.displayRating = this.reviewService.getAverageRating(this.product.id);
      this.displayCount  = this.reviewService.getReviews(this.product.id).length;
    });
  }

  ngOnDestroy(): void {
    if (this.reviewSub) {
      this.reviewSub.unsubscribe();
    }
  }

  get isWishlisted(): boolean {
    if (!this.authService.isLoggedIn()) {
      return false;
    }
    return this.wishlistService.isInWishlist(
      this.authService.currentUser.email,
      this.product.id
    );
  }

  async goToDetail(event: MouseEvent): Promise<void> {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    const card = (event.currentTarget as HTMLElement).closest('.product-card');
    const cover = card?.querySelector('.product-image img') as HTMLImageElement | null;
    const readyToNavigate = await this.motion.prepareBookRouteTransition(cover);
    if (readyToNavigate) {
      await this.router.navigate(['/product', this.product.id]);
    }
  }

  restoreOriginalCover(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    const original = (this.product.originalImage || '').trim();
    if (original && image.src !== original) {
      image.src = original;
    }
  }

  displayStars(rating: number): string {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  addToCart(event: MouseEvent): void {
    event.stopPropagation();

    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập trước');
      this.router.navigate(['/login']);
      return;
    }

    if (this.product.quantity !== undefined && this.product.quantity <= 0) {
      this.notification.error('Sản phẩm hiện đã hết hàng');
      return;
    }

    this.cartService.addToCart(this.product);
    this.motion.addToCart(event.currentTarget as HTMLElement);
    this.notification.success('Đã thêm vào giỏ hàng');
  }

  toggleWishlist(event: MouseEvent): void {
    event.stopPropagation();

    if (!this.authService.isLoggedIn()) {
      this.notification.error('Vui lòng đăng nhập để lưu sản phẩm yêu thích');
      this.router.navigate(['/login']);
      return;
    }

    const added = this.wishlistService.toggleWishlist(
      this.authService.currentUser.email,
      this.product.id
    );

    this.motion.bump(event.currentTarget as HTMLElement);

    this.notification.success(
      added ? 'Đã thêm vào danh sách yêu thích ♥' : 'Đã xóa khỏi danh sách yêu thích'
    );
  }

}
