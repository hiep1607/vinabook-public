import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, ReplaySubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/**
 * Đánh giá server-side (từ 2026-06-12) qua /api/rates.
 * Toàn bộ rates được tải một lần và cache; các method đọc giữ nguyên
 * chữ ký đồng bộ (chạy trên cache) nên consumer cũ gần như không đổi.
 * `changes$` phát mỗi khi cache nạp xong / có review mới — dùng để
 * product-card cập nhật sao sau khi dữ liệu về.
 */
@Injectable({
  providedIn: 'root'
})
export class ReviewService {

  private url = environment.apiUrl + '/api/rates';

  private rates: any[] = [];

  /** Phát sau mỗi lần cache thay đổi (nạp lần đầu, upsert) */
  changes$ = new ReplaySubject<void>(1);

  constructor(private http: HttpClient) {
    this.refresh();
  }

  refresh(): void {
    this.http.get<any[]>(this.url).subscribe(rates => {
      this.rates = rates || [];
      this.changes$.next();
    });
  }

  /** Map Rate backend → shape review mà UI đang dùng */
  private toReview(r: any): any {
    return {
      email: r.user ? r.user.email : '',
      name: r.user ? r.user.name : '',
      content: r.comment,
      rating: r.rating || 0,
      date: r.rateDate
    };
  }

  getReviews(productId: number): any[] {
    return this.rates
      .filter(r => r.product && r.product.productId === productId)
      .map(r => this.toReview(r));
  }

  getUserReview(productId: number, email: string): any {
    return this.getReviews(productId).find(r => r.email === email) || null;
  }

  getAverageRating(productId: number): number {

    const reviews = this.getReviews(productId);

    if (reviews.length === 0) {
      return 0;
    }

    const sum = reviews.reduce(
      (total: number, r: any) => total + (r.rating || 0),
      0
    );

    return Math.round((sum / reviews.length) * 10) / 10;

  }

  /** Số review user này đã viết (cho tab thống kê ở profile) */
  countByEmail(email: string): number {
    return this.rates.filter(r => r.user && r.user.email === email).length;
  }

  /**
   * Upsert: user đã có rate cho sách này → PUT, chưa → POST.
   * review = {userId, email, name, content, rating}.
   */
  upsertReview(productId: number, review: any): Observable<any> {

    const existing = this.rates.find(
      r => r.product && r.product.productId === productId
        && r.user && r.user.email === review.email
    );

    const body: any = {
      rating: review.rating,
      comment: review.content,
      rateDate: new Date().toISOString(),
      user: { userId: review.userId },
      product: { productId: productId }
    };

    let call: Observable<any>;

    if (existing) {
      body.id = existing.id;
      body.orderDetail = existing.orderDetail || null;
      call = this.http.put(this.url, body);
    } else {
      body.orderDetail = null;
      call = this.http.post(this.url, body);
    }

    return call.pipe(
      tap(() => this.refresh()),
      map(saved => saved)
    );

  }

}
