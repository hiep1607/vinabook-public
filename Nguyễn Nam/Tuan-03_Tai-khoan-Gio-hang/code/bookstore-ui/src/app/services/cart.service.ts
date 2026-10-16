import { Injectable, OnDestroy, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CartService implements OnDestroy {

  buyNowItem: any = null;
  items: any[] = [];

  private loadedKey = '';
  private revision = 0;
  private generation = 0;
  private writes = 0;
  private savedItems: any[] = [];
  private remoteItems: any[] = [];
  private pending: Promise<void> = Promise.resolve();
  syncError = '';
  syncing = false;
  private readonly api = environment.apiUrl + '/api/cart/me';
  private readonly onFocus = () => { if (this.remote() && !this.syncing && !this.syncError) this.refresh(); };

  constructor(private authService: AuthService, @Optional() private http?: HttpClient) {
    window.addEventListener('focus', this.onFocus);
  }

  ngOnDestroy(): void { window.removeEventListener('focus', this.onFocus); }

  saveCart(): void {
    this.ensureScope();
    localStorage.setItem(this.loadedKey, JSON.stringify(this.items));
    if (!this.remote()) return;
    const snapshot = this.items.map(item => ({ ...item }));
    const changes = new Map<number, any>();
    for (const item of this.savedItems) if (!snapshot.some(i => i.id === item.id)) changes.set(item.id, null);
    for (const item of snapshot) if (!this.savedItems.some(i => i.id === item.id && i.quantity === item.quantity)) changes.set(item.id, item);
    this.savedItems = snapshot;
    const scope = this.generation;
    const ownerKey = this.loadedKey;
    const sequence = ++this.writes;
    const requestId = this.identifier();
    this.syncing = true;
    this.pending = this.pending.then(async () => {
      if (scope !== this.generation || ownerKey !== this.currentKey() || !this.remote()) throw new Error('Tài khoản đã thay đổi.');
      const merged = new Map(this.remoteItems.map(i => [i.id, i]));
      changes.forEach((item, id) => { if (item) merged.set(id, item); else merged.delete(id); });
      const response = await this.http!.put<any>(this.api, { revision: this.revision, requestId, items: this.lines([...merged.values()]) }).toPromise();
      if (scope !== this.generation || ownerKey !== this.currentKey()) return;
      this.revision = response.revision;
      this.remoteItems = response.items;
      if (sequence === this.writes) this.apply(response);
    });
    this.observe(this.pending, scope);
  }

  /** Call before checkout or reporting that a mutation completed. */
  async flush(): Promise<void> { this.ensureScope(); await this.pending; if (this.syncError) throw new Error(this.syncError); }
  get serverRevision(): number { return this.revision; }

  async clearCart(): Promise<void> { await this.flush(); this.items.splice(0); this.saveCart(); await this.flush(); }

  refresh(): void {
    this.ensureScope();
    if (!this.remote() || this.syncing) return;
    const scope = this.generation;
    const ownerKey = this.loadedKey;
    if (this.syncError) localStorage.setItem(this.loadedKey + '_unsynced_backup', JSON.stringify(this.items));
    this.syncing = true; this.syncError = '';
    this.pending = this.http!.get<any>(this.api).toPromise().then(result => { if (scope === this.generation && ownerKey === this.currentKey()) this.apply(result); });
    this.observe(this.pending, scope);
  }

  private remote(): boolean { return !!this.http && !!this.authService.currentUser?.token; }
  private currentKey(): string { return 'cart_' + (this.authService.currentUser?.email?.toLowerCase() || 'guest'); }
  private identifier(): string { return 'cart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  private lines(items: any[]) {
    if (items.some(i => !Number.isInteger(i.id) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 99)) {
      throw new Error('Số lượng mỗi sách phải là số nguyên từ 1 đến 99. Vui lòng kiểm tra lại giỏ hàng.');
    }
    return items.map(i => ({ productId: i.id, quantity: i.quantity }));
  }
  private apply(result: any): void {
    const selected = new Map(this.items.map(i => [i.id, i.selected]));
    this.items.splice(0, this.items.length, ...result.items.map((i: any) => ({ ...i, selected: selected.get(i.id) !== false })));
    this.revision = result.revision;
    this.remoteItems = result.items.map((i: any) => ({ ...i }));
    this.savedItems = this.items.map(i => ({ ...i }));
    localStorage.setItem(this.loadedKey, JSON.stringify(this.items));
    this.syncError = '';
  }
  private observe(promise: Promise<void>, scope: number): void {
    promise.then(() => { if (scope === this.generation && this.pending === promise) this.syncing = false; }, error => {
      if (scope !== this.generation) return;
      this.syncing = false;
      this.syncError = error?.error?.message || error?.message || 'Chưa xác nhận được thay đổi trên máy chủ. Tải lại giỏ để kiểm tra trước khi thử lại.';
    });
  }

  addToCart(product: any, qty: number = 1): void {
    this.ensureScope();
    const existingItem = this.items.find(item => item.id === product.id);

    if (existingItem) {
      const max = product.quantity > 0 ? product.quantity : 99;
      existingItem.quantity = Math.min(existingItem.quantity + qty, max);
    } else {
      this.items.push({ ...product, quantity: qty, selected: true });
    }

    this.saveCart();
  }

  getCartItems(): any[] {
    this.ensureScope();
    return this.items;
  }

  removeItem(item: any): void {
    this.ensureScope();
    this.items.splice(0, this.items.length, ...this.items.filter(cartItem => cartItem.id !== item.id));
    this.saveCart();
  }

  getCartCount(): number {
    this.ensureScope();
    return this.items.reduce((total, item) => total + item.quantity, 0);
  }

  setBuyNowItem(product: any, qty: number = 1): void {
    this.ensureScope();
    this.buyNowItem = { ...product, quantity: qty, selected: true };
  }

  clearBuyNowItem(): void {
    this.buyNowItem = null;
  }

  private ensureScope(): void {
    const email = this.authService.currentUser && this.authService.currentUser.email
      ? this.authService.currentUser.email.toLowerCase()
      : 'guest';
    const key = `cart_${email}`;

    if (key === this.loadedKey) {
      return;
    }

    this.loadedKey = key;
    this.generation++; this.writes = 0; this.syncError = ''; this.syncing = false; this.pending = Promise.resolve();
    this.buyNowItem = null;
    const scoped = localStorage.getItem(key);

    if (scoped) {
      this.items = this.parseCart(scoped);
    } else {
      // Migrate the legacy shared cart once to its first account, never another account.
      const legacy = localStorage.getItem('cart');
      const migrationOwner = localStorage.getItem('cart_migration_owner');
      if (email !== 'guest' && legacy && (!migrationOwner || migrationOwner === email)) {
      this.items = this.parseCart(legacy);
      localStorage.setItem(key, JSON.stringify(this.items));
      localStorage.setItem('cart_migration_owner', email);
      } else this.items = [];
    }
    if (this.remote()) {
      const scope = this.generation;
      this.savedItems = this.items.map(i => ({ ...i })); this.remoteItems = [];
      let clientKey = localStorage.getItem(key + '_sync_client');
      if (!clientKey) { clientKey = this.identifier(); localStorage.setItem(key + '_sync_client', clientKey); }
      this.syncing = true;
      if (this.items.length) localStorage.setItem(key + '_migration_backup', JSON.stringify(this.items));
      const legacyItems = this.items.filter(i => Number.isInteger(i.id) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 99);
      this.pending = this.http!.post<any>(this.api + '/migrate', { clientKey, items: this.lines(legacyItems) }).toPromise()
        .then(result => { if (scope === this.generation && key === this.currentKey()) { this.revision = result.revision; this.remoteItems = result.items; if (!this.writes) this.apply(result); } });
      this.observe(this.pending, scope);
    }
  }

  private parseCart(value: string): any[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
