import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnDestroy
} from '@angular/core';

/**
 * Đếm số từ 0 → giá trị đích khi phần tử lọt vào khung nhìn.
 * Tạo cảm giác "số liệu sống động" cho dải thống kê (như landing cao cấp).
 *
 * Cách dùng:
 *   <span [appCountUp]="12000" suffix="+"></span>
 *   <span [appCountUp]="56" duration="1600"></span>
 *
 * Nội dung text của phần tử sẽ bị ghi đè trong lúc chạy.
 */
@Directive({
  selector: '[appCountUp]'
})
export class CountUpDirective implements AfterViewInit, OnDestroy {

  /** Giá trị đích. */
  @Input('appCountUp') target = 0;

  /** Thời lượng chạy (ms). */
  @Input() duration = 1800;

  /** Hậu tố (vd "+", "k"). */
  @Input() suffix = '';

  /** Tiền tố (vd "₫"). */
  @Input() prefix = '';

  private observer?: IntersectionObserver;
  private rafId?: number;
  private started = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    host.textContent = this.format(0);

    if (typeof IntersectionObserver === 'undefined') {
      this.run();
      return;
    }

    this.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.started) {
            this.started = true;
            this.run();
            this.observer?.unobserve(host);
          }
        });
      },
      { threshold: 0.4 }
    );

    this.observer.observe(host);
  }

  private run(): void {
    const host = this.el.nativeElement;
    const start = performance.now();
    const target = this.target;

    const tick = (now: number) => {
      const t = Math.min((now - start) / this.duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      host.textContent = this.format(Math.round(target * eased));
      if (t < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        host.textContent = this.format(target);
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private format(value: number): string {
    return this.prefix + value.toLocaleString('vi-VN') + this.suffix;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }
}
