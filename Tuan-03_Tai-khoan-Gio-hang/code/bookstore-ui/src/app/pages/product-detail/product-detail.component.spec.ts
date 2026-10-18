import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { RecentlyViewedService } from 'src/app/services/recently-viewed.service';
import { CartService } from 'src/app/services/cart.service';
import { NotificationService } from 'src/app/services/notification.service';
import { ProductService } from 'src/app/services/product.service';
import { ReviewService } from 'src/app/services/review.service';
import { AuthService } from 'src/app/services/auth.service';
import { WishlistService } from 'src/app/services/wishlist.service';

import { ProductDetailComponent } from './product-detail.component';

const BASE_PRODUCT = {
  id: 57,
  name: 'Sách kiểm thử',
  author: 'Tác giả Kiểm Thử',
  image: '',
  description: 'Mô tả ngắn',
  price: 120000,
  oldPrice: 150000,
  discount: 20,
  quantity: 5,
  categoryId: 1
};

/** Giả lập IntersectionObserver để test deterministically. */
class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | null = null;
  disconnected = false;
  observed: Element[] = [];

  constructor(public callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    FakeIntersectionObserver.latest = this;
  }

  observe(el: Element): void { this.observed.push(el); }
  unobserve(): void {}
  disconnect(): void { this.disconnected = true; }
}

describe('ProductDetailComponent — sticky buy bar (P1)', () => {
  let fixture: ComponentFixture<ProductDetailComponent>;
  let component: ProductDetailComponent;
  let routerSpy: jasmine.SpyObj<Router>;
  let cartSvc: { addToCart: jasmine.Spy; setBuyNowItem: jasmine.Spy };
  let productSvc: { getProduct: jasmine.Spy; getProductsByCategory: jasmine.Spy; getPreview: jasmine.Spy };
  let originalIntersectionObserver: unknown;

  function boot(product: any): void {
    productSvc.getProduct.and.returnValue(of(product));
    fixture = TestBed.createComponent(ProductDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit + render template với product đã nạp
    // Bỏ qua setTimeout trong ngOnInit: gắn observer trực tiếp, deterministic.
    (component as any).setupStickyObserver();
  }


  beforeAll(() => {
    originalIntersectionObserver = (window as any).IntersectionObserver;
  });

  beforeEach(() => {
    (window as any).IntersectionObserver = FakeIntersectionObserver;
    FakeIntersectionObserver.latest = null;

    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    // Ivy render template khi createComponent -> RouterLinkWithHref cần events.
    (routerSpy as any).events = of();
    (routerSpy as any).createUrlTree = () => ({});
    (routerSpy as any).serializeUrl = () => '';
    cartSvc = {
      addToCart: jasmine.createSpy('addToCart'),
      setBuyNowItem: jasmine.createSpy('setBuyNowItem')
    };
    productSvc = {
      getPreview: jasmine.createSpy('getPreview').and.returnValue(of({ enabled: false, pageCount: 0, pages: [] })),
      getProduct: jasmine.createSpy('getProduct'),
      getProductsByCategory: jasmine.createSpy('getProductsByCategory').and.returnValue(of([]))
    };

    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [ProductDetailComponent],
      // Template dùng <lucide-icon> từ thư viện ngoài.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject({ get: (key: string) => (key === 'id' ? '57' : null) }).asObservable()
          }
        },
        { provide: Router, useValue: routerSpy },
        { provide: CartService, useValue: cartSvc },
        { provide: ProductService, useValue: productSvc },
        {
          provide: ReviewService,
          useValue: {
            changes$: new BehaviorSubject(null).asObservable(),
            getReviews: () => [],
            getUserReview: () => null,
            getAverageRating: () => 0,
            upsertReview: () => of({})
          }
        },
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => true,
            currentUser: { userId: 1, email: 'test@vinabook.vn', name: 'Tester' }
          }
        },
        { provide: NotificationService, useValue: { error: () => undefined, success: () => undefined } },
        {
          provide: WishlistService,
          useValue: { isInWishlist: () => false, getCount: () => 0, toggleWishlist: () => true }
        }
      ]
    });
  });

  afterEach(() => {
    document.body.classList.remove('has-sticky-buy-bar');
    localStorage.removeItem('vinabook_recently_viewed');
    (window as any).IntersectionObserver = originalIntersectionObserver;
  });

  it('ẩn khi CTA gốc đang nằm trong viewport', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    const io = FakeIntersectionObserver.latest!;
    expect(io).not.toBeNull();
    expect(io.observed.length).toBe(1);

    io.callback([{ isIntersecting: true }]);
    expect(component.stickyBarVisible).toBe(false);
  });


  it('observer được disconnect và dọn class body khi destroy', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    const io = FakeIntersectionObserver.latest!;
    io.callback([{ isIntersecting: false }]);
    expect(component.stickyBarVisible).toBe(true);

    fixture.destroy();

    expect(io.disconnected).toBe(true);
    expect(document.body.classList.contains('has-sticky-buy-bar')).toBe(false);
  });

  it('nút trong sticky bar gọi đúng buyNow()/addToCart() của component', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    FakeIntersectionObserver.latest!.callback([{ isIntersecting: false }]);
    fixture.detectChanges();

    const buySpy = spyOn(component, 'buyNow');
    const cartSpy = spyOn(component, 'addToCart');

    const buttons = fixture.debugElement.queryAll(By.css('.sticky-buy-bar button'));
    expect(buttons.length).toBe(2);

    buttons[0].nativeElement.click();
    expect(buySpy).toHaveBeenCalled();

    buttons[1].nativeElement.click();
    expect(cartSpy).toHaveBeenCalled();
  });

  it('hết hàng: maxQty = 0 và cả hai nút sticky bị disabled', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT, quantity: 0 });

    expect(component.maxQty).toBe(0);

    FakeIntersectionObserver.latest!.callback([{ isIntersecting: false }]);
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.sticky-buy-bar button'));
    expect(buttons.length).toBe(2);
    expect(buttons[0].nativeElement.disabled).toBe(true);
    expect(buttons[1].nativeElement.disabled).toBe(true);

    // Phòng thủ nghiệp vụ: handler gốc vẫn chặn khi hết hàng.
    component.addToCart();
    component.buyNow();
    expect(cartSvc.addToCart).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalledWith(['/checkout']);
  });

  it('resize lên desktop làm ẩn bar đang hiển thị', () => {
    const widthStub = spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    FakeIntersectionObserver.latest!.callback([{ isIntersecting: false }]);
    expect(component.stickyBarVisible).toBe(true);

    widthStub.and.returnValue(1280);
    window.dispatchEvent(new Event('resize'));

    expect(component.stickyBarVisible).toBe(false);
  });

  it('hiện khi CTA gốc rời viewport, và ẩn lại khi CTA gốc quay về', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    const io = FakeIntersectionObserver.latest!;

    io.callback([{ isIntersecting: false }]);
    expect(component.stickyBarVisible).toBe(true);
    expect(document.body.classList.contains('has-sticky-buy-bar')).toBe(true);

    io.callback([{ isIntersecting: true }]);
    expect(component.stickyBarVisible).toBe(false);
    expect(document.body.classList.contains('has-sticky-buy-bar')).toBe(false);
  });

  it('không hiện sticky bar trên desktop (>768px)', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1280);
    boot({ ...BASE_PRODUCT });

    const io = FakeIntersectionObserver.latest!;
    io.callback([{ isIntersecting: false }]);

    expect(component.stickyBarVisible).toBe(false);
  });

  it('portal bar ra document.body để position:fixed không bị phá bởi transform ancestor', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(390);
    boot({ ...BASE_PRODUCT });

    FakeIntersectionObserver.latest!.callback([{ isIntersecting: false }]);
    fixture.detectChanges();

    const el = document.querySelector('.sticky-buy-bar');
    expect(el).not.toBeNull();
    expect(el!.parentElement).toBe(document.body);
  });

  it('P2: ghi nhận ID vào lịch sử sau khi product tải thành công', () => {
    localStorage.removeItem('vinabook_recently_viewed');
    boot({ ...BASE_PRODUCT });

    const ids = TestBed.inject(RecentlyViewedService).getIds();
    expect(ids).toContain(57);
  });

  it('P2: không ghi nhận khi product load lỗi', () => {
    localStorage.removeItem('vinabook_recently_viewed');
    productSvc.getProduct.and.returnValue(throwError(new Error('catalog fail')));

    fixture = TestBed.createComponent(ProductDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loadError).toBe(true);
    expect(component.product).toBeUndefined();
    expect(TestBed.inject(RecentlyViewedService).getIds()).toEqual([]);
  });

  it('không mở đọc thử khi sách chưa có nội dung được cấp phép', () => {
    boot({ ...BASE_PRODUCT });
    expect(component.previewAvailable).toBeFalse();
  });

  it('bật đọc thử khi có trang văn bản được cấp phép', () => {
    productSvc.getPreview.and.returnValue(of({ enabled: true, pageCount: 1,
      pages: [{ enabled: true, contentType: 'text', textContent: 'Nội dung đọc thử' }] }));
    boot({ ...BASE_PRODUCT });
    expect(component.previewAvailable).toBeTrue();
  });

  it('không bật đọc thử với các trang trống', () => {
    productSvc.getPreview.and.returnValue(of({ enabled: true, pageCount: 1,
      pages: [{ enabled: true, contentType: 'text', textContent: '   ' }] }));
    boot({ ...BASE_PRODUCT });
    expect(component.previewAvailable).toBeFalse();
  });

  it('P2: breadcrumb render khi có product, có aria-current="page" và link Sách', () => {
    boot({ ...BASE_PRODUCT });

    const nav = fixture.debugElement.query(By.css('nav.breadcrumb'));
    expect(nav).not.toBeNull();

    const current = nav.query(By.css('.current'));
    expect(current.nativeElement.getAttribute('aria-current')).toBe('page');
    expect(nav.nativeElement.textContent).toContain(BASE_PRODUCT.name);

    const links = nav.queryAll(By.css('a')).map(a => a.nativeElement.getAttribute('routerLink'));
    expect(links).toContain('/');
    expect(links).toContain('/books');
  });

  it('P2: breadcrumb không render ở trạng thái lỗi', () => {
    productSvc.getProduct.and.returnValue(throwError(new Error('fail')));
    fixture = TestBed.createComponent(ProductDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('nav.breadcrumb'))).toBeNull();
  });

});
