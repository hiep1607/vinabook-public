import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class PaymentService {

  private api = environment.apiUrl + '/api/payments';

  constructor(private http: HttpClient) { }

  getMethods(): Observable<any> {
    return this.http.get<any>(this.api + '/methods');
  }

  start(orderId: number): Observable<any> {
    return this.http.post<any>(this.api + '/orders/' + orderId + '/start', {});
  }

  getStatus(orderId: number): Observable<any> {
    return this.http.get<any>(this.api + '/orders/' + orderId + '/status');
  }
}
