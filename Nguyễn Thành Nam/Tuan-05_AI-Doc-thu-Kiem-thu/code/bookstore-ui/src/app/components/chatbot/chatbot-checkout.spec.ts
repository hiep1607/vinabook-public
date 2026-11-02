import { of, Subject, throwError } from 'rxjs';
import { ChatbotComponent } from './chatbot.component';

describe('Chat purchase confirmation', () => {
  let component: ChatbotComponent;
  let auth: any;
  let addresses: any;
  let checkout: any;
  const product: any = { id: 1, name: 'Sách thử', quantity: 10 };
  const address = { name: 'Người thử', phone: '0900000000', street: 'Địa chỉ thử' };
  beforeEach(() => {
    auth = { currentUser: { email: 'buyer@example.test' }, isLoggedIn: () => true };
    addresses = { getAddresses: jasmine.createSpy().and.returnValue([]), addAddress: jasmine.createSpy() };
    checkout = { quote: jasmine.createSpy().and.returnValue(of({ token: 'quote-token' })),
      confirm: jasmine.createSpy().and.returnValue(of({ orderId: 9 })), cancelDraft: jasmine.createSpy().and.returnValue(of(undefined)) };
    component = new ChatbotComponent({ greeting: () => ({ from: 'bot', text: 'Chào bạn' }), useAccount: () => {}, resetSession: () => {} } as any, {} as any, {} as any, {} as any, auth, addresses, checkout);
    component.ngOnInit();
    component.messages = [];
  });
  it('plain ok does not place an order but explicit confirmation does', () => {
    addresses.getAddresses.and.returnValue([address]);
    component.beginPurchase(product);
    component.send('ok');
    expect(checkout.confirm).not.toHaveBeenCalled();
    component.send('xác nhận đặt hàng');
    expect(checkout.confirm).toHaveBeenCalledOnceWith('quote-token');
    expect(component.purchase).toBeUndefined();
  });
  it('understands explicit Vietnamese confirmation with a pronoun', () => {
    addresses.getAddresses.and.returnValue([address]);component.beginPurchase(product);
    component.send('Thanh toán khi nhận hàng.');expect(checkout.confirm).not.toHaveBeenCalled();
    component.send('Tôi xác nhận đặt hàng.');expect(checkout.confirm).toHaveBeenCalledOnceWith('quote-token');
  });
  it('cancels the server draft when the user changes their mind', async () => {
    addresses.getAddresses.and.returnValue([address]);component.beginPurchase(product);
    await component.cancelPurchase();expect(checkout.cancelDraft).toHaveBeenCalledOnceWith('quote-token');expect(component.purchase).toBeUndefined();expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('never skips confirmation because the user asks to bypass it', () => {
    addresses.getAddresses.and.returnValue([address]);component.beginPurchase(product);
    component.send('Đặt đơn mà không cần xác nhận nhé.');expect(checkout.confirm).not.toHaveBeenCalled();expect(component.purchase?.quote).toBeDefined();
  });
  it('records and reverses chat consent to save the address', () => {
    component.beginPurchase(product);
    component.send('lưu địa chỉ cho lần sau');
    expect(component.purchase!.saveAddress).toBeTrue();
    component.send('không lưu địa chỉ');
    expect(component.purchase!.saveAddress).toBeFalse();
    expect(addresses.addAddress).not.toHaveBeenCalled();
  });
  it('explains why shipping information is needed', () => {
    component.beginPurchase(product);
    component.send('Tại sao cần nhập thông tin?');
    expect(component.messages[component.messages.length - 1].text).toContain('không gửi cho AI');
    expect(component.purchase!.form.recipient).toBe('');
  });
  it('does not automatically replace or confirm an expired quote', () => {
    addresses.getAddresses.and.returnValue([address]);
    checkout.confirm.and.returnValue(throwError({ status: 410 }));
    component.beginPurchase(product);
    component.send('xác nhận đặt hàng');
    expect(component.purchase!.quote).toBeUndefined();
    expect(component.purchase!.uncertain).toBeFalse();
    expect(checkout.quote).toHaveBeenCalledTimes(1);
    component.send('xác nhận đặt hàng');
    expect(checkout.quote).toHaveBeenCalledTimes(2);
    expect(checkout.confirm).toHaveBeenCalledTimes(1);
  });
  it('renders comparison cells without using raw HTML', () => {
    const message: any = { from: 'bot', text: 'So sánh:\n| Sách | Giá |\n|---|---|\n| <script>x</script> | 100đ |' };
    expect(component.comparisonRows(message)).toEqual([['Sách', 'Giá'], ['<script>x</script>', '100đ']]);
    expect(component.bubbleText(message)).toBe('So sánh:');
  });
  it('resumes only an explicit guest choice after sign-in without placing an order', () => {
    auth.currentUser = null; auth.isLoggedIn = () => false; component.ngDoCheck();
    component.beginPurchase(product);
    expect(component.purchase).toBeUndefined();
    auth.currentUser = {email:'buyer@example.test'}; auth.isLoggedIn = () => true;
    component.ngDoCheck();
    expect(component.purchase!.product.id).toBe(product.id);
    expect(checkout.confirm).not.toHaveBeenCalled();
    auth.currentUser = {email:'other@example.test'}; component.ngDoCheck();
    expect(component.purchase).toBeUndefined();
  });
  it('asks for missing address and never confirms automatically', () => {
    component.beginPurchase(product);
    expect(component.purchase).toBeDefined();
    expect(checkout.quote).not.toHaveBeenCalled();
    expect(checkout.confirm).not.toHaveBeenCalled();
  });

  it('does not reopen a cancelled draft from a delayed book change response', () => {
    const response = new Subject<any>();
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(response);
    component.beginPurchase(product);
    component.send('Đổi sang cuốn khác');
    component.cancelPurchase();
    response.next({ from: 'bot', text: 'Bản nháp', intent: 'PURCHASE', products: [{ ...product, id: 2 }] });
    expect(component.purchase).toBeUndefined();
    expect(component.typing).toBeFalse();
  });
  it('saves address only after explicit opt-in and successful confirmation', () => {
    component.beginPurchase(product);
    component.purchase!.quote = { token: 'quote-token', recipient: address.name, phone: address.phone, street: address.street } as any;
    component.purchase!.saveAddress = true;
    expect(addresses.addAddress).not.toHaveBeenCalled();
    component.confirmPurchase();
    expect(addresses.addAddress).toHaveBeenCalledWith('buyer@example.test', jasmine.objectContaining(address));
  });
  it('does not save an address without consent', () => {
    component.beginPurchase(product);
    component.purchase!.quote = { token: 'quote-token' } as any;
    component.confirmPurchase();
    expect(addresses.addAddress).not.toHaveBeenCalled();
  });
  it('opens purchase from a chat response without clicking Buy now', () => {
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(of({
      from: 'bot', text: 'Mình chuẩn bị bản nháp.', intent: 'PURCHASE', products: [product]
    }));
    component.send('đặt đơn giúp t');
    expect(component.purchase?.product.id).toBe(product.id);
    expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('resolves a different book instead of storing purchase text as recipient', () => {
    const other = { ...product, id: 2, name: 'Sách khác' };
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(of({
      from: 'bot', text: 'Bản nháp mới', intent: 'PURCHASE', products: [other]
    }));
    component.beginPurchase(product);
    component.send('t mua cuốn Sách khác');
    expect(component.purchase?.product.id).toBe(2);
    expect(component.purchase?.form.recipient).toBe('');
    expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('one address prepares a quote but does not create order', () => {
    addresses.getAddresses.and.returnValue([address]);
    component.beginPurchase(product);
    expect(checkout.quote).toHaveBeenCalled();
    expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('multiple addresses require explicit selection', () => {
    addresses.getAddresses.and.returnValue([address, { ...address, isDefault: true }]);
    component.beginPurchase(product);
    expect(checkout.quote).not.toHaveBeenCalled();
    component.selectShipping(address);
    expect(checkout.quote).toHaveBeenCalled();
  });
  it('uncertain confirmation retries the same token and blocks replacement', () => {
    addresses.getAddresses.and.returnValue([address]);
    checkout.confirm.and.returnValue(throwError({ status: 0 }));
    component.beginPurchase(product); component.confirmPurchase();
    component.cancelPurchase(); component.editPurchase(); component.confirmPurchase();
    expect(component.purchase?.uncertain).toBeTrue();
    expect(checkout.confirm.calls.allArgs()).toEqual([['quote-token'], ['quote-token']]);
    expect(checkout.quote).toHaveBeenCalledTimes(1);
  });
  it('changing account prevents confirmation', () => {
    addresses.getAddresses.and.returnValue([address]); component.beginPurchase(product);
    auth.currentUser.email = 'other@example.test'; component.confirmPurchase();
    expect(checkout.confirm).not.toHaveBeenCalled();
    expect(component.purchase).toBeUndefined();
  });
  it('collects shipping in chat locally without creating an order', () => {
    component.beginPurchase(product);
    component.send('Người thử');
    component.send('0900000000');
    component.send('Số 1 đường Kiểm Thử, phường Giả Lập');
    expect(component.purchase?.form.recipient).toBe('Người thử');
    expect(checkout.quote).toHaveBeenCalledTimes(1);
    expect(checkout.confirm).not.toHaveBeenCalled();
    expect(component.messages.every(m => m.private)).toBeTrue();
  });
  it('selects an address by its displayed number', () => {
    addresses.getAddresses.and.returnValue([address, { ...address, street: 'Địa chỉ 2' }]);
    component.beginPurchase(product); component.send('2');
    expect(component.purchase?.form.street).toBe('Địa chỉ 2');
    expect(checkout.quote).toHaveBeenCalledTimes(1);
  });
  it('answers shipping question without writing it into the recipient', () => {
    component.beginPurchase(product); component.send('Phí giao hàng bao nhiêu?');
    expect(component.purchase!.form.recipient).toBe('');
    expect(component.messages[component.messages.length - 1].text).toContain('20.000đ');
    expect(checkout.quote).not.toHaveBeenCalled();
  });
  it('keeps a draft on unknown questions and acknowledgements', () => {
    component.beginPurchase(product);
    component.send('Tại sao cần nhập thông tin?'); component.send('ok');
    expect(component.purchase!.form.recipient).toBe('');
    expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('understands uppercase Đổi and preserves shipping on a resolved book change', () => {
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(of({
      from: 'bot', text: 'Đổi sách', intent: 'PURCHASE', products: [{ ...product, id: 2 }]
    }));
    component.beginPurchase(product); component.purchase!.form.recipient = 'Nguyễn An';
    component.send('Đổi sang cuốn sách khác');
    expect(component.purchase!.product.id).toBe(2);
    expect(component.purchase!.form.recipient).toBe('Nguyễn An');
  });
  it('keeps old draft if a requested replacement cannot be resolved', () => {
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(of({
      from: 'bot', text: 'Bạn chọn cuốn nào?', intent: 'PURCHASE', products: []
    }));
    component.beginPurchase(product);
    component.send('Đổi sang cuốn không tồn tại');
    expect(component.purchase!.product.id).toBe(1);
  });
  it('updates quantity and requotes without creating an order', () => {
    addresses.getAddresses.and.returnValue([address]); component.beginPurchase(product);
    component.send('lấy 2 cuốn');
    expect(component.purchase!.form.quantity).toBe(2);
    expect(checkout.quote).toHaveBeenCalledTimes(2);
    expect(checkout.confirm).not.toHaveBeenCalled();
  });
  it('edits phone in chat and only applies a valid replacement', () => {
    addresses.getAddresses.and.returnValue([address]); component.beginPurchase(product);
    component.send('Sửa số điện thoại'); component.send('abc');
    expect(component.purchase!.form.phone).toBe(address.phone);
    component.send('0911111111');
    expect(component.purchase!.form.phone).toBe('0911111111');
    expect(checkout.quote).toHaveBeenCalledTimes(2);
  });
  it('does not send shipping history along with a book question', () => {
    (component as any).chatbot.ask = jasmine.createSpy().and.returnValue(of({ from: 'bot', text: 'Nội dung sách', intent: 'PRODUCT_INFO' }));
    component.beginPurchase(product); component.send('Nguyễn An');
    component.send('Tóm tắt nội dung cuốn này');
    const history = (component as any).chatbot.ask.calls.mostRecent().args[1];
    expect(JSON.stringify(history)).not.toContain('Nguyễn An');
    expect(component.purchase!.form.recipient).toBe('Nguyễn An');
  });
});
