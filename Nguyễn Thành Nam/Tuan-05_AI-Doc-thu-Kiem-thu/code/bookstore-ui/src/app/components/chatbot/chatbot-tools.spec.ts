import { of } from 'rxjs';
import { ChatbotComponent } from './chatbot.component';
import { ChatAction, ChatMessage } from '../../services/chatbot.service';
import { CartService } from '../../services/cart.service';

describe('Chat tool execution', () => {
  let component: ChatbotComponent;
  let auth: any;
  let cart: CartService;
  let bot: any;
  const product: any = { id: 7001, name: 'Sách thử', price: 95000, quantity: 10 };
  const email = 'chat-tools@example.test';
  const chatKey = 'vinabook_chat_session_v2:user:' + encodeURIComponent(email);
  beforeEach(() => {
    localStorage.removeItem('cart_' + email); sessionStorage.removeItem(chatKey);
    auth = { currentUser: { email }, isLoggedIn: () => true };
    cart = new CartService(auth);
    bot = { greeting: () => ({ from: 'bot', text: 'Chào bạn' }), useAccount: () => {},
      ask: jasmine.createSpy().and.returnValue(of({ from: 'bot', text: 'OK' })) };
    component = new ChatbotComponent(bot, cart, { url: '/product/7001' } as any, {} as any, auth, {} as any, {} as any);
    component.ngOnInit();
  });
  afterEach(() => { component.ngOnDestroy(); localStorage.removeItem('cart_' + email); sessionStorage.removeItem(chatKey); });
  function propose(type: ChatAction['type'], quantity = 1): ChatMessage {
    const action: ChatAction = { type, quantity, label: type, productId: product.id, requiresConfirmation: true };
    const message: ChatMessage = { from: 'bot', text: 'Chờ xác nhận', products: [product], actions: [action] };
    component.messages.push(message);
    component.runAction(action, message);
    return message;
  }
  it('does not mutate before confirmation and applies the requested quantity once', async () => {
    const message = propose('ADD_TO_CART', 3);
    expect(cart.getCartCount()).toBe(0);
    await component.confirmAddToCart(); await component.confirmAddToCart();
    expect(cart.getCartCount()).toBe(3);
    expect(message.actions).toEqual([]);
    expect(message.execution?.status).toBe('COMPLETED');
  });
  it('updates and removes through the same confirmation handler', async () => {
    cart.addToCart(product, 1);
    propose('UPDATE_CART_QUANTITY', 4); await component.confirmAddToCart();
    expect(cart.getCartCount()).toBe(4);
    propose('REMOVE_FROM_CART'); await component.confirmAddToCart();
    expect(cart.getCartCount()).toBe(0);
  });
  it('blocks quantities exceeding stock without claiming completion', async () => {
    cart.addToCart(product, 9);
    const message = propose('ADD_TO_CART', 3); await component.confirmAddToCart();
    expect(cart.getCartCount()).toBe(9);
    expect(message.execution).toBeUndefined();
    expect(component.messages[component.messages.length - 1].text).toContain('vượt tồn kho');
  });
  it('rolls back in-memory changes if local storage cannot save', async () => {
    spyOn(cart, 'saveCart').and.throwError('Không lưu được');
    const message = propose('ADD_TO_CART'); await component.confirmAddToCart();
    expect(cart.getCartCount()).toBe(0); expect(message.execution).toBeUndefined();
  });
  it('discards a pending action when the signed-in account changes', async () => {
    propose('ADD_TO_CART', 2); auth.currentUser = null; await component.confirmAddToCart();
    auth.currentUser = { email };
    expect(cart.getCartCount()).toBe(0);
  });
  it('sends page context and only IDs and quantities from the cart', async () => {
    cart.addToCart(product, 2); component.send('Cuốn này có tốt không?');
    const args = bot.ask.calls.mostRecent().args;
    expect(args[2]).toBe(7001); expect(args[3]).toEqual([{ productId: 7001, quantity: 2 }]);
  });
  it('honors the backend quantity when preparing checkout', async () => {
    const begin = spyOn(component, 'beginPurchase');
    bot.ask.and.returnValue(of({ from: 'bot', text: 'Bản nháp', intent: 'PURCHASE', products: [product],
      actions: [{ type: 'BUY_NOW', productId: 7001, quantity: 3, requiresConfirmation: true }] }));
    component.send('Lấy ba cuốn này');
    expect(begin).toHaveBeenCalledWith(product, 3, false);
  });
  it('clears the whole cart only after confirmation', async () => {
    cart.addToCart(product, 2);
    const action: ChatAction = {type: 'CLEAR_CART', label: 'Xóa toàn giỏ', requiresConfirmation: true};
    const message: ChatMessage = {from: 'bot', text: 'Xác nhận?', actions: [action]};
    component.runAction(action, message);expect(cart.getCartCount()).toBe(2);
    await component.confirmAddToCart();expect(cart.getCartCount()).toBe(0);expect(message.execution?.status).toBe('COMPLETED');
  });
  it('reports cancellation only after a server receipt', async () => {
    const cancel = jasmine.createSpy().and.returnValue(of({orderId: 7, status: 'CANCELLED'}));
    (component as any).checkout = {cancelOrder: cancel};
    const action: ChatAction = {type: 'CANCEL_ORDER', orderId: 7, label: 'Hủy đơn', requiresConfirmation: true};
    const message: ChatMessage = {from: 'bot', text: 'Xác nhận?', actions: [action]};
    component.runAction(action, message);expect(cancel).not.toHaveBeenCalled();
    await component.confirmAddToCart();expect(cancel).toHaveBeenCalledOnceWith(7);expect(message.execution?.status).toBe('COMPLETED');
  });
});
