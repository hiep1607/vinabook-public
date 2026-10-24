import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

/** Đơn hàng server-side: quote tính giá/ship, confirm tạo đơn và giữ tồn kho. */
@Injectable({
  providedIn: 'root'
})
export class OrderService {

  private api = environment.apiUrl;

  constructor(private http: HttpClient) { }

  statusLabel(status: number): string {
    switch (status) {
      case 0: return 'Chờ xử lý';
      case 1: return 'Đang giao';
      case 2: return 'Hoàn thành';
      case 3: return 'Đã hủy';
      default: return 'Không rõ';
    }
  }

  /** Lịch sử đơn của user (kèm danh sách sản phẩm từng đơn). */
  getOrders(email: string): Observable<any[]> {

    return this.http.get<any[]>(this.api + '/api/orders/user/' + email).pipe(
      switchMap(orders => {

        if (!orders || orders.length === 0) {
          return of([]);
        }

        const withItems = orders.map(o =>
          this.http.get<any[]>(this.api + '/api/orderDetail/order/' + o.ordersId).pipe(
            map(details => this.mapOrder(o, details))
          )
        );

        return forkJoin(withItems);

      })
    );

  }

  /**
   * Đặt hàng: items là cart item local đã chọn
   * ({id, name, price (đã giảm), quantity, image,...}).
   */
  private pendingQuotes = new Map<string, string>();

  placeOrder(email: string, street: string, phone: string, items: any[], paymentMethod = 'COD', fromCart = false, cartRevision = 0): Observable<any> {
    const key = JSON.stringify([email, street, phone, items.map(i => [i.id, i.quantity, i.price]), paymentMethod, fromCart]);
    const recipient = street.match(/\(Người nhận: (.*?)\)$/)?.[1] || 'Khách hàng';
    const address = street.replace(/\s*\(Người nhận: .*?\)$/, '');
    const expectedSubtotal = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    const expectedTotal = expectedSubtotal + (expectedSubtotal > 0 && expectedSubtotal < 300000 ? 20000 : 0);
    const saved = this.pendingQuotes.get(key);
    const quote = saved ? of({token: saved, total: expectedTotal}) : this.http.post<any>(this.api + '/api/chat/checkout/quote', {
      items: items.map(i => ({productId: i.id, quantity: i.quantity})), recipient, phone, street: address,
      paymentMethod, fromCart, cartRevision
    });
    return quote.pipe(switchMap(q => {
      if (q.total !== expectedTotal) throw new Error('Giá hoặc phí giao hàng đã thay đổi. Vui lòng tải lại giỏ và kiểm tra tổng tiền.');
      this.pendingQuotes.set(key, q.token);
      return this.http.post<any>(this.api + '/api/chat/checkout/' + encodeURIComponent(q.token) + '/confirm', {}).pipe(
        map(result => { this.pendingQuotes.delete(key); return {ordersId: result.orderId}; }),
        catchError(error => { if ([400,401,403,404,409,410].includes(error.status)) this.pendingQuotes.delete(key); return throwError(error); })
      );
    }));
  }

  /** Map order backend → shape mà orders page / profile đang dùng. */
  private mapOrder(o: any, details: any[]): any {
    return {
      id: o.ordersId,
      date: o.orderDate,
      total: o.amount,
      status: this.statusLabel(o.status),
      statusCode: o.status,
      paymentMethod: o.paymentMethod || 'COD',
      paymentStatus: o.paymentStatus || 'UNPAID',
      paymentReference: o.paymentReference || '',
      paidAt: o.paidAt || null,
      shippingAddress: {
        label: '',
        name: o.user ? o.user.name : '',
        phone: o.phone,
        street: o.address
      },
      items: (details || []).map(d => ({
        image: d.product ? d.product.image : '',
        name: d.product ? d.product.name : '',
        quantity: d.quantity,
        price: d.price
      }))
    };
  }

}
