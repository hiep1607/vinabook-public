import { of, Subject, throwError } from 'rxjs';
import { CartService } from './cart.service';

describe('Account cart synchronization', () => {
  let auth: any;let http: any;let cart: CartService;
  const item = {id: 1, name: 'Sách', quantity: 2, stock: 10, price: 100000};
  beforeEach(() => {
    localStorage.clear();auth = {currentUser: {email: 'sync@test.invalid', token: 'fixture'}};
    http = {post: jasmine.createSpy().and.returnValue(of({revision: 1, items: [item]})),
      put: jasmine.createSpy().and.callFake((url: string, body: any) => of({revision: body.revision + 1, items: body.items.map((i: any) => ({...item, id: i.productId, quantity: i.quantity}))})),
      get: jasmine.createSpy().and.returnValue(of({revision: 3, items: []}))};
    cart = new CartService(auth, http);
  });
  afterEach(() => { cart.ngOnDestroy(); localStorage.clear(); });
  it('preserves remote items when adding during initial migration', async () => {
    const initial = new Subject<any>();http.post.and.returnValue(initial);
    cart.addToCart({id: 2, quantity: 10}, 1);
    initial.next({revision: 1, items: [item]});initial.complete();await cart.flush();
    expect(http.put.calls.mostRecent().args[1].items).toEqual([{productId: 1, quantity: 2}, {productId: 2, quantity: 1}]);
  });
  it('serializes updates and waits for remote completion', async () => {
    await cart.flush();cart.addToCart({...item, quantity: 10}, 1);cart.addToCart({...item, quantity: 10}, 1);await cart.flush();
    expect(http.put.calls.allArgs().map((a: any[]) => a[1].revision)).toEqual([1, 2]);expect(cart.getCartCount()).toBe(4);
  });
  it('does not silently overwrite a newer server revision after conflict', async () => {
    await cart.flush();http.put.and.returnValue(throwError({status: 409, error: {message: 'Giỏ đã đổi'}}));
    cart.addToCart({...item, quantity: 10}, 1);await expectAsync(cart.flush()).toBeRejected();expect(cart.syncError).toBe('Giỏ đã đổi');expect(http.put).toHaveBeenCalledTimes(1);
  });
  it('does not send a queued account A write using account B credentials', async () => {
    const initial = new Subject<any>();http.post.and.returnValue(initial);cart.addToCart({id: 2, quantity: 10}, 1);
    auth.currentUser = {email: 'other@test.invalid', token: 'other'};initial.next({revision: 1, items: [item]});initial.complete();
    await Promise.resolve();await Promise.resolve();expect(http.put).not.toHaveBeenCalled();
  });
  it('clears migrated server items even when the old local cache was empty', async () => {
    await cart.clearCart();expect(http.put.calls.mostRecent().args[1].items).toEqual([]);expect(cart.getCartCount()).toBe(0);
  });
});
