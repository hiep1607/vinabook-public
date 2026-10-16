import { Component } from '@angular/core';
import { CartService } from 'src/app/services/cart.service';
import { Router } from '@angular/router';
import { NotificationService } from 'src/app/services/notification.service';
import { MotionService } from 'src/app/services/motion.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent {
cartItems: any[] = [];

constructor(
  public cartService: CartService,
  private router: Router,
  private notification: NotificationService,
  private motion: MotionService
)
 {

  this.cartItems =
    this.cartService.getCartItems();

}
  

increase(item: any, event: MouseEvent) {

  item.quantity++;

  this.cartService.saveCart();
  this.motion.bump(
    (event.currentTarget as HTMLElement).closest('.quantity-box') as HTMLElement | null
  );

}

decrease(item: any, event: MouseEvent) {

  if (item.quantity > 1) {

    item.quantity--;

    this.cartService.saveCart();
    this.motion.bump(
      (event.currentTarget as HTMLElement).closest('.quantity-box') as HTMLElement | null
    );

  }

}

getSubtotal() {

  return this.cartItems
    .filter(item => item.selected)
    .reduce(

      (total, item) =>

        total +
        item.price * item.quantity,

      0

    );

}

getTotal() {

  return this.getSubtotal() +
         this.getShippingFee();

}
getShippingFee() {

  const selectedItems =
    this.cartItems.filter(
      item => item.selected
    );

  if (selectedItems.length === 0) {

    return 0;

  }

  return this.getSubtotal() >= 300000 ? 0 : 20000;

}
removeItem(item: any, event: MouseEvent) {
  const row = (event.currentTarget as HTMLElement).closest('.cart-item') as HTMLElement | null;
  this.motion.removeItem(row, () => {
    this.cartService.removeItem(item);
    this.cartItems = this.cartService.getCartItems();
  });

}

async goToCheckout(): Promise<void> {
  try { await this.cartService.flush(); } catch { this.notification.error('Chưa đồng bộ được giỏ. Vui lòng tải lại giỏ trước khi đặt hàng.'); return; }
  if (this.getSubtotal() <= 0) {
    this.notification.error('Vui lòng chọn ít nhất một sản phẩm để thanh toán');
    return;
  }
  this.router.navigate(['/checkout']);
}
}
