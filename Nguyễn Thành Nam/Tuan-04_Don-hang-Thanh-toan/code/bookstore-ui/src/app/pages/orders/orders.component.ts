import { Component, OnInit } from '@angular/core';

import { Router } from '@angular/router';

import { OrderService } from 'src/app/services/order.service';
import { AuthService } from 'src/app/services/auth.service';
import { PaymentService } from 'src/app/services/payment.service';
import { NotificationService } from 'src/app/services/notification.service';

@Component({
  selector: 'app-orders',
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.scss']
})
export class OrdersComponent implements OnInit {

  orders: any[] = [];

  loading = true;
  loadError = false;
  payingOrderId = 0;

  constructor(
    private orderService: OrderService,
    private authService: AuthService,
    private router: Router,
    private paymentService: PaymentService,
    private notification: NotificationService
  ) {}

  ngOnInit(): void {

    this.loading = true;
    this.loadError = false;

    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }

    this.orderService
      .getOrders(this.authService.currentUser.email)
      .subscribe(
        orders => {
          this.orders = orders;
          this.loading = false;
        },
        () => {
          this.orders = [];
          this.loading = false;
          this.loadError = true;
        }
      );

  }

  statusClass(status: string): string {
    const value = (status || '').toLowerCase();
    if (value.includes('hủy') || value.includes('cancel')) { return 'cancelled'; }
    if (value.includes('hoàn') || value.includes('success')) { return 'completed'; }
    if (value.includes('giao') || value.includes('deliver')) { return 'shipping'; }
    return 'pending';
  }

  paymentMethodLabel(method: string): string {
    switch (method) {
      case 'BANK_QR': return 'Chuyển khoản QR';
      case 'VNPAY': return 'VNPay';
      case 'MOMO': return 'MoMo';
      default: return 'Thanh toán khi nhận hàng';
    }
  }

  paymentStatusLabel(order: any): string {
    if (order.paymentStatus === 'PAID') { return 'Đã thanh toán'; }
    if (order.paymentStatus === 'FAILED') { return 'Chưa hoàn tất'; }
    if (order.paymentMethod === 'COD') { return 'Thanh toán khi nhận hàng'; }
    return 'Chờ thanh toán';
  }

  canPay(order: any): boolean {
    return order.statusCode !== 2 && order.statusCode !== 3
      && order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID';
  }

  continuePayment(order: any): void {
    if (!this.canPay(order) || this.payingOrderId) { return; }
    if (order.paymentMethod === 'BANK_QR' && order.paymentStatus === 'PENDING') {
      this.router.navigate(['/payment/result'], { queryParams: { orderId: order.id } });
      return;
    }
    this.payingOrderId = order.id;
    this.paymentService.start(order.id).subscribe(
      payment => {
        this.payingOrderId = 0;
        if (payment.redirectUrl) {
          window.location.assign(payment.redirectUrl);
          return;
        }
        this.router.navigate(['/payment/result'], { queryParams: { orderId: order.id } });
      },
      error => {
        this.payingOrderId = 0;
        const message = error && error.error && error.error.message
          ? error.error.message : 'Không thể mở thanh toán';
        this.notification.error(message);
      }
    );
  }

}
