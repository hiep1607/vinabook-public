import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ChatAction, ChatbotService, ChatMessage, ChatProduct } from 'src/app/services/chatbot.service';
import { CartService } from 'src/app/services/cart.service';
import { FabCollisionService } from 'src/app/services/fab-collision.service';
import { AuthService } from 'src/app/services/auth.service';
import { AddressService } from 'src/app/services/address.service';
import { ChatCheckoutService, ChatQuote, ChatShipping } from 'src/app/services/chat-checkout.service';
import { isBookChange, isPurchaseQuestion, normalizePurchaseText } from './chat-purchase-language';

/**
 * Widget trợ lý ảo nổi góc phải dưới. Hỏi đáp về sản phẩm, gợi ý sách và
 * giải đáp hình thức thanh toán. Logic truy xuất và grounding nằm ở backend
 * RAG; component này chỉ quản lý phiên hiển thị, thao tác giỏ hàng và focus.
 * Render ở app.component.html, hiển thị trên mọi trang.
 */
@Component({
  selector: 'app-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss']
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked, AfterViewInit, DoCheck {

  @ViewChild('scrollBody') private scrollBody!: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') private chatInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fabBtn') private fabBtn?: ElementRef<HTMLButtonElement>;

  open = false;
  draft = '';
  typing = false;
  messages: ChatMessage[] = [];
  pendingAction?: { action: ChatAction; message: ChatMessage; product?: ChatProduct };
  actionBusy = false;
  readonly addedProductIds = new Set<number>();
  errorText = '';
  lastFailedInput = '';
  purchase?: { owner: string; product: ChatProduct; addresses: any[]; form: ChatShipping;
    quote?: ChatQuote; draftToken?: string; busy: boolean; error: string; uncertain: boolean; saveAddress?: boolean;
    editField?: 'recipient' | 'phone' | 'street' };
  checkoutExpanded = true;
  private checkoutRequests = new Subscription();

  private shouldScroll = false;
  private get storageKey(): string {
    return 'vinabook_chat_session_v2:' + (this.accountEmail ? 'user:' + encodeURIComponent(this.accountEmail) : 'guest');
  }
  private conversationVersion = 0;
  private request?: Subscription;
  private collisionSub?: Subscription;
  private accountEmail?: string;
  // Only the guest's explicit public book choice can resume across sign-in.
  // Never transfer an authenticated account's draft or shipping data.
  private guestPurchase?: { product: ChatProduct; quantity: number };

  constructor(
    private chatbot: ChatbotService,
    private cart: CartService,
    private router: Router,
    private collision: FabCollisionService,
    private auth: AuthService,
    private addresses: AddressService,
    private checkout: ChatCheckoutService
  ) {}

  ngOnInit(): void {
    this.accountEmail = this.auth.currentUser?.email;
    // Legacy history has no owner; never assign it to the next signed-in account.
    try { sessionStorage.removeItem('vinabook_chat_session'); } catch {}
    this.chatbot.useAccount(this.accountEmail);
    this.messages = this.restoreMessages();
    if (this.messages.length === 0) {
      this.messages.push(this.chatbot.greeting());
    }
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.checkoutRequests.unsubscribe();
    this.collisionSub?.unsubscribe();
  }

  /** Nâng FAB lên trên CTA khi có va chạm ở mobile (xem FabCollisionService). */
  ngAfterViewInit(): void {
    this.collisionSub = this.collision
      .watch(() => this.fabBtn?.nativeElement ?? null)
      .subscribe(lift => {
        const el = this.fabBtn?.nativeElement;
        if (el) {
          el.style.setProperty('--fab-lift', `${lift}px`);
        }
      });
    // Bố cục đầu tiên có thể chưa ổn định — kiểm tra lại sau khi render xong.
    setTimeout(() => this.collision.recheck());
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngDoCheck(): void {
    this.synchronizeAccount();
  }

  private synchronizeAccount(): boolean {
    const email = this.auth.currentUser?.email;
    if (email !== this.accountEmail) {
      const resume = !this.accountEmail && email ? this.guestPurchase : undefined;
      this.guestPurchase = undefined;
      this.conversationVersion++;
      this.accountEmail = email;
      this.purchase = undefined;
      this.request?.unsubscribe();
      this.checkoutRequests.unsubscribe();
      this.checkoutRequests = new Subscription();
      this.typing = false;
      this.pendingAction = undefined;
      this.addedProductIds.clear();
      this.draft = '';
      this.errorText = '';
      this.lastFailedInput = '';
      this.chatbot.useAccount(email);
      this.messages = this.restoreMessages();
      if (!this.messages.length) this.messages = [this.chatbot.greeting()];
      if (resume) {
        this.open = true;
        this.purchaseReply('Bạn đã đăng nhập. Mình tiếp tục bản nháp cho “' + resume.product.name + '”; đơn chỉ được tạo sau khi bạn xem lại và xác nhận.');
        this.beginPurchase(resume.product, resume.quantity);
      }
      this.shouldScroll = true;
      return true;
    }
    return false;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      this.shouldScroll = true;
      setTimeout(() => this.chatInput?.nativeElement.focus(), 0);
    }
  }

  send(text?: string): void {
    if (this.synchronizeAccount()) return;
    const value = (text ?? this.draft).trim();
    if (!value || this.typing || this.actionBusy) {
      return;
    }

    this.cart.getCartItems?.();
    if (this.cart.syncing) {
      const version = this.conversationVersion; this.typing = true;
      this.cart.flush().then(() => { this.typing = false; if (version === this.conversationVersion) this.send(value); }, () => { this.typing = false; this.errorText = this.cart.syncError; });
      return;
    }
    const replacingBook = !!this.purchase && isBookChange(value);
    if (this.purchase && this.handlePurchaseMessage(value)) { this.draft = ''; return; }
    this.messages.push({ from: 'user', text: value });
    this.draft = '';
    this.shouldScroll = true;
    this.persistMessages();

    this.typing = true;
    this.errorText = '';
    this.lastFailedInput = '';
    const history = this.messages.slice(0, -1).filter(m => !m.private);
    if (this.purchase && !replacingBook) history.push({ from: 'bot', text: 'Cuốn đang tìm hiểu: ' + this.purchase.product.name,
      products: [this.purchase.product] });
    let responseIndex = -1;
    const version = this.conversationVersion;
    const isCurrent = () => version === this.conversationVersion && this.accountEmail === this.auth.currentUser?.email;
    const pageProduct = this.router.url?.match(/^\/product\/(\d+)(?:[/?#]|$)/);
    const activeProductId = this.purchase && !replacingBook ? this.purchase.product.id : pageProduct ? Number(pageProduct[1]) : undefined;
    const cartItems = (this.cart.getCartItems?.() || []).filter(item => Number.isInteger(item.id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99)
      .slice(0, 100).map(item => ({ productId: item.id, quantity: item.quantity }));
    this.request = this.chatbot.ask(value, history, activeProductId, cartItems).subscribe({
      next: message => {
        if (!isCurrent()) return;
        if (responseIndex < 0) {
          responseIndex = this.messages.length;
          this.messages.push(message);
        } else {
          this.messages[responseIndex] = message;
        }
        this.typing = !!message.streaming;
        this.shouldScroll = true;
        if (!message.streaming) {
          this.persistMessages();
          if (message.intent === 'PURCHASE' && message.products?.length === 1 && (!this.purchase || replacingBook)) {
            const quantity = value.match(/(?:mua|lấy|đặt|chốt)\s+(\d{1,2})\s+(?:cuốn|quyển|bản)/i);
            const action = message.actions?.find(a => a.type === 'BUY_NOW');
            this.beginPurchase(message.products[0], action?.quantity || (quantity ? Number(quantity[1]) : 1), replacingBook);
          }
        }
      },
      error: (error: Error) => {
        if (!isCurrent()) return;
        this.typing = false;
        this.errorText = error.message || 'Trợ lý chưa xử lý được câu hỏi. Vui lòng thử lại.';
        this.lastFailedInput = value;
        this.shouldScroll = true;
      },
      complete: () => {
        if (!isCurrent()) return;
        this.typing = false;
        this.persistMessages();
        setTimeout(() => this.chatInput?.nativeElement.focus(), 0);
      }
    });
  }

  private purchaseReply(text: string): void {
    this.messages.push({ from: 'bot', text, private: true });
    this.shouldScroll = true;
  }

  private shippingComplete(): boolean {
    const f = this.purchase?.form;
    return !!f && !!f.recipient.trim() && /^0\d{9}$/.test(f.phone) && !!f.street.trim();
  }

  /** Returns false only for public book questions / an explicit book change. */
  private handlePurchaseMessage(value: string): boolean {
    const p = this.purchase!;
    const q = normalizePurchaseText(value);
    if (p.busy || p.uncertain) {
      this.purchaseReply(p.uncertain ? 'Kết quả đặt hàng chưa rõ. Bạn bấm Kiểm tra lại xác nhận để kiểm tra cùng bản nháp, tránh tạo đơn trùng.'
        : 'Mình đang xử lý bản nháp. Bạn chờ một chút trước khi thay đổi thông tin nhé.');
      return true;
    }
    if (isBookChange(value) && !isPurchaseQuestion(value)) return false;
    // Never route shipping-looking payloads to the public assistant.
    const publicBookQuestion = /\b(noi dung|tom tat|thong diep|tac gia|kho doc|so sanh)\b/.test(q)
      && !/\d{6}|\b(dia chi|dien thoai|nguoi nhan)\b/.test(q);
    if (publicBookQuestion) { this.checkoutExpanded = false; return false; }
    this.messages.push({ from: 'user', text: value, private: true });
    p.error = '';
    if (/^(?:(?:toi|minh|t) )?(?:doi y,? )?(?:huy|bo ban nhap|khong mua|khong dat|thoi)(?: don| don nay| ban nhap| nua| nhe| nha)?[.!]*$/.test(q)) {
      this.cancelPurchase(); return true;
    }
    if (/\b(khong can xac nhan|bo qua xac nhan)\b/.test(q)) { this.purchaseReply('Mình cần bạn xem bản tổng hợp và xác nhận trước khi tạo đơn.'); return true; }
    if (/^(?:thanh toan khi nhan hang|cod|chon cod|dung cod)[.!]*$/.test(q)) {
      this.purchaseReply('Mình đã ghi nhận thanh toán khi nhận hàng (COD) cho bản nháp này.'); return true;
    }
    if (/\b(dia chi.*da luu|dia chi cu)\b/.test(q)) {
      const saved = this.addresses.getAddresses(p.owner);
      if (saved.length === 1) this.selectShipping(saved[0]);
      else if (saved.length > 1) { p.addresses = saved; this.checkoutExpanded = true; this.purchaseReply('Bạn chọn số thứ tự địa chỉ đã lưu bên dưới nhé.'); }
      else this.purchaseReply('Tài khoản chưa có địa chỉ lưu trên trình duyệt này. Bạn nhập tên, điện thoại và địa chỉ để giao hàng nhé.');
      return true;
    }
    if (isPurchaseQuestion(value)) {
      let answer: string;
      if (/\b(tai sao|vi sao)\b/.test(q) && /\b(thong tin|dien thoai|dia chi|ten)\b/.test(q)) {
        answer = 'Tên người nhận và địa chỉ giúp cửa hàng giao đúng nơi; số điện thoại dùng để liên hệ khi giao sách. Thông tin này chỉ dùng cho đơn hàng, không gửi cho AI. Bạn sẽ xem lại toàn bộ đơn trước khi xác nhận, và việc lưu địa chỉ cho lần sau là tùy chọn.';
      } else if (/\b(phi|ship|van chuyen|mien phi)\b/.test(q)) {
        answer = 'Phí giao hàng là 20.000đ, miễn phí khi tiền sách từ 300.000đ. Tổng tiền chính xác sẽ có ở bước Xem lại đơn.';
      } else if (/\b(thanh toan|cod|chuyen khoan|momo|vnpay)\b/.test(q)) {
        answer = 'Đặt trong chat hiện hỗ trợ thanh toán khi nhận hàng (COD). Chỉ tạo đơn sau khi bạn xác nhận; không cần gửi thông tin thẻ.';
      } else if (/\b(gia|tong tien|het bao nhieu)\b/.test(q)) {
        answer = p.quote ? 'Tổng đơn hiện tại là ' + p.quote.total.toLocaleString('vi-VN') + 'đ, đã gồm phí giao hàng.'
          : 'Giá đang hiển thị của “' + p.product.name + '” là ' + p.product.price.toLocaleString('vi-VN') + 'đ/cuốn. Mình sẽ kiểm tra lại giá và tồn kho khi lập bản tổng hợp.';
      } else if (/\b(giao|may ngay|khi nao)\b/.test(q)) {
        answer = 'Mình chưa có lịch giao dự kiến chính xác cho địa chỉ của bạn, nên không muốn hẹn sai. Bạn có thể xem trạng thái trong Đơn hàng sau khi đặt.';
      } else {
        answer = 'Mình chưa xác định chắc ý bạn. Bạn có thể hỏi phí giao hàng, giá sách, nội dung sách; hoặc nhắn “đổi sang cuốn …”, “sửa địa chỉ”, “lấy 2 cuốn”. Mình vẫn giữ nguyên bản nháp.';
      }
      this.checkoutExpanded = false; this.purchaseReply(answer); return true;
    }
    const quantity = q.match(/^(?:(?:toi|minh|t) )?(?:(?:doi|sua|tang|giam) )?(?:so luong(?: thanh)?|lay|mua|dat|cho minh)(?: la)?\s+(\d{1,3})(?:\s+(?:cuon|quyen|ban))?[.!]*$/);
    if (quantity) {
      const count = Number(quantity[1]);
      if (count < 1 || count > 99) { this.purchaseReply('Số lượng cần từ 1 đến 99 cuốn.'); return true; }
      p.form.quantity = count; p.quote = undefined;
      this.purchaseReply('Mình đã đổi số lượng thành ' + count + ' cuốn.');
      if (this.shippingComplete()) this.prepareQuote();
      return true;
    }
    const edit = q.match(/^(?:sua|doi|thay)(?: lai)? (dia chi|so dien thoai|dien thoai|ten|nguoi nhan)(?:\s*[:=]\s*|\s+(?:thanh|la)\s+)?(.*)$/);
    if (edit) {
      this.editPurchase(); p.addresses = [];
      p.editField = edit[1] === 'dia chi' ? 'street' : /thoai/.test(edit[1]) ? 'phone' : 'recipient';
      const label = p.editField === 'street' ? 'địa chỉ đầy đủ mới' : p.editField === 'phone' ? 'số điện thoại mới' : 'tên người nhận mới';
      if (!edit[2].trim()) { this.purchaseReply('Bạn cho mình ' + label + ' nhé. Thông tin cũ chỉ thay khi bạn nhập giá trị hợp lệ.'); return true; }
      // Use original text (not accent-stripped data) for the new field value.
      value = value.slice(value.length - edit[2].length).trim();
    }
    if (/^(?:(?:toi|minh|t) )?(?:dong y|xac nhan(?: dat hang| don hang| don)?|chot(?: don)?|dat don|dat hang|dat luon|mua ngay|ok|oke)(?: nhe| nha| di)?[.!]*$/.test(q)) {
      if (p.quote && /^(?:(?:toi|minh|t) )?(?:xac nhan(?: dat hang| don hang| don)?|chot(?: don)?|dat don|dat hang)(?: nhe| nha| di)?[.!]*$/.test(q)) { this.confirmPurchase(); }
      else if (p.quote) { this.checkoutExpanded = true; this.purchaseReply('Bạn kiểm tra bản tổng hợp rồi nhắn “xác nhận đặt hàng” hoặc bấm nút bên dưới để chốt đơn nhé.'); }
      else if (this.shippingComplete()) this.prepareQuote();
      else this.purchaseReply('Mình cần đủ tên, điện thoại và địa chỉ trước khi tổng hợp đơn. Bạn nhập tiếp hoặc điền vào bản nháp nhé.');
      return true;
    }
    if (/^(?:luu|dong y luu|hay luu)(?: lai)? dia chi(?: nay| cho lan sau)?[.!]*$/.test(q)) {
      p.saveAddress = true;
      this.purchaseReply('Mình sẽ lưu địa chỉ cho tài khoản này trên trình duyệt sau khi bạn xác nhận đặt hàng thành công.');
      return true;
    }
    if (/^(?:khong luu|dung luu)(?: dia chi)?[.!]*$/.test(q)) {
      p.saveAddress = false; this.purchaseReply('Mình sẽ chỉ dùng địa chỉ cho đơn này.'); return true;
    }
    if (p.addresses.length > 1) {
      const selection = q.match(/^(?:(?:chon )?(?:dia chi )?(?:so )?)(\d+)$/);
      const address = selection ? p.addresses[Number(selection[1]) - 1] : undefined;
      if (address) this.selectShipping(address);
      else if (/^(?:dung|them|nhap) dia chi (?:khac|moi)$/.test(q)) { p.addresses = []; this.checkoutExpanded = true; }
      else this.purchaseReply('Bạn chọn số thứ tự địa chỉ, hoặc nhắn “dùng địa chỉ mới” nhé.');
      return true;
    }
    if (p.quote && !p.editField) { this.purchaseReply('Mình giữ nguyên đơn. Bạn có thể nhắn “sửa địa chỉ”, “lấy 2 cuốn” hoặc kiểm tra rồi bấm Xác nhận đặt hàng.'); return true; }
    const field = p.editField || (!p.form.recipient ? 'recipient' : !/^0\d{9}$/.test(p.form.phone) ? 'phone' : !p.form.street ? 'street' : undefined);
    if (!field) { this.prepareQuote(); return true; }
    let data = value.trim();
    if (field === 'recipient') {
      data = data.replace(/^(?:tên(?: người nhận)?(?: là)?|người nhận(?: là)?|mình tên(?: là)?)\s*[:=]?\s*/i, '');
      if (!/^[\p{L}\p{M} .'-]{2,80}$/u.test(data) || /\b(mua|dat|doi|sua|phi|sach|chot|khong|giup|cam on|ok|oke)\b/.test(normalizePurchaseText(data))) {
        this.purchaseReply('Mình chưa nhận ra tên người nhận. Bạn nhập họ tên, ví dụ “Nguyễn An”, hoặc điền ô Người nhận nhé.'); return true;
      }
    } else if (field === 'phone') {
      data = data.replace(/^(?:sđt|sdt|số điện thoại|điện thoại)(?: là)?\s*[:=]?\s*/i, '').replace(/[\s.-]/g, '');
      if (!/^0\d{9}$/.test(data)) { this.purchaseReply('Bạn nhập số điện thoại 10 chữ số, bắt đầu bằng 0 nhé. Mình chưa thay thông tin cũ.'); return true; }
    } else if (data.length < 10 || data.length > 160 || !/\d|\b(duong|pho|thon|xom|ap|phuong|xa|quan|huyen|tinh|thanh pho)\b/.test(normalizePurchaseText(data))) {
      this.purchaseReply('Bạn cho mình địa chỉ đầy đủ gồm số nhà/đường hoặc thôn, phường/xã và tỉnh/thành nhé.'); return true;
    }
    p.form[field] = data; p.editField = undefined; p.quote = undefined;
    this.checkoutExpanded = false;
    if (this.shippingComplete()) { this.purchaseReply('Mình đã nhận đủ thông tin. Bạn kiểm tra bản tổng hợp trước khi xác nhận nhé.'); this.prepareQuote(); }
    else this.purchaseReply(!p.form.recipient ? 'Bạn cho mình họ tên người nhận nhé.' : !p.form.phone ? 'Cảm ơn bạn. Số điện thoại người nhận là gì?' : 'Bạn cho mình địa chỉ đầy đủ để giao sách nhé.');
    return true;
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  startNewConversation(): void {
    this.synchronizeAccount();
    if (this.purchase?.busy || this.purchase?.uncertain) return;
    if (this.purchase?.draftToken || this.purchase?.quote) {
      this.cancelPurchase().then(() => { if (!this.purchase) this.startNewConversation(); }); return;
    }
    this.purchase = undefined;
    this.guestPurchase = undefined;
    this.conversationVersion++;
    this.chatbot.resetSession();
    this.request?.unsubscribe();
    this.typing = false;
    this.pendingAction = undefined;
    this.errorText = '';
    this.messages = [this.chatbot.greeting()];
    try { sessionStorage.removeItem(this.storageKey); } catch {}
    this.shouldScroll = true;
  }

  openProduct(product: any): void {
    this.router.navigate(['/product', product.id]);
    this.open = false;
  }

  actionFor(message: ChatMessage, productId: number, type: ChatAction['type']): ChatAction | undefined {
    return message.actions?.find(action => action.productId === productId && action.type === type);
  }

  runAction(action: ChatAction, message: ChatMessage): void {
    if (this.synchronizeAccount() || this.typing || this.actionBusy) return;
    if (action.type === 'CLEAR_CART' || action.type === 'CANCEL_ORDER') {
      this.pendingAction = { action, message }; this.shouldScroll = true; return;
    }
    if (action.type === 'SHOW_CART') {
      const items = this.cart.getCartItems();
      this.messages.push({ from: 'bot', private: true, text: items.length
        ? 'Giỏ hàng của bạn:\n' + items.map(item => '• ' + item.name + ' — ' + item.quantity + ' cuốn').join('\n')
        : 'Giỏ hàng của bạn đang trống.' });
      this.shouldScroll = true;
      return;
    }
    if (action.type === 'BUY_NOW') {
      const product = message.products?.find(p => p.id === action.productId);
      if (product) this.beginPurchase(product, action.quantity || 1);
      return;
    }
    if (['ADD_TO_CART', 'REMOVE_FROM_CART', 'UPDATE_CART_QUANTITY'].includes(action.type) && action.productId) {
      const product = message.products?.find(item => item.id === action.productId);
      if (!product) return;
      {
        this.pendingAction = { action, message, product };
        this.shouldScroll = true;
      }
      return;
    }
    if (action.route) {
      this.router.navigateByUrl(action.route);
      this.open = false;
    }
  }

  async confirmAddToCart(): Promise<void> {
    if (this.synchronizeAccount() || this.actionBusy) return;
    if (!this.pendingAction) return;
    const { action, message, product } = this.pendingAction;
    this.pendingAction = undefined;
    this.actionBusy = true;
    const version = this.conversationVersion;
    const before = this.cart.getCartItems().map(item => ({ ...item }));
    try {
      if (action.type === 'CANCEL_ORDER') {
        if (!action.orderId) throw new Error('Thiếu mã đơn cần hủy.');
        const result = await this.checkout.cancelOrder(action.orderId).toPromise();
        if (version !== this.conversationVersion || this.synchronizeAccount()) return;
        if (result.status !== 'CANCELLED') throw new Error('Chưa nhận được xác nhận hủy đơn.');
        message.actions = []; message.execution = {tool: 'cancelOrder', status: 'COMPLETED'};
        this.purchaseReply('Đã hủy đơn #' + result.orderId + '.'); return;
      }
      await this.cart.flush();
      if (version !== this.conversationVersion || this.synchronizeAccount()) return;
      if (action.type === 'CLEAR_CART') {
        await this.cart.clearCart();
        if (version !== this.conversationVersion || this.synchronizeAccount()) return;
        message.actions = []; message.execution = {tool: 'clearCart', status: 'COMPLETED'};
        this.addedProductIds.clear(); this.purchaseReply('Đã xóa toàn bộ sách khỏi giỏ hàng.'); return;
      }
      if (!product) throw new Error('Thiếu sách cần sửa giỏ.');
      const quantity = action.quantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Số lượng không hợp lệ.');
      const existing = this.cart.getCartItems().find(item => item.id === product.id);
      if (action.type === 'REMOVE_FROM_CART') {
        if (!existing) throw new Error('Cuốn sách này hiện không có trong giỏ.');
        this.cart.removeItem(existing);
        this.addedProductIds.delete(product.id);
      } else if (action.type === 'UPDATE_CART_QUANTITY') {
        if (!existing) throw new Error('Cuốn sách này hiện không có trong giỏ.');
        if (quantity > product.quantity) throw new Error('Số lượng vượt tồn kho vừa tra cứu.');
        existing.quantity = quantity;
        this.cart.saveCart();
      } else {
        if ((existing?.quantity || 0) + quantity > product.quantity) throw new Error('Tổng số lượng vượt tồn kho vừa tra cứu.');
        this.cart.addToCart(product, quantity);
        this.addedProductIds.add(product.id);
      }
      await this.cart.flush();
      if (version !== this.conversationVersion || this.synchronizeAccount()) return;
      // Consume this proposal only after storage succeeds; later turns can propose a new change.
      message.actions = (message.actions || []).filter(a => a !== action);
      message.execution = { tool: 'cart', status: 'COMPLETED' };
      this.messages.push({ from: 'bot', private: true, text: action.type === 'REMOVE_FROM_CART'
        ? 'Đã xóa “' + product.name + '” khỏi giỏ hàng của bạn.'
        : 'Giỏ hàng đã cập nhật: “' + product.name + '” — ' + this.cart.getCartItems().find(item => item.id === product.id)?.quantity + ' cuốn.' });
    } catch (error) {
      if (version !== this.conversationVersion || this.synchronizeAccount()) return;
      this.cart.items.splice(0, this.cart.items.length, ...before);
      this.messages.push({ from: 'bot', private: true, text: (error as any)?.error?.message || (error instanceof Error ? error.message : 'Chưa xác nhận được thao tác. Bạn kiểm tra lại trước khi thử tiếp.') });
    } finally {
      this.actionBusy = false; this.shouldScroll = true; this.persistMessages();
    }
    this.shouldScroll = true;
    this.persistMessages();
  }

  beginPurchase(product: ChatProduct, quantity = 1, replace = false): void {
    if (this.purchase && (!replace || this.purchase.busy || this.purchase.uncertain)) {
      this.purchase.error = 'Hãy hoàn tất hoặc bỏ bản nháp hiện tại trước khi chọn cuốn khác.';
      return;
    }
    if (!this.auth.isLoggedIn()) {
      this.guestPurchase = { product, quantity };
      this.messages.push({ from: 'bot', text: 'Bạn đăng nhập để mình dùng đúng thông tin tài khoản và giúp bạn theo dõi đơn nhé. Sau khi đăng nhập tại đây, mình sẽ tiếp tục bản nháp cho “' + product.name + '”, chưa tạo đơn cho đến khi bạn xác nhận.',
        actions: [{ type: 'LOGIN', label: 'Đăng nhập', route: '/login', requiresConfirmation: false }] });
      return;
    }
    const owner = this.auth.currentUser.email;
    if (product.quantity < 1) { this.purchaseReply('Cuốn này hiện hết hàng. Mình chưa thay đổi bản nháp của bạn.'); return; }
    const previous = replace ? this.purchase : undefined;
    let saved: any[] = [];
    try { const list = this.addresses.getAddresses(owner); saved = Array.isArray(list) ? list : []; } catch {}
    this.purchase = { owner, product, addresses: saved, busy: false, error: '', uncertain: false,
      form: { productId: product.id, quantity, recipient: '', phone: '', street: '' } };
    this.checkoutExpanded = true;
    if (!previous && saved.length === 0) this.purchaseReply('Để giao sách đúng người, mình cần tên người nhận, số điện thoại và địa chỉ đầy đủ. Bạn có thể nhắn lần lượt hoặc điền bản nháp. Trước tiên, người nhận tên gì?');
    if (!previous && saved.length > 1) this.purchaseReply('Tài khoản có ' + saved.length + ' địa chỉ. Bạn muốn giao đến địa chỉ nào? Nhắn số thứ tự trong danh sách bên dưới nhé.');
    if (previous) {
      this.purchase.form = { ...previous.form, productId: product.id, quantity };
      this.purchase.addresses = previous.addresses;
      this.purchase.saveAddress = previous.saveAddress;
      if (this.shippingComplete()) this.prepareQuote();
    } else if (saved.length === 1) this.selectShipping(saved[0]);
    this.shouldScroll = true;
  }

  selectShipping(address: any): void {
    const p = this.purchase;
    if (!p || p.busy || p.uncertain) return;
    p.form = { ...p.form, recipient: address.name || '', phone: address.phone || '', street: address.street || '' };
    p.addresses = [];
    this.prepareQuote();
  }

  prepareQuote(): void {
    const p = this.purchase;
    if (!p || p.busy || p.uncertain || !this.checkPurchaseOwner()) return;
    const f = p.form;
    if (!f.recipient.trim() || !/^0\d{9}$/.test(f.phone) || !f.street.trim()
        || !Number.isInteger(f.quantity) || f.quantity < 1 || f.quantity > 99) {
      p.error = 'Cần tên người nhận, số điện thoại 10 số bắt đầu bằng 0, địa chỉ đầy đủ và số lượng từ 1–99.';
      return;
    }
    p.busy = true; p.error = ''; p.quote = undefined;
    this.checkoutRequests.add(this.checkout.quote({ ...f }).subscribe({
      next: quote => { if (this.purchase === p && this.checkPurchaseOwner()) {
        p.quote = quote; p.draftToken = quote.token; p.busy = false; this.checkoutExpanded = true; this.shouldScroll = true;
        this.purchaseReply('Mình đã kiểm tra giá và lập bản tổng hợp bên dưới. Bạn xem lại sách, địa chỉ và tổng tiền; nếu đúng, nhắn “xác nhận đặt hàng”. Bạn cũng có thể chọn lưu địa chỉ để dùng lần sau.');
      } },
      error: err => { if (this.purchase !== p || !this.checkPurchaseOwner()) return;
        p.busy = false; p.error = err.error?.message || 'Chưa lập được bản nháp. Thông tin bạn nhập vẫn được giữ, vui lòng thử lại.'; }
    }));
  }

  confirmPurchase(): void {
    const p = this.purchase;
    if (!p?.quote || p.busy || !this.checkPurchaseOwner()) return;
    p.busy = true; p.error = '';
    this.checkoutRequests.add(this.checkout.confirm(p.quote.token).subscribe({
      next: result => {
        if (this.purchase !== p || !this.checkPurchaseOwner()) return;
        let addressNotice = '';
        if (p.saveAddress) {
          try {
            const q = p.quote!;
            const saved = this.addresses.getAddresses(p.owner);
            if (!saved.some(a => a.name === q.recipient && a.phone === q.phone && a.street === q.street)) {
              this.addresses.addAddress(p.owner, { name: q.recipient, phone: q.phone, street: q.street, label: 'Địa chỉ giao sách' });
            }
            addressNotice = ' Mình đã lưu địa chỉ cho tài khoản này trên trình duyệt để bạn dùng lần sau.';
          } catch { addressNotice = ' Đơn đã tạo thành công, nhưng chưa lưu được địa chỉ trên trình duyệt.'; }
        }
        this.purchase = undefined;
        this.messages.push({ from: 'bot', private: true, text: 'Cảm ơn bạn! Đã tạo đơn #' + result.orderId + '. Thanh toán khi nhận hàng (COD). Bạn có thể hỏi tình trạng đơn hoặc mở mục Đơn hàng.' + addressNotice,
          actions: [{ type: 'VIEW_ORDERS', label: 'Xem đơn hàng', route: '/orders', requiresConfirmation: false }] });
        this.shouldScroll = true;
        // Order information stays in memory, not the persisted public chat history.
      },
      error: err => {
        if (this.purchase !== p || !this.checkPurchaseOwner()) return;
          p.busy = false;
          p.uncertain = ![400, 401, 403, 404, 409, 410].includes(err.status);
          this.checkoutExpanded = true;
        p.error = p.uncertain
          ? 'Chưa nhận được kết quả xác nhận. Bấm xác nhận lại để kiểm tra cùng bản nháp, không tạo đơn mới. Nếu đã tải lại trang, kiểm tra Đơn hàng trước khi đặt lại.'
          : (err.error?.message || 'Không thể xác nhận. Vui lòng kiểm tra lại bản nháp.');
        if (!p.uncertain) p.quote = undefined;
      }
    }));
  }

  editPurchase(): void {
    if (this.purchase && !this.purchase.busy && !this.purchase.uncertain) {
      this.purchase.quote = undefined; this.purchase.error = ''; this.checkoutExpanded = true;
    }
  }

  async cancelPurchase(): Promise<void> {
    if (this.purchase && !this.purchase.busy && !this.purchase.uncertain) {
      const p = this.purchase;
      const token = p.draftToken || p.quote?.token;
      if (token) {
        p.busy = true;
        try { await this.checkout.cancelDraft(token).toPromise(); }
        catch { p.busy = false; p.error = 'Chưa hủy được bản nháp trên máy chủ. Bạn thử lại nhé.'; return; }
        if (this.purchase !== p || !this.checkPurchaseOwner()) return;
      }
      this.conversationVersion++;
      this.request?.unsubscribe();
      this.typing = false;
      this.purchase = undefined;
      this.purchaseReply('Đã bỏ bản nháp, chưa tạo đơn hàng.');
    }
  }

  private checkPurchaseOwner(): boolean {
    if (!this.auth.isLoggedIn() || this.purchase?.owner !== this.auth.currentUser?.email) {
      this.purchase = undefined;
      return false;
    }
    return true;
  }

  cancelAction(): void {
    this.pendingAction = undefined;
  }

  sendFeedback(message: ChatMessage, value: 'positive' | 'negative'): void {
    if (!message.messageId || message.feedback) return;
    this.chatbot.feedback(message.messageId, value).subscribe({
      next: () => {
        message.feedback = value;
        this.persistMessages();
      }
    });
  }

  retry(): void {
    const value = this.lastFailedInput;
    this.errorText = '';
    this.lastFailedInput = '';
    if (value) this.send(value);
  }

  genericActions(message: ChatMessage): ChatAction[] {
    return (message.actions || []).filter(action => !action.productId || ['REMOVE_FROM_CART', 'UPDATE_CART_QUANTITY'].includes(action.type));
  }

  get showTypingDots(): boolean {
    const last = this.messages[this.messages.length - 1];
    return this.typing && !last?.streaming;
  }

  trackByIndex(index: number): number {
    return index;
  }

  comparisonRows(message: ChatMessage): string[][] {
    if (message.from !== 'bot' || message.streaming) return [];
    const lines = message.text.split('\n').filter(line => /^\s*\|.*\|\s*$/.test(line));
    if (lines.length < 3 || !/^\s*\|[\s:|\-]+\|\s*$/.test(lines[1])) return [];
    return lines.filter((_, i) => i !== 1).map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim()));
  }

  bubbleText(message: ChatMessage): string {
    if (!this.comparisonRows(message).length) return message.text;
    return message.text.split('\n').filter(line => !/^\s*\|.*\|\s*$/.test(line)).join('\n').trim();
  }

  private restoreMessages(): ChatMessage[] {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(this.storageKey) || '[]');
      return Array.isArray(parsed) ? parsed.filter(m => !m.private && m.intent !== 'ORDER_SUPPORT').slice(-24) : [];
    } catch {
      return [];
    }
  }

  private addToCart(product: ChatProduct): void {
    this.cart.addToCart(product);
    this.addedProductIds.add(product.id);
    this.shouldScroll = true;
  }

  private persistMessages(): void {
    if (this.accountEmail !== this.auth.currentUser?.email) return;
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.messages.filter(m => !m.private && m.intent !== 'ORDER_SUPPORT').slice(-24)));
    } catch {
      // Trình duyệt chặn storage: hội thoại vẫn hoạt động trong bộ nhớ.
    }
  }

  private scrollToBottom(): void {
    try {
      const el = this.scrollBody.nativeElement;
      el.scrollTop = el.scrollHeight;
    } catch {
      // view chưa sẵn sàng — bỏ qua
    }
  }
}
