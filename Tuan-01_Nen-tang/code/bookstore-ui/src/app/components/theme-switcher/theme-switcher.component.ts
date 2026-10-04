import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';

import { FabCollisionService } from 'src/app/services/fab-collision.service';
import { MotionService } from 'src/app/services/motion.service';
import { Theme, ThemeService } from 'src/app/services/theme.service';

@Component({
  selector: 'app-theme-switcher',
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.scss']
})
export class ThemeSwitcherComponent implements AfterViewInit, OnDestroy {

  @ViewChild('themeFabBtn') private themeFabBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('themePanel') private themePanel?: ElementRef<HTMLElement>;
  @ViewChild('themeWash', { static: true }) private themeWash?: ElementRef<HTMLElement>;

  open = false;

  private collisionSub?: Subscription;

  constructor(
    public themeService: ThemeService,
    private collision: FabCollisionService,
    private motion: MotionService
  ) {}

  /** Nâng FAB lên trên CTA khi có va chạm ở mobile (xem FabCollisionService). */
  ngAfterViewInit(): void {
    this.collisionSub = this.collision
      .watch(() => this.themeFabBtn?.nativeElement ?? null)
      .subscribe(lift => {
        const el = this.themeFabBtn?.nativeElement;
        if (el) {
          el.style.setProperty('--fab-lift', `${lift}px`);
        }
      });
    // Bố cục đầu tiên có thể chưa ổn định — kiểm tra lại sau khi render xong.
    setTimeout(() => this.collision.recheck());
  }

  ngOnDestroy(): void {
    this.collisionSub?.unsubscribe();
  }

  get themes(): Theme[] {
    return this.themeService.themes;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      setTimeout(() => {
        const panel = this.themePanel?.nativeElement;
        if (panel) {
          this.motion.openPanel(panel);
        }
      });
    }
  }

  pick(theme: Theme): void {
    this.motion.transitionTheme(
      this.themeWash?.nativeElement || null,
      theme.primary,
      () => this.themeService.setTheme(theme.id)
    );
    this.open = false;
  }
}
