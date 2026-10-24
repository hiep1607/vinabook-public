import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

import { AddressService } from 'src/app/services/address.service';
import { AuthService } from 'src/app/services/auth.service';
import { CartService } from 'src/app/services/cart.service';
import { NotificationService } from 'src/app/services/notification.service';
import { OrderService } from 'src/app/services/order.service';
import { PaymentService } from 'src/app/services/payment.service';
import { MotionService } from 'src/app/services/motion.service';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit, OnDestroy {

  @ViewChild('placeOrderButton') placeOrderButton?: ElementRef<HTMLButtonElement>;

  readonly freeShippingThreshold = 300000;

  cartItems: any[] = [];
  addresses: any[] = [];
  selectedAddress: any = null;
  placing = false;
  private preparing = false;
  private destroyed = false;
  orderPlaced = false;
  mode = 'form';
  showNewForm = false;
  saveToProfile = true;
  formError = '';
  methodsLoading = true;
  selectedPayment = 'COD';
  paymentMethods: any[] = [
    { code: 'COD', short: 'COD', label: 'Thanh toán khi nhận hàng', description: 'Thanh toán sau khi nhận và kiểm tra kiện sách.', available: true },
    { code: 'BANK_QR', short: 'QR', label: 'Chuyển khoản QR', description: 'Quét mã VietQR, đơn được xử lý sau khi cửa hàng xác nhận.', available: false },
    { code: 'VNPAY', short: 'VN', label: 'VNPay', description: 'Thẻ ngân hàng, tài khoản hoặc VNPAY-QR.', available: false },
    { code: 'MOMO', short: 'M', label: 'Ví MoMo', description: 'Thanh toán qua ví MoMo trên cổng MoMo Test.', available: false }
  ];

  shippingForm = {
    label: '',
    name: '',
    phone: '',
    street: ''
  };

  constructor(
    private cartService: CartService,
    private orderService: OrderService,
    private authService: AuthService,
    private addressService: AddressService,
    private paymentService: PaymentService,
    private router: Router,
    private notification: NotificationService,
    private motion: MotionService
  ) {}

  ngOnInit(): void {
    this.cartService.getCartItems();
    if (this.cartService.syncing) {
      this.cartService.flush().then(() => { if (!this.destroyed) this.ngOnInit(); }, () => {
        this.formError = this.cartService.syncError || 'Chưa tải được giỏ hàng. Vui lòng quay lại giỏ hàng và thử lại.';
      });
      return;
    }
    this.cartItems = this.cartService.buyNowItem
      ? [this.cartService.buyNowItem]
      : this.cartService.getCartItems().filter(item => item.selected);

    if (this.cartItems.length === 0) {
      this.notification.error('Vui lòng chọn ít nhất một sản phẩm trước khi thanh toán');
      this.router.navigate(['/cart']);
      return;
    }

    this.loadAddresses();
    this.loadPaymentMethods();
  }

  loadPaymentMethods(): void {
    this.paymentService.getMethods().subscribe(
      methods => {
        this.paymentMethods = this.paymentMethods.map(method => ({
          ...method,
          available: method.code === 'COD' || !!(methods[method.code] && methods[method.code].available),
          label: methods[method.code] ? methods[method.code].label : method.label,
          description: methods[method.code] ? methods[method.code].description : method.description
        }));
        this.methodsLoading = false;
      },
      () => {
        this.methodsLoading = false;
        this.selectedPayment = 'COD';
      }
    );
  }

  selectPayment(method: any, event?: MouseEvent): void {
    if (method.available && !this.placing) {
      this.selectedPayment = method.code;
      this.motion.bump(event?.currentTarget as HTMLElement | undefined);
    }
  }

  selectedPaymentLabel(): string {
    const selected = this.paymentMethods.find(method => method.code === this.selectedPayment);
    return selected ? selected.label : 'Thanh toán khi nhận hàng';
  }

  get availablePaymentMethods(): any[] {
    return this.paymentMethods.filter(method => method.available);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cartService.clearBuyNowItem();
  }

  private get email(): string {
    return this.authService.currentUser ? this.authService.currentUser.email : '';
  }

  loadAddresses(): void {
    this.addresses = this.addressService.getAddresses(this.email);

    if (this.addresses.length === 0) {
      this.mode = 'form';
      this.showNewForm = true;
      return;
    }

    this.mode = this.addresses.length === 1 ? 'single' : 'select';
    this.selectedAddress = this.addressService.getDefault(this.email) || this.addresses[0];
  }

  selectAddress(address: any): void {
    this.selectedAddress = address;
  }

  useNewAddress(): void {
    this.showNewForm = true;
    this.formError = '';
    this.shippingForm = { label: '', name: '', phone: '', street: '' };
  }

  cancelNewAddress(): void {
    this.showNewForm = false;
    this.formError = '';
  }

  getSubtotal(): number {
    return this.cartItems.reduce(
      (total, item) => total + Number(item.price) * item.quantity,
      0
    );
  }

  getShipping(): number {
    const subtotal = this.getSubtotal();
    return subtotal > 0 && subtotal < this.freeShippingThreshold ? 20000 : 0;
  }

  getTotal(): number {
    return this.getSubtotal() + this.getShipping();
  }

  async placeOrder(): Promise<void> {
    if (this.placing || this.preparing || this.orderPlaced) return;
    this.preparing = true;
    try { await this.cartService.flush(); } catch { this.formError = this.cartService.syncError || 'Chưa đồng bộ được giỏ hàng. Vui lòng kiểm tra lại.'; return; }
    finally { this.preparing = false; }
    if (this.destroyed) return;
    this.formError = '';

    let shippingAddress: any;
    let isNewAddress = false;

    if (this.mode === 'form' || this.showNewForm) {
      const phone = this.shippingForm.phone.trim();
      if (!this.shippingForm.name.trim() || !phone || !this.shippingForm.street.trim()) {
        this.formError = 'Vui lòng nhập đầy đủ thông tin giao hàng';
        return;
      }
      if (!/^0\d{9}$/.test(phone)) {
        this.formError = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0';
        return;
      }

      shippingAddress = {
        label: this.shippingForm.label.trim() || 'Địa chỉ',
        name: this.shippingForm.name.trim(),
        phone,
        street: this.shippingForm.street.trim()
      };
      isNewAddress = true;
    } else {
      if (!this.selectedAddress) {
        this.formError = 'Vui lòng chọn địa chỉ giao hàng';
        return;
      }
      shippingAddress = { ...this.selectedAddress };
    }

    const addressLine = `${shippingAddress.street} (Người nhận: ${shippingAddress.name})`;
    this.placing = true;

    this.orderService
      .placeOrder(this.email, addressLine, shippingAddress.phone, this.cartItems, this.selectedPayment, !this.cartService.buyNowItem, this.cartService.serverRevision)
      .subscribe(
        (order: any) => {
          if (isNewAddress && this.saveToProfile) {
            this.addressService.addAddress(this.email, this.shippingForm);
          }
          if (!this.cartService.buyNowItem) {
            this.cartService.refresh();
          }
          this.cartService.clearBuyNowItem();
          if (this.selectedPayment === 'COD') {
            this.placing = false;
            this.orderPlaced = true;
            this.notification.success('Đặt hàng thành công');
            this.motion.orderSuccess(this.placeOrderButton?.nativeElement)
              .then(() => this.router.navigate(['/orders']));
            return;
          }

          this.paymentService.start(order.ordersId).subscribe(
            payment => {
              if (payment.redirectUrl) {
                window.location.assign(payment.redirectUrl);
                return;
              }
              this.placing = false;
              this.router.navigate(['/payment/result'], { queryParams: { orderId: order.ordersId } });
            },
            error => {
              this.placing = false;
              const message = error && error.error && error.error.message
                ? error.error.message
                : 'Không mở được cổng thanh toán';
              this.notification.error('Đơn đã được tạo. ' + message);
              this.router.navigate(['/orders']);
            }
          );
        },
        error => {
          this.placing = false;
          this.formError = error?.error?.message || error?.message || 'Chưa xác nhận được kết quả đặt hàng. Vui lòng kiểm tra Đơn hàng trước khi đặt lại.';
          this.notification.error(this.formError);
        }
      );
  }
}
