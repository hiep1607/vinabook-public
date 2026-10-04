import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { auditTime, distinctUntilChanged, map } from 'rxjs/operators';

/**
 * Selector các nút thao tác quan trọng (CTA) mà FAB nổi không được che:
 * Mua ngay / Thêm giỏ hàng (trang chi tiết + card), Thanh toán (cart),
 * Đặt hàng (checkout), pagination và mọi nút submit của form.
 */
export const FAB_CTA_SELECTOR = [
  '.buy-btn',
  '.cart-btn',
  '.add-cart-btn',
  '.checkout-btn',
  '.place-order-btn',
  '.page-btn',
  '.sticky-buy-bar',
  'button[type="submit"]'
].join(', ');

/** Ngưỡng viewport mà FAB tham gia cơ chế tránh va chạm (mobile/tablet nhỏ,
 *  khớp media query ≤768px của chatbot/theme-switcher/sticky buy bar). */
const MOBILE_MAX_WIDTH = 768;
/** Khoảng hở tối thiểu giữa FAB và mép trên CTA sau khi nâng. */
const LIFT_GAP = 8;
/** Trần nâng để FAB không bị đẩy quá xa khỏi vùng thao tác được. */
const MAX_LIFT = 200;

/**
 * Phát hiện va chạm giữa FAB nổi (chatbot/theme switcher) và CTA trên mobile,
 * phát số pixel cần nâng FAB lên để hai hình chữ nhật không còn giao nhau.
 *
 * Thuật toán loop-free: dải đứng "vị trí gốc" của FAB = rect hiện tại cộng lại
 * phần lift đang áp dụng, nên kết quả không phụ thuộc vị trí đã nâng trước đó.
 */
@Injectable({ providedIn: 'root' })
export class FabCollisionService {

  private readonly recheck$ = new Subject<void>();
  private listening = false;

  constructor(private router: Router) {}

  /**
   * Theo dõi một FAB; trả về Observable phát số px cần nâng (0 = giữ mặc định).
   * Chỉ tính ở viewport mobile (<= MOBILE_MAX_WIDTH).
   */
  watch(getFab: () => HTMLElement | null): Observable<number> {
    this.ensureListeners();
    let lastLift = 0;

    return this.recheck$.pipe(
      auditTime(80),
      map(() => {
        const fab = getFab();
        let lift = 0;

        if (fab && fab.isConnected && window.innerWidth <= MOBILE_MAX_WIDTH) {
          const fabRect = fab.getBoundingClientRect();

          if (fabRect.width > 0 && fabRect.height > 0) {
            const baseTop = fabRect.top + lastLift;
            const baseBottomEdge = fabRect.bottom + lastLift;
            let required = 0;

            document.querySelectorAll(FAB_CTA_SELECTOR).forEach(el => {
              if (!(el instanceof HTMLElement)) { return; }
              // Bỏ qua nút nằm trong chính chat panel / theme panel.
              if (el.closest('.chat-panel') || el.closest('.theme-panel')) { return; }

              const cta = el.getBoundingClientRect();
              if (cta.width === 0 || cta.height === 0) { return; }

              // Giao nhau theo phương ngang với cột của FAB?
              const horizontalOverlap = cta.left < fabRect.right && cta.right > fabRect.left;
              if (!horizontalOverlap) { return; }

              // CTA chèn vào dải đứng của FAB ở vị trí gốc?
              const verticalOverlap = cta.top < baseBottomEdge && cta.bottom > baseTop;
              if (verticalOverlap) {
                // Đáy FAB sau nâng phải nằm trên (hoặc ngang mức) mép trên CTA trừ khoảng hở:
                // baseBottomEdge - lift <= cta.top - GAP  =>  lift >= baseBottomEdge - cta.top + GAP
                required = Math.max(required, baseBottomEdge - cta.top + LIFT_GAP);
              }
            });

            lift = Math.max(0, Math.min(required, MAX_LIFT));
          }
        }

        lastLift = lift;
        return lift;
      })
    );
  }

  /** Yêu cầu kiểm tra lại ngay (dùng khi bố cục vừa thay đổi, VD dữ liệu render xong). */
  recheck(): void {
    this.ensureListeners();
    this.recheck$.next();
  }

  private readonly onRecheck = (): void => {
    this.recheck$.next();
  };

  private ensureListeners(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;

    window.addEventListener('scroll', this.onRecheck, { passive: true, capture: true });
    window.addEventListener('resize', this.onRecheck);
    window.addEventListener('orientationchange', this.onRecheck);
    window.addEventListener('load', this.onRecheck);
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.onRecheck();
      }
    });
  }
}
