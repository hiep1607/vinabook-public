import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { CoverImageService } from './cover-image.service';
import { BookPreviewManifest } from '../models/book-preview';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  url = environment.apiUrl + '/api/products';

  /** Catalog từ backend, map về shape storefront, cache 1 lần cho cả app */
  private products$!: Observable<any[]>;

  constructor(
    private httpClient: HttpClient,
    private coverImages: CoverImageService
  ) { }

  /**
   * Chuyển product backend (productId, price gốc + discount %, category object)
   * về shape mà các component storefront đang dùng
   * (id, price đã giảm, oldPrice, category string).
   */
  private mapProduct(p: any): any {
    const oldPrice = p.price;
    const price = Math.round(p.price * (100 - p.discount) / 100);
    return {
      id: p.productId,
      name: p.name,
      author: p.author || 'Đang cập nhật',
      categoryId: p.category ? p.category.categoryId : null,
      category: p.category ? String(p.category.categoryName).trim() : 'Khác',
      price: price,
      oldPrice: oldPrice,
      discount: p.discount,
      image: this.coverImages.normalize(p.image),
      originalImage: p.image,
      description: p.description,
      quantity: p.quantity,
      sold: p.sold,
      enteredDate: p.enteredDate,
      pageCount: p.pageCount,
      coverType: p.coverType,
      width: p.width,
      height: p.height,
      spineImage: p.spineImage,
      backImage: p.backImage
    };
  }

  /** Toàn bộ catalog (đã map + cache). Mọi nơi trong app dùng hàm này. */
  getProducts(): Observable<any[]> {
    if (!this.products$) {
      this.products$ = this.httpClient.get<any[]>(this.url).pipe(
        map(list => list.map(p => this.mapProduct(p))),
        shareReplay(1)
      );
    }
    return this.products$;
  }

  /**
   * Xóa cache và tải lại catalog — dùng cho nút "Thử lại" khi gọi API thất bại
   * (shareReplay phát lại cả error cho subscriber mới nên phải tạo stream mới).
   */
  refresh(): Observable<any[]> {
    this.products$ = undefined as any;
    return this.getProducts();
  }

  /** Một sản phẩm theo id (lấy từ cache catalog). */
  getProduct(id: number): Observable<any> {
    return this.getProducts().pipe(
      map(list => list.find(p => p.id === id))
    );
  }

  /** Sản phẩm thuộc một thể loại, lọc theo categoryId từ DB (lấy từ cache catalog). */
  getProductsByCategory(categoryId: number): Observable<any[]> {
    return this.getProducts().pipe(
      map(list => list.filter(p => p.categoryId === categoryId))
    );
  }

  // ---- các endpoint backend gốc (giữ cho tương thích) ----

  getAll() {
    return this.httpClient.get(this.url);
  }

  getLasted() {
    return this.httpClient.get(this.url + '/latest');
  }

  getBestSeller() {
    return this.httpClient.get(this.url + '/bestseller');
  }

  getRated() {
    return this.httpClient.get(this.url + '/rated');
  }

  getOne(id: number) {
    return this.httpClient.get(this.url + '/' + id);
  }

  getByCategory(id: number) {
    return this.httpClient.get(this.url + '/category/' + id);
  }

  getSuggest(categoryId: number, productId: number) {
    return this.httpClient.get(this.url + '/suggest/' + categoryId + '/' + productId);
  }

  /** Manifest nhỏ của các trang đọc thử; ảnh chỉ được trình duyệt tải khi reader mở. */
  getPreview(productId: number): Observable<BookPreviewManifest> {
    return this.httpClient.get<BookPreviewManifest>(`${this.url}/${productId}/preview`);
  }
}
