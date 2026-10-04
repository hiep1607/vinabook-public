import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router
} from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ThemeService } from './services/theme.service';
import { MotionService } from './services/motion.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})

export class AppComponent implements OnInit, OnDestroy {

  @ViewChild('routeCurtain', { static: true }) routeCurtain!: ElementRef<HTMLElement>;
  @ViewChild('routeStage', { static: true }) routeStage!: ElementRef<HTMLElement>;

  title = 'bookstore-ui';
  private routeSub?: Subscription;
  private motionSub?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private titleService: Title,
    private themeService: ThemeService,
    private motion: MotionService
  ) {
    this.themeService.init();
  }

  ngOnInit(): void {
    this.motionSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.motion.beginRouteTransition(this.routeCurtain.nativeElement);
      }
      if (event instanceof NavigationEnd) {
        this.motion.completeRouteTransition(
          this.routeCurtain.nativeElement,
          this.routeStage.nativeElement
        );
      }
      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.motion.clearBookRouteTransition();
      }
    });

    this.routeSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => {
        let current = this.route.firstChild;
        while (current && current.firstChild) {
          current = current.firstChild;
        }
        return current && current.snapshot.data['pageTitle']
          ? current.snapshot.data['pageTitle']
          : 'VinaBook';
      })
    ).subscribe(pageTitle => this.titleService.setTitle(`${pageTitle} | VinaBook`));
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    this.motionSub?.unsubscribe();
    this.motion.clearBookRouteTransition();
  }

}
