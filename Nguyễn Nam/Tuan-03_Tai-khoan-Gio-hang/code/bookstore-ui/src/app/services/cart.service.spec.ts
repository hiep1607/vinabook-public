import { CartService } from './cart.service';

describe('CartService', () => {
  let auth: { currentUser: any };
  let service: CartService;

  beforeEach(() => {
    localStorage.clear();
    auth = { currentUser: { email: 'reader@example.com' } };
    service = new CartService(auth as any);
  });

  afterEach(() => localStorage.clear());

  it('lưu giỏ hàng theo tài khoản đang đăng nhập', () => {
    service.addToCart({ id: 7, name: 'Sách thử', quantity: 5 }, 2);

    expect(JSON.parse(localStorage.getItem('cart_reader@example.com') || '[]'))
      .toEqual([jasmine.objectContaining({ id: 7, quantity: 2, selected: true })]);
  });

  it('không trộn giỏ hàng khi đổi tài khoản', () => {
    service.addToCart({ id: 7, quantity: 5 }, 1);
    auth.currentUser = { email: 'other@example.com' };

    expect(service.getCartItems()).toEqual([]);
  });

  it('xóa sản phẩm mua ngay mà không làm thay đổi giỏ thường', () => {
    service.addToCart({ id: 7, quantity: 5 }, 1);
    service.setBuyNowItem({ id: 9, quantity: 3 }, 2);

    service.clearBuyNowItem();

    expect(service.buyNowItem).toBeNull();
    expect(service.getCartItems().map(item => item.id)).toEqual([7]);
  });
});
