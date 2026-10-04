import { Injectable } from '@angular/core';
import { gsap } from 'gsap';

interface BookRouteTransition {
  scene: HTMLDivElement;
  book: HTMLDivElement;
  frontCover: HTMLDivElement;
  pageLeaf: HTMLDivElement;
  backdrop: HTMLDivElement;
  startRect: DOMRect;
  centerX: number;
  centerY: number;
  settleScale: number;
  introTimeline?: gsap.core.Timeline;
}

@Injectable({ providedIn: 'root' })
export class MotionService {

  private curtainReady: Promise<void> = Promise.resolve();
  private bookRouteTransition?: BookRouteTransition;
  private targetObserver?: MutationObserver;
  private targetTimeout?: number;
  private departureResolver?: (completed: boolean) => void;
  private transitionIdleResolvers: Array<() => void> = [];

  prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Các tác vụ render nặng (đặc biệt là khởi tạo WebGL) có thể chờ đến khi
   * animation mở sách kết thúc. Nhờ vậy GSAP không phải tranh GPU với Three.js.
   */
  waitForBookRouteTransitionIdle(): Promise<void> {
    if (!this.bookRouteTransition) {
      return Promise.resolve();
    }

    return new Promise(resolve => this.transitionIdleResolvers.push(resolve));
  }

  prepareBookRouteTransition(source: HTMLImageElement | null): Promise<boolean> {
    this.clearBookRouteTransition();

    if (!source || this.prefersReducedMotion() || !source.complete || source.naturalWidth === 0) {
      return Promise.resolve(true);
    }

    const startRect = source.getBoundingClientRect();
    if (startRect.width < 2 || startRect.height < 2) {
      return Promise.resolve(true);
    }

    const centerX = window.innerWidth / 2
      - (startRect.left + startRect.width / 2);
    const centerY = window.innerHeight / 2
      - (startRect.top + startRect.height / 2);
    const settleScale = Math.min(
      2.65,
      Math.max(1.2, (window.innerHeight * 0.78) / startRect.height)
    );

    const scene = document.createElement('div');
    const book = document.createElement('div');
    const backCover = document.createElement('div');
    const pageBlock = document.createElement('div');
    const pageLeaf = document.createElement('div');
    const frontCover = document.createElement('div');
    const frontInside = document.createElement('div');
    const coverImage = source.cloneNode(true) as HTMLImageElement;
    const backdrop = document.createElement('div');

    scene.className = 'motion-book-opening-scene';
    book.className = 'motion-book-opening-book';
    backCover.className = 'motion-book-opening-back';
    pageBlock.className = 'motion-book-opening-pages';
    pageLeaf.className = 'motion-book-opening-leaf';
    frontCover.className = 'motion-book-opening-front';
    frontInside.className = 'motion-book-opening-inside';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.className = 'motion-book-route-backdrop';
    scene.setAttribute('aria-hidden', 'true');
    coverImage.removeAttribute('loading');
    coverImage.removeAttribute('fetchpriority');
    coverImage.setAttribute('aria-hidden', 'true');
    coverImage.className = 'motion-book-opening-cover-image';

    frontCover.appendChild(frontInside);
    frontCover.appendChild(coverImage);
    book.appendChild(backCover);
    book.appendChild(pageBlock);
    book.appendChild(pageLeaf);
    book.appendChild(frontCover);
    scene.appendChild(book);
    document.body.appendChild(backdrop);
    document.body.appendChild(scene);

    gsap.set(backdrop, {
      position: 'fixed',
      inset: 0,
      zIndex: 1390,
      pointerEvents: 'none',
      autoAlpha: 0,
      // Giữ lại trang hiện tại phía dưới, chỉ hạ sáng và làm mờ nhẹ để mắt tập trung
      // vào cuốn sách đang bay. Không dùng nền đặc vì sẽ biến transition thành màn hình
      // chuyển cảnh riêng, mất cảm giác đang ở trong cùng một website.
      background: 'radial-gradient(circle at 50% 44%, rgba(255, 255, 255, 0.04), transparent 38%), rgba(2, 22, 16, 0.16)',
      backdropFilter: 'blur(2px) saturate(0.96)',
      willChange: 'opacity'
    });
    // GSAP không có CSSPlugin alias cho thuộc tính có tiền tố. Gán trực tiếp để
    // Safari vẫn có lớp blur mà không tạo warning "Missing plugin" trong console.
    backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(2px) saturate(0.96)');

    gsap.set(scene, {
      position: 'fixed',
      left: startRect.left,
      top: startRect.top,
      width: startRect.width,
      height: startRect.height,
      zIndex: 1400,
      pointerEvents: 'none',
      perspective: 1600,
      transformOrigin: 'center center',
      transformStyle: 'preserve-3d',
      willChange: 'transform,opacity',
      force3D: true
    });

    gsap.set(book, {
      position: 'absolute',
      inset: 0,
      transformStyle: 'preserve-3d',
      transformOrigin: 'center center',
      willChange: 'transform'
    });

    gsap.set([backCover, pageBlock, pageLeaf, frontCover], {
      position: 'absolute',
      inset: 0,
      borderRadius: 4,
      transformStyle: 'preserve-3d'
    });

    // Không ẩn backface ở frontCover: khi bìa lật qua 90 độ, mặt trong là
    // một phần tử con đã xoay 180 độ và vẫn phải được render. Chỉ cull các
    // tấm giấy không có mặt sau riêng.
    gsap.set([backCover, pageBlock, pageLeaf], {
      backfaceVisibility: 'hidden'
    });

    gsap.set(backCover, {
      background: 'linear-gradient(135deg, #164f3d, #082a20)',
      boxShadow: '0 22px 54px rgba(0, 13, 9, 0.4)',
      z: -9
    });

    gsap.set(pageBlock, {
      inset: '2px 3px 2px 7px',
      background: 'repeating-linear-gradient(90deg, #d8d0be 0 1px, #f2ecde 1px 4px)',
      boxShadow: '4px 0 10px rgba(0, 20, 14, 0.16)',
      z: -3
    });

    gsap.set(pageLeaf, {
      inset: '3px 4px 3px 8px',
      background: 'repeating-linear-gradient(0deg, transparent 0 12px, rgba(99, 82, 55, 0.055) 12px 13px), linear-gradient(90deg, #d8d0bf 0%, #fbf7ed 9%, #eee7d8 100%)',
      boxShadow: 'inset 13px 0 18px rgba(75, 59, 37, 0.11)',
      transformOrigin: 'left center',
      z: 1,
      willChange: 'transform'
    });

    gsap.set(frontCover, {
      transformOrigin: 'left center',
      backfaceVisibility: 'visible',
      z: 5,
      willChange: 'transform'
    });

    gsap.set([coverImage, frontInside], {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      borderRadius: 4,
      backfaceVisibility: 'hidden'
    });

    gsap.set(coverImage, {
      objectFit: 'cover',
      boxShadow: '0 12px 30px rgba(0, 19, 13, 0.3)'
    });

    gsap.set(frontInside, {
      rotationY: 180,
      background: 'repeating-linear-gradient(0deg, transparent 0 12px, rgba(99, 82, 55, 0.05) 12px 13px), linear-gradient(270deg, #d8d0bf 0%, #fbf7ed 9%, #eee7d8 100%)',
      boxShadow: 'inset -13px 0 18px rgba(75, 59, 37, 0.11)'
    });

    this.bookRouteTransition = {
      scene,
      book,
      frontCover,
      pageLeaf,
      backdrop,
      startRect,
      centerX,
      centerY,
      settleScale
    };

    const transition = this.bookRouteTransition;
    return new Promise<boolean>(resolve => {
      let settled = false;
      const finish = (completed: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.departureResolver === finish) {
          this.departureResolver = undefined;
        }
        resolve(completed);
      };

      this.departureResolver = finish;
      transition.introTimeline = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          transition.introTimeline = undefined;
          finish(true);
        }
      })
        .addLabel('flight', 0)
        .to(transition.backdrop, {
          autoAlpha: 1,
          duration: 0.14,
          ease: 'power1.out'
        }, 'flight')
        .to(transition.scene, {
          x: transition.centerX,
          y: transition.centerY,
          scale: transition.settleScale,
          rotation: -0.8,
          duration: 0.48,
          ease: 'power3.inOut',
          force3D: true
        }, 'flight')
        .to(transition.book, {
          rotationX: -2.8,
          rotationY: -1.6,
          duration: 0.4,
          ease: 'power2.inOut'
        }, 'flight+=0.03');
    });
  }

  beginRouteTransition(curtain: HTMLElement): void {
    if (this.bookRouteTransition) {
      gsap.set(curtain, { display: 'none' });
      this.curtainReady = Promise.resolve();
      return;
    }

    if (this.prefersReducedMotion()) {
      this.curtainReady = Promise.resolve();
      return;
    }

    gsap.killTweensOf(curtain);
    gsap.set(curtain, {
      display: 'grid',
      scaleY: 0,
      transformOrigin: 'center bottom',
      autoAlpha: 1
    });

    this.curtainReady = new Promise(resolve => {
      gsap.to(curtain, {
        scaleY: 1,
        duration: 0.28,
        ease: 'power3.inOut',
        onComplete: resolve
      });
    });
  }

  completeRouteTransition(curtain: HTMLElement, stage: HTMLElement): void {
    if (this.bookRouteTransition) {
      gsap.set(curtain, { display: 'none' });
      this.completeBookRouteTransition(stage);
      return;
    }

    if (this.prefersReducedMotion()) {
      gsap.set(curtain, { display: 'none' });
      return;
    }

    this.curtainReady.then(() => {
      requestAnimationFrame(() => {
        const page = stage.querySelector('router-outlet + *') as HTMLElement | null;
        const timeline = gsap.timeline({
          defaults: { ease: 'power3.inOut' },
          onComplete: () => gsap.set(curtain, { display: 'none' })
        });

        timeline
          .set(curtain, { transformOrigin: 'center top' })
          .to(curtain, { scaleY: 0, duration: 0.42 });

        if (page) {
          timeline.fromTo(
            page,
            { autoAlpha: 0, y: 18 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.52,
              ease: 'power3.out',
              clearProps: 'transform,opacity,visibility'
            },
            '-=0.3'
          );
        }
      });
    });
  }

  clearBookRouteTransition(): void {
    this.targetObserver?.disconnect();
    this.targetObserver = undefined;

    if (this.targetTimeout !== undefined) {
      window.clearTimeout(this.targetTimeout);
      this.targetTimeout = undefined;
    }

    this.departureResolver?.(false);
    this.departureResolver = undefined;

    if (this.bookRouteTransition) {
      this.bookRouteTransition.introTimeline?.kill();
      gsap.killTweensOf([
        this.bookRouteTransition.scene,
        this.bookRouteTransition.book,
        this.bookRouteTransition.frontCover,
        this.bookRouteTransition.pageLeaf
      ]);
      gsap.killTweensOf(this.bookRouteTransition.backdrop);
      this.bookRouteTransition.scene.remove();
      this.bookRouteTransition.backdrop.remove();
      this.bookRouteTransition = undefined;
    }

    this.resolveBookRouteTransitionIdle();
  }

  private completeBookRouteTransition(stage: HTMLElement): void {
    const transition = this.bookRouteTransition;
    if (!transition) {
      return;
    }

    let routePage = stage.querySelector('router-outlet + *') as HTMLElement | null;
    const hideRoutePage = (): void => {
      routePage = stage.querySelector('router-outlet + *') as HTMLElement | null;
      if (routePage) {
        gsap.set(routePage, { autoAlpha: 0 });
      }
    };
    hideRoutePage();

    const runWhenReady = (): boolean => {
      if (!routePage) {
        hideRoutePage();
      }

      const target = stage.querySelector('[data-book-transition-target]') as HTMLElement | null;
      if (!target) {
        return false;
      }

      const targetRect = target.getBoundingClientRect();
      if (targetRect.width < 2 || targetRect.height < 2) {
        return false;
      }

      const page = routePage;
      if (!page) {
        return false;
      }

      this.targetObserver?.disconnect();
      this.targetObserver = undefined;
      if (this.targetTimeout !== undefined) {
        window.clearTimeout(this.targetTimeout);
        this.targetTimeout = undefined;
      }

      transition.introTimeline?.kill();
      transition.introTimeline = undefined;

      const viewer = target.closest('.detail-image') as HTMLElement | null;
      const detailInfo = stage.querySelector('.detail-info') as HTMLElement | null;
      const maxOpenScale = Math.min(
        (window.innerWidth * 0.94) / (transition.startRect.width * 2),
        (window.innerHeight * 0.86) / transition.startRect.height,
        3.2
      );
      const openScale = Math.max(
        0.82,
        Math.min(transition.settleScale * 1.1, maxOpenScale)
      );
      const hingeCenteredX = transition.centerX
        + openScale * transition.startRect.width / 2;

      // Product Detail vốn có appReveal riêng. Dừng các tween đó để chỉ một
      // timeline sở hữu transform/opacity trong lúc cuốn sách đang mở.
      gsap.killTweensOf([viewer, detailInfo].filter(Boolean));
      if (viewer) {
        gsap.set(viewer, { autoAlpha: 0, scale: 0.95 });
      }
      if (detailInfo) {
        gsap.set(detailInfo, { autoAlpha: 0, x: 34 });
      }

      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (this.bookRouteTransition !== transition) {
          return;
        }

        gsap.timeline({
          defaults: { ease: 'power3.inOut' },
          onComplete: () => {
            transition.scene.remove();
            transition.backdrop.remove();
            if (this.bookRouteTransition === transition) {
              this.bookRouteTransition = undefined;
            }
            this.resolveBookRouteTransitionIdle();
          }
        })
          .addLabel('open', 0)
          .to(transition.scene, {
            x: hingeCenteredX,
            y: transition.centerY,
            scale: openScale,
            rotation: 0,
            duration: 0.22,
            overwrite: 'auto',
            force3D: true
          }, 'open')
          .to(transition.book, {
            rotationX: 0,
            rotationY: 0,
            duration: 0.2
          }, 'open')
          .to(transition.frontCover, {
            rotationY: -158,
            duration: 0.46,
            ease: 'power3.inOut'
          }, 'open+=0.06')
          .to(transition.pageLeaf, {
            rotationY: -18,
            duration: 0.32,
            ease: 'power2.inOut'
          }, 'open+=0.14')
          .to(page, {
            autoAlpha: 1,
            duration: 0.2,
            ease: 'power2.out',
            clearProps: 'opacity,visibility'
          }, 'open+=0.43')
          .to(viewer, {
            autoAlpha: 1,
            scale: 1,
            duration: 0.24,
            ease: 'power3.out',
            clearProps: 'transform,opacity,visibility'
          }, 'open+=0.45')
          .to(detailInfo, {
            autoAlpha: 1,
            x: 0,
            duration: 0.26,
            ease: 'power3.out',
            clearProps: 'transform,opacity,visibility'
          }, 'open+=0.46')
          .to([transition.scene, transition.backdrop], {
            autoAlpha: 0,
            duration: 0.22,
            ease: 'power2.out'
          }, 'open+=0.5');
      }));

      return true;
    };

    if (runWhenReady()) {
      return;
    }

    this.targetObserver = new MutationObserver(() => {
      if (!routePage) {
        hideRoutePage();
      }
      runWhenReady();
    });
    this.targetObserver.observe(stage, { childList: true, subtree: true });
    this.targetTimeout = window.setTimeout(() => {
      this.targetObserver?.disconnect();
      this.targetObserver = undefined;
      this.targetTimeout = undefined;

      if (this.bookRouteTransition !== transition) {
        return;
      }

      gsap.timeline({ onComplete: () => this.clearBookRouteTransition() })
        .to(routePage || [], {
          autoAlpha: 1,
          duration: 0.3,
          ease: 'power2.out',
          clearProps: 'opacity,visibility'
        }, 0)
        .to(transition.scene, {
          autoAlpha: 0,
          scale: '+=0.08',
          duration: 0.3,
          ease: 'power2.out'
        }, 0)
        .to(transition.backdrop, {
          autoAlpha: 0,
          duration: 0.3,
          ease: 'power2.out'
        }, 0);
    }, 2400);
  }

  private resolveBookRouteTransitionIdle(): void {
    const resolvers = this.transitionIdleResolvers.splice(0);
    resolvers.forEach(resolve => resolve());
  }

  addToCart(source?: HTMLElement | null): void {
    const cart = document.querySelector('.cart-icon') as HTMLElement | null;

    if (this.prefersReducedMotion()) {
      this.bump(cart || source || null);
      return;
    }

    const card = source ? source.closest('.product-card') : null;
    const cover = (card && card.querySelector('img'))
      || document.querySelector('.detail-image img');

    if (!cover || !cart) {
      this.bump(source || cart);
      return;
    }

    const start = (cover as HTMLElement).getBoundingClientRect();
    const end = cart.getBoundingClientRect();
    const clone = (cover as HTMLImageElement).cloneNode(true) as HTMLImageElement;

    clone.removeAttribute('loading');
    clone.setAttribute('aria-hidden', 'true');
    clone.className = 'motion-flying-cover';
    document.body.appendChild(clone);

    gsap.set(clone, {
      position: 'fixed',
      left: start.left,
      top: start.top,
      width: start.width,
      height: start.height,
      objectFit: 'contain',
      zIndex: 1300,
      pointerEvents: 'none',
      transformOrigin: 'center center',
      willChange: 'transform,opacity'
    });

    const x = end.left + end.width / 2 - (start.left + start.width / 2);
    const y = end.top + end.height / 2 - (start.top + start.height / 2);

    gsap.timeline({ onComplete: () => clone.remove() })
      .to(source || cover, {
        scale: 0.96,
        duration: 0.12,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1
      }, 0)
      .to(clone, {
        x,
        y,
        scale: 0.1,
        rotation: 8,
        autoAlpha: 0.5,
        duration: 0.72,
        ease: 'power3.inOut'
      }, 0.02)
      .to(cart, {
        scale: 1.18,
        duration: 0.16,
        ease: 'back.out(2)'
      }, '-=0.14')
      .to(cart, {
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
        clearProps: 'transform'
      });
  }

  bump(target?: HTMLElement | null): void {
    if (!target || this.prefersReducedMotion()) {
      return;
    }

    gsap.fromTo(
      target,
      { scale: 0.94 },
      {
        scale: 1,
        duration: 0.38,
        ease: 'back.out(2.5)',
        clearProps: 'transform'
      }
    );
  }

  removeItem(target: HTMLElement | null, remove: () => void): void {
    if (!target || this.prefersReducedMotion()) {
      remove();
      return;
    }

    gsap.to(target, {
      x: -28,
      scale: 0.97,
      autoAlpha: 0,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: remove
    });
  }

  openPanel(panel: HTMLElement): void {
    if (this.prefersReducedMotion()) {
      return;
    }

    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 12, scale: 0.96, transformOrigin: 'left bottom' },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.28,
        ease: 'back.out(1.7)',
        clearProps: 'transform,opacity,visibility'
      }
    );
  }

  transitionTheme(
    wash: HTMLElement | null,
    color: string,
    applyTheme: () => void
  ): void {
    if (!wash || this.prefersReducedMotion()) {
      applyTheme();
      return;
    }

    const radius = Math.hypot(window.innerWidth, window.innerHeight) / 52 + 2;
    gsap.killTweensOf(wash);
    gsap.set(wash, { backgroundColor: color, scale: 0, autoAlpha: 0.2 });

    gsap.timeline()
      .to(wash, {
        scale: radius,
        duration: 0.42,
        ease: 'power3.inOut'
      })
      .call(applyTheme, [], 0.2)
      .to(wash, {
        autoAlpha: 0,
        duration: 0.32,
        ease: 'power2.out'
      }, '-=0.08')
      .set(wash, { scale: 0 });
  }

  orderSuccess(target?: HTMLElement | null): Promise<void> {
    if (!target || this.prefersReducedMotion()) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      gsap.timeline({ onComplete: resolve })
        .to(target, {
          scale: 0.96,
          duration: 0.12,
          ease: 'power2.in'
        })
        .to(target, {
          scale: 1.04,
          duration: 0.24,
          ease: 'back.out(2.4)'
        })
        .to(target, {
          scale: 1,
          duration: 0.2,
          ease: 'power2.out',
          clearProps: 'transform'
        });
    });
  }
}
