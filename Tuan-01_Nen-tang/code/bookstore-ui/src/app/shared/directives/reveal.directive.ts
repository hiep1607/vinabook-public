import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnDestroy
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Hiệu ứng "reveal khi cuộn" — phần tử mờ + dịch chuyển nhẹ, khi lọt vào
 * khung nhìn thì hiện ra mượt mà (như các trang landing cao cấp).
 *
 * Dùng GSAP ScrollTrigger để reveal đồng nhất và tự cleanup theo component.
 *
 * Cách dùng:
 *   <div appReveal>...</div>                  // trượt lên mặc định
 *   <div appReveal="left">...</div>           // trượt từ trái
 *   <div appReveal="scale" [revealDelay]="120">...</div>  // phóng to, trễ 120ms
 *
 * Hướng hỗ trợ: 'up' (mặc định) | 'down' | 'left' | 'right' | 'scale'.
 * Style tương ứng nằm trong styles.scss (.reveal / .reveal--*).
 */
@Directive({
  selector: '[appReveal]'
})
export class RevealDirective implements AfterViewInit, OnDestroy {

  /** Hướng xuất hiện. */
  @Input('appReveal') from: '' | 'up' | 'down' | 'left' | 'right' | 'scale' = 'up';

  /** Độ trễ (ms) — dùng để tạo hiệu ứng so le (stagger) giữa các phần tử. */
  @Input() revealDelay = 0;

  private context?: gsap.Context;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      gsap.set(host, { autoAlpha: 1, clearProps: 'transform' });
      return;
    }

    const offsets: { [key: string]: gsap.TweenVars } = {
      up: { y: 24 },
      down: { y: -24 },
      left: { x: -32 },
      right: { x: 32 },
      scale: { scale: 0.96 }
    };
    const start = offsets[this.from || 'up'] || offsets.up;

    this.context = gsap.context(() => {
      gsap.fromTo(
        host,
        { autoAlpha: 0, ...start },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.68,
          delay: this.revealDelay / 1000,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility,willChange',
          scrollTrigger: {
            trigger: host,
            start: 'top 88%',
            once: true
          }
        }
      );
    }, host);
  }

  ngOnDestroy(): void {
    this.context?.revert();
  }
}
