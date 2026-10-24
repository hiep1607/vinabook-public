import { of, Subject } from 'rxjs';

import { CheckoutComponent } from './checkout.component';

describe('CheckoutComponent', () => {
  let cartService: any;
  let router: any;
  let notification: any;
  let component: CheckoutComponent;

  beforeEach(() => {
    cartService = {
      buyNowItem: null,
      getCartItems: jasmine.createSpy('getCartItems').and.returnValue([]),
      clearBuyNowItem: jasmine.createSpy('clearBuyNowItem')
    };
    router = { navigate: jasmine.createSpy('navigate') };
    notification = {
      error: jasmine.createSpy('error'),
      success: jasmine.createSpy('success')
    };

    component = new CheckoutComponent(
      cartService,
      { placeOrder: jasmine.createSpy('placeOrder') } as any,
      { currentUser: { email: 'reader@example.com' } } as any,
      {
        getAddresses: jasmine.createSpy('getAddresses').and.returnValue([]),
        getDefault: jasmine.createSpy('getDefault')
      } as any,
      { getMethods: jasmine.createSpy('getMethods').and.returnValue(of({})) } as any,
      router,
      notification,
      { bump: jasmine.createSpy('bump'), orderSuccess: jasmine.createSpy('orderSuccess') } as any
    );
  });

  it('ưu tiên đúng sản phẩm mua ngay thay vì các dòng trong giỏ', () => {
    cartService.buyNowItem = { id: 9, quantity: 2 };
    cartService.getCartItems.and.returnValue([{ id: 7, quantity: 1, selected: true }]);

    component.ngOnInit();

    expect(component.cartItems).toEqual([cartService.buyNowItem]);
  });

  it('chỉ thanh toán các dòng giỏ hàng đã chọn', () => {
    cartService.getCartItems.and.returnValue([
      { id: 7, selected: true },
      { id: 8, selected: false }
    ]);

    component.ngOnInit();

    expect(component.cartItems.map(item => item.id)).toEqual([7]);
  });

  it('xóa state mua ngay khi rời checkout chưa hoàn tất', () => {
    component.ngOnDestroy();

    expect(cartService.clearBuyNowItem).toHaveBeenCalled();
  });

  it('chỉ hiển thị phương thức thanh toán đang khả dụng', () => {
    expect(component.availablePaymentMethods.map(method => method.code)).toEqual(['COD']);
    component.paymentMethods.find(method => method.code === 'MOMO').available = true;
    expect(component.availablePaymentMethods.map(method => method.code)).toEqual(['COD', 'MOMO']);
  });

  it('đưa người dùng về giỏ nếu không còn dòng hợp lệ', () => {
    component.ngOnInit();

    expect(notification.error).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/cart']);
  });

  it('chờ tải giỏ từ máy chủ trước khi kết luận giỏ trống', async () => {
    cartService.syncing = true;
    cartService.flush = () => Promise.resolve().then(() => {
      cartService.syncing = false;
      cartService.getCartItems.and.returnValue([{ id: 7, selected: true }]);
    });
    component.ngOnInit();
    expect(router.navigate).not.toHaveBeenCalled();
    await Promise.resolve(); await Promise.resolve();
    expect(component.cartItems.map(item => item.id)).toEqual([7]);
  });

  it('chỉ gửi một đơn khi bấm hai lần trong lúc đồng bộ giỏ', async () => {
    let finish: () => void = () => {};
    cartService.flush = () => new Promise<void>(resolve => finish = resolve);
    component.shippingForm = { label: '', name: 'Kiểm thử', phone: '0900000000', street: '12 Nguyễn Trãi, Hà Nội' };
    const order = (component as any).orderService.placeOrder;
    order.and.returnValue(new Subject());
    const first = component.placeOrder();
    await component.placeOrder();
    finish(); await first;
    expect(order).toHaveBeenCalledTimes(1);
  });
});
