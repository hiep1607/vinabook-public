import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { HomeComponent } from './home.component';
import { ProductCardComponent } from 'src/app/components/product-card/product-card.component';
import { AuthService } from 'src/app/services/auth.service';
import { CartService } from 'src/app/services/cart.service';
import { CategoryService } from 'src/app/services/category.service';
import { HomepageService } from 'src/app/services/homepage.service';
import { NotificationService } from 'src/app/services/notification.service';
import { ProductService } from 'src/app/services/product.service';
import { RecentlyViewedService } from 'src/app/services/recently-viewed.service';
import { ReviewService } from 'src/app/services/review.service';
import { WishlistService } from 'src/app/services/wishlist.service';
import { DEFAULT_HOMEPAGE_CONFIG } from 'src/app/models/homepage-config';

const CATALOG = [
  { id: 56, name: 'Sách Sáu Mươi', price: 90000, oldPrice: 0, discount: 0, image: '', author: 'A', quantity: 5 },
  { id: 57, name: 'Sách Bảy Mươi', price: 120000, oldPrice: 0, discount: 0, image: '', author: 'B', quantity: 5 },
  { id: 58, name: 'Sách Tám Mươi', price: 150000, oldPrice: 0, discount: 0, image: '', author: 'C', quantity: 5 }
];
// ID 99 cố tình KHÔNG có trong catalog để test bỏ qua ID đã biến mất.
const REMOVED_ID = 99;

describe('HomeComponent — sách đã xem gần đây (P2)', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let component: HomeComponent;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  function boot(recentIds: number[]): void {
    localStorage.setItem('vinabook_recently_viewed', JSON.stringify(recentIds));
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function recentCardNames(): string[] {
    return fixture.debugElement
      .queryAll(By.css('.recent-row app-product-card'))
      .map(card => card.componentInstance.product.name);
  }

  beforeEach(() => {
    localStorage.removeItem('vinabook_recently_viewed');
    notificationSpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [HomeComponent, ProductCardComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: ProductService, useValue: { getProducts: () => of(CATALOG.slice()) } },
        { provide: CategoryService, useValue: { getAll: () => of([]) } },
        { provide: HomepageService, useValue: { getConfig: () => of(DEFAULT_HOMEPAGE_CONFIG) } },
        { provide: NotificationService, useValue: notificationSpy },
        {
          provide: ReviewService,
          useValue: {
            changes$: of(),
            getReviews: () => [],
            getAverageRating: () => 0
          }
        },
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, currentUser: { email: '' } }
        },
        { provide: WishlistService, useValue: { isInWishlist: () => false, getCount: () => 0 } },
        { provide: CartService, useValue: { addToCart: () => undefined } }
      ]
    });
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
    }
    localStorage.removeItem('vinabook_recently_viewed');
  });

  it('hiển thị đúng thứ tự mới xem nhất trước, map qua catalog', () => {
    boot([58, 57, 56]);

    expect(component.recentBooks.map(b => b.id)).toEqual([58, 57, 56]);
    expect(recentCardNames()).toEqual([
      'Sách Tám Mươi', 'Sách Bảy Mươi', 'Sách Sáu Mươi'
    ]);
  });

  it('bỏ qua ID không còn tồn tại trong catalog, không render card rỗng', () => {
    boot([REMOVED_ID, 57]);

    const ids = component.recentBooks.map(b => b.id);
    expect(ids).toEqual([57]);
    expect(recentCardNames()).toEqual(['Sách Bảy Mươi']);
  });

  it('"Xóa lịch sử" dọn localStorage và section biến mất ngay không cần reload', () => {
    boot([58, 57]);
    expect(fixture.debugElement.query(By.css('.recent-section'))).not.toBeNull();

    const clearBtn = fixture.debugElement.query(By.css('.recent-clear-btn'));
    expect(clearBtn).not.toBeNull();
    clearBtn.nativeElement.click();
    fixture.detectChanges();

    expect(TestBed.inject(RecentlyViewedService).getIds()).toEqual([]);
    expect(localStorage.getItem('vinabook_recently_viewed')).toBeNull();
    expect(fixture.debugElement.query(By.css('.recent-section'))).toBeNull();
    expect(notificationSpy.success).toHaveBeenCalledWith('Đã xóa lịch sử xem');
  });

  it('lịch sử rỗng -> không render section', () => {
    boot([]);

    expect(component.recentBooks.length).toBe(0);
    expect(fixture.debugElement.query(By.css('.recent-section'))).toBeNull();
  });
});
