import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';

import { NotificationService } from 'src/app/services/notification.service';
import { PaymentService } from 'src/app/services/payment.service';

@Component({
  selector: 'app-payment-result',
  templateUrl: './payment-result.component.html',
  styleUrls: ['./payment-result.component.scss']
})
export class PaymentResultComponent implements OnInit, OnDestroy {

  orderId = 0;
  payment: any = null;
  loading = true;
  retrying = false;
  loadError = '';
  private pollSubscription?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private paymentService: PaymentService,
    private notification: NotificationService
  ) { }

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.queryParamMap.get('orderId'));
    if (!this.orderId) {
      this.loading = false;
      this.loadError = 'Không tìm thấy mã đơn hàng trong kết quả thanh toán.';
      return;
    }
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
    }
  }

  startPolling(): void {
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
    }
    this.pollSubscription = timer(0, 8000).subscribe(() => this.loadStatus());
  }

  loadStatus(): void {
    this.paymentService.getStatus(this.orderId).subscribe(
      payment => {
        this.payment = payment;
        this.loading = false;
        this.loadError = '';
        if (payment.paymentStatus === 'PAID' || payment.paymentStatus === 'FAILED') {
          if (this.pollSubscription) {
            this.pollSubscription.unsubscribe();
          }
        }
      },
      () => {
        this.loading = false;
        this.loadError = 'Không tải được trạng thái thanh toán. Vui lòng thử lại.';
      }
    );
  }

  retryPayment(): void {
    if (!this.orderId || this.retrying) {
      return;
    }
    this.retrying = true;
    this.paymentService.start(this.orderId).subscribe(
      result => {
        this.retrying = false;
        if (result.redirectUrl) {
          window.location.assign(result.redirectUrl);
          return;
        }
        this.payment = result;
        this.startPolling();
      },
      error => {
        this.retrying = false;
        const message = error && error.error && error.error.message
          ? error.error.message
          : 'Không thể tạo lại giao dịch';
        this.notification.error(message);
      }
    );
  }

  copy(value: string, label: string): void {
    if (!value) {
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(() => this.notification.success('Đã sao chép ' + label));
      return;
    }
    this.notification.info(label + ': ' + value);
  }

  methodLabel(): string {
    if (!this.payment) { return ''; }
    switch (this.payment.paymentMethod) {
      case 'BANK_QR': return 'Chuyển khoản QR';
      case 'VNPAY': return 'VNPay';
      case 'MOMO': return 'MoMo';
      default: return 'Thanh toán khi nhận hàng';
    }
  }

  goToOrders(): void {
    this.router.navigate(['/orders']);
  }
}
