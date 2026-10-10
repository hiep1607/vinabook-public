import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { HeaderComponent } from 'src/app/components/header/header.component';
import { AuthService } from 'src/app/services/auth.service';
import { CartService } from 'src/app/services/cart.service';
import { CategoryService } from 'src/app/services/category.service';
import { ProductService } from 'src/app/services/product.service';
import { SearchHistoryService } from 'src/app/services/search-history.service';
import { SearchService } from 'src/app/services/search.service';
import { WishlistService } from 'src/app/services/wishlist.service';

import { SearchComponent } from './search.component';

/** Catalog giả lập — "tam" khớp đúng 1 kết quả. */
const CATALOG = [
  { id: 1, name: 'Tam Quốc Diễn Nghĩa', author: 'La Quán Trung' },
  { id: 2, name: 'Nhật Ký Trong Tù', author: 'Hồ Chí Minh' },
  { id: 3, name: 'Dế Mèn Phiêu Lưu Ký', author: 'Tô Hoài' }
];

describe('SearchComponent — chuẩn hóa query canonical `q`', () => {
  let fixture: ComponentFixture<SearchComponent>;
  let component: SearchComponent;
  let routerSpy: jasmine.SpyObj<Router>;
  let searchSvc: { search: jasmine.Spy; getCategories: jasmine.Spy };
  let historySvc: { addToHistory: jasmine.Spy };
  let queryParams$: BehaviorSubject<Params>;

  beforeEach(() => {
    queryParams$ = new BehaviorSubject<Params>({});
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    searchSvc = {
      search: jasmine.createSpy('search').and.callFake((kw: string) =>
        kw
          ? CATALOG.filter(book => book.name.toLowerCase().indexOf(kw.toLowerCase()) !== -1)
          : CATALOG.slice()
      ),
      getCategories: jasmine.createSpy('getCategories').and.returnValue([])
    };
    historySvc = { addToHistory: jasmine.createSpy('addToHistory') };

    const productSvc = {
      getProducts: jasmine.createSpy('getProducts').and.returnValue(of(CATALOG.slice())),
      refresh: jasmine.createSpy('refresh')
    };

    TestBed.configureTestingModule({
      declarations: [SearchComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParams$.asObservable(),
            snapshot: { queryParams: {} }
          }
        },
        { provide: Router, useValue: routerSpy },
        { provide: SearchService, useValue: searchSvc },
        { provide: SearchHistoryService, useValue: historySvc },
        { provide: ProductService, useValue: productSvc }
      ]
    });
  });

  /** Khởi tạo component với một bộ query params (giả lập F5 thẳng vào URL). */
  function init(params: Params): void {
    queryParams$.next(params);
    fixture = TestBed.createComponent(SearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('đọc q=tam làm keyword canonical và tìm đúng kết quả', () => {
    init({ q: 'tam' });

    expect(component.keyword).toBe('tam');
    expect(searchSvc.search).toHaveBeenCalledWith('tam', '');
    // Chỉ "Tam Quốc Diễn Nghĩa" chứa "tam".
    expect(component.products.length).toBe(1);
    expect(component.products[0].name).toBe('Tam Quốc Diễn Nghĩa');
    expect(historySvc.addToHistory).toHaveBeenCalledWith('tam');
  });

  it('chuyển URL cũ keyword=tam sang q=tam bằng replaceUrl', () => {
    init({ keyword: 'tam' });

    expect(routerSpy.navigate).toHaveBeenCalledWith(
      [],
      jasmine.objectContaining({
        replaceUrl: true,
        queryParams: { q: 'tam' }
      })
    );

    // Sau khi URL được rewrite, subscription nhận params mới và chạy search.
    queryParams$.next({ q: 'tam' });
    expect(component.keyword).toBe('tam');
    expect(searchSvc.search).toHaveBeenCalledWith('tam', '');
  });

  it('q rỗng không gây lỗi và trả về toàn bộ catalog', () => {
    init({ q: '' });

    expect(component.loading).toBe(false);
    expect(component.loadError).toBe(false);
    expect(component.keyword).toBe('');
    expect(searchSvc.search).toHaveBeenCalledWith('', '');
    expect(component.products.length).toBe(CATALOG.length);
  });

  it('đổi category giữ nguyên q hiện tại, không tái sinh keyword', () => {
    init({ q: 'tam', category: '' });
    component.setCategory('Văn học');

    const args = routerSpy.navigate.calls.mostRecent().args;
    expect(args[0]).toEqual(['/search']);
    const config = args[1] as any;
    expect(config.queryParamsHandling).toBe('merge');
    expect(config.queryParams).toEqual({ category: 'Văn học' });
    expect(Object.prototype.hasOwnProperty.call(config.queryParams, 'keyword')).toBe(false);
  });
});
describe('HeaderComponent — điều hướng tìm kiếm bằng query `q`', () => {
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);
    // Ivy render template ngay khi createComponent -> RouterLinkWithHref cần events.
    (routerSpy as any).events = of();

    TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      // Template dùng <lucide-icon> từ thư viện; với test này chỉ cần logic TS.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: Router, useValue: routerSpy },
        {
          provide: CartService,
          useValue: { getCartCount: () => 0, changes$: of() }
        },
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, currentUser: { name: '', email: '' } }
        },
        { provide: WishlistService, useValue: { getCount: () => 0 } },
        { provide: SearchService, useValue: {} },
        {
          provide: SearchHistoryService,
          useValue: { addToHistory: jasmine.createSpy('addToHistory') }
        },
        { provide: CategoryService, useValue: { getAll: () => of([]) } },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: new BehaviorSubject<Params>({}).asObservable() }
        }
      ]
    });
  });

  it('search() điều hướng /search?q=..., không dùng keyword', () => {
    const headerFixture = TestBed.createComponent(HeaderComponent);
    const header = headerFixture.componentInstance;

    header.keyword = '  tam  ';
    header.search();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'tam' }
    });
    const config = routerSpy.navigate.calls.mostRecent().args[1] as any;
    expect(Object.prototype.hasOwnProperty.call(config.queryParams, 'keyword')).toBe(false);
  });

  it('search() không điều hướng khi từ khóa rỗng', () => {
    const headerFixture = TestBed.createComponent(HeaderComponent);
    const header = headerFixture.componentInstance;

    header.keyword = '   ';
    header.search();

    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });
});
