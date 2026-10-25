import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  url = environment.apiUrl + "/api/orders";

  urlOrderDetail = environment.apiUrl + "/api/orderDetail";

  constructor(private httpClient: HttpClient) { }

  get() {
    return this.httpClient.get(this.url);
  }

  getById(id:number) {
    return this.httpClient.get(this.url+'/'+id);
  }

  getByOrder(id:number) {
    return this.httpClient.get(this.urlOrderDetail+'/order/'+id);
  }

  cancel(id: number) {
    return this.httpClient.put(this.url+'/cancel/'+id, null);
  }

  deliver(id: number) {
    return this.httpClient.put(this.url+'/deliver/'+id, null);
  }

  success(id: number) {
    return this.httpClient.put(this.url+'/success/'+id, null);
  }

  markPaymentPaid(id: number) {
    return this.httpClient.put(environment.apiUrl + '/api/payments/orders/' + id + '/mark-paid', null);
  }
}
