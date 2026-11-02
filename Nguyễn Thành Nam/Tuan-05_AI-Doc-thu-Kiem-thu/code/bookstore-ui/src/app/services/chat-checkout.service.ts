import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface ChatShipping {
  productId: number;
  quantity: number;
  recipient: string;
  phone: string;
  street: string;
}
export interface ChatQuote extends ChatShipping {
  token: string;
  name: string;
  unitPrice: number;
  subtotal: number;
  shipping: number;
  total: number;
  expiresAt: number;
}
@Injectable({ providedIn: 'root' })
export class ChatCheckoutService {
  private readonly api = environment.apiUrl + '/api/chat/checkout';
  constructor(private http: HttpClient) {}
  quote(input: ChatShipping) { return this.http.post<ChatQuote>(this.api + '/quote', input); }
  cancelDraft(token: string) { return this.http.delete<void>(this.api + '/' + encodeURIComponent(token)); }
  cancelOrder(orderId: number) { return this.http.post<{orderId: number; status: string}>(environment.apiUrl + '/api/orders/me/' + orderId + '/cancel', {confirmed: true}); }
  confirm(token: string) {
    return this.http.post<{orderId: number}>(this.api + '/' + encodeURIComponent(token) + '/confirm', {});
  }
}
