import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { adaptPreview, PreviewProduct, ReaderBook, ReaderPage } from './reader-model';
import { maxTurns, spread } from './paperbound-math';
import type { ReaderScene, ReaderSnapshot } from './reader-scene';

@Component({
  selector: 'app-book-preview-reader',
  templateUrl: './book-preview-reader.component.html',
  styleUrls: ['./book-preview-reader.component.scss']
})
export class BookPreviewReaderComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() product!: PreviewProduct;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('canvasHost', { static: true }) canvasHost!: ElementRef<HTMLDivElement>;
  data?: ReaderBook;
  loading = true;
  loadError = false;
  fallback = false;
  mode2d = false;
  sound = false;
  toolsOpen = false;
  textIndex = 0;
  textZoom = 1;
  imageFailed = false;
  snapshot: ReaderSnapshot = { state: 'loading', turned: 0, opened: false };
  private engine?: ReaderScene;
  private subscription?: Subscription;
  private generation = 0;
  private initialized = false;
  private destroyed = false;
  private returnFocus?: HTMLElement;
  private savedScroll = { x: 0, y: 0 };
  private overflow = '';
  private rootOverflow = '';
  constructor(private products: ProductService, private zone: NgZone) {}
  ngAfterViewInit(): void {
    this.initialized = true;
    this.returnFocus = document.activeElement as HTMLElement;
    this.savedScroll = { x: window.scrollX, y: window.scrollY };
    this.overflow = document.body.style.overflow;
    this.rootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    this.dialog.nativeElement.showModal();
    this.load();
  }
  ngOnChanges(changes: SimpleChanges): void { if (this.initialized && changes.product) { this.load(); } }
  ngOnDestroy(): void {
    this.destroyed = true; this.generation++; this.subscription?.unsubscribe(); this.engine?.dispose();
    this.dialog.nativeElement.close();
    document.body.style.overflow = this.overflow;
    document.documentElement.style.overflow = this.rootOverflow;
    if (this.returnFocus?.isConnected) {
      this.returnFocus.focus({ preventScroll: true });
      window.scrollTo(this.savedScroll.x, this.savedScroll.y);
    }
  }
  load(): void {
    const version = ++this.generation;
    this.subscription?.unsubscribe(); this.engine?.dispose(); this.engine = undefined;
    this.loading = true; this.loadError = false; this.data = undefined; this.fallback = false;
    this.toolsOpen = false; this.mode2d = false; this.textIndex = 0; this.imageFailed = false; this.sound = false;
    this.snapshot = { state: 'loading', turned: 0, opened: false };
    this.subscription = this.products.getPreview(this.product.id).subscribe(manifest => {
      if (this.destroyed || version !== this.generation) { return; }
      this.data = adaptPreview(this.product, manifest);
      if (!this.data.pages.length) { this.loading = false; return; }
      this.zone.runOutsideAngular(() => { void this.initialize(version); });
    }, () => { if (version === this.generation && !this.destroyed) { this.loading = false; this.loadError = true; } });
  }
  private async initialize(version: number): Promise<void> {
    try {
      const module = await import('./reader-scene');
      // Load the bundled Vietnamese glyphs before rasterizing page textures.
      const fonts = (document as Document & { fonts?: { load(font: string): Promise<unknown> } }).fonts;
      if (fonts) { await fonts.load('20px "Vina Reader"').catch(() => undefined); }
      if (this.destroyed || version !== this.generation || !this.data) { return; }
      this.engine = new module.ReaderScene(this.canvasHost.nativeElement, this.data,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
        snapshot => this.zone.run(() => {
          if (version !== this.generation || this.destroyed) { return; }
          this.snapshot = snapshot; this.loading = snapshot.state === 'loading';
        }),
        () => this.zone.run(() => {
          if (version !== this.generation || this.destroyed) { return; }
          this.loading = false; this.fallback = true; this.mode2d = true;
        }));
      await this.engine.init();
    } catch {
      if (!this.destroyed && version === this.generation) {
        this.zone.run(() => { this.loading = false; this.fallback = true; this.mode2d = true; });
      }
    }
  }
  get count(): number { return this.data?.pages.length || 0; }
  get page(): ReaderPage | undefined { return this.data?.pages[this.textIndex]; }
  get imageUrl(): string { const p = this.page; return p?.kind === 'image' ? p.url : ''; }
  get text(): string { const p = this.page; return p?.kind === 'text' ? p.text : ''; }
  get heading(): string { const p = this.page; return p?.kind === 'text' ? p.heading || '' : ''; }
  get textFamily(): string { return this.page?.kind === 'text' && this.page.fontFamily === 'sans' ? 'Arial, sans-serif' : '"Vina Reader", Georgia, serif'; }
  get textAlign(): string { return this.page?.kind === 'text' ? this.page.textAlign || 'left' : 'left'; }
  get textSize(): number { return this.page?.kind === 'text' ? this.page.fontSize || 20 : 20; }
  get busy(): boolean { return !['ready', 'closed'].includes(this.snapshot.state); }
  get canPrevious(): boolean { return this.mode2d ? this.textIndex > 0 : this.snapshot.state === 'ready' && this.snapshot.turned > 0; }
  get canNext(): boolean { return this.mode2d ? this.textIndex + 1 < this.count : this.snapshot.state === 'ready' && this.snapshot.turned < maxTurns(this.count); }
  get pageLabel(): string {
    if (!this.count) { return '0 / 0'; }
    if (this.mode2d) { return (this.textIndex + 1) + ' / ' + this.count; }
    if (this.snapshot.state === 'closed') { return 'Bìa sách'; }
    const pair = spread(this.snapshot.turned, this.count);
    return [pair.left, pair.right].filter(i => i >= 0).map(i => i + 1).join('-') + ' / ' + this.count;
  }
  step(d: number): void {
    if (d > 0 ? !this.canNext : !this.canPrevious) { return; }
    if (this.mode2d) { this.textIndex += d; this.imageFailed = false;
      this.dialog.nativeElement.querySelector('.reading-2d')?.scrollTo(0, 0);
    }
    else {
      this.dialog.nativeElement.focus({ preventScroll: true });
      this.zone.runOutsideAngular(() => this.engine?.turn(d));
    }
  }
  toggle2d(): void {
    if (!this.mode2d && this.busy) { return; }
    this.mode2d = !this.mode2d || this.fallback;
    this.toolsOpen = false;
    this.dialog.nativeElement.focus({ preventScroll: true });
    if (this.mode2d) { this.textIndex = Math.min(this.count - 1, this.snapshot.turned * 2); this.imageFailed = false; }
    this.zone.runOutsideAngular(() => {
      if (!this.mode2d) { this.engine?.seek(this.textIndex); }
      this.engine?.setHidden(this.mode2d);
    });
  }
  toggleCover(): void {
    this.dialog.nativeElement.focus({ preventScroll: true });
    this.zone.runOutsideAngular(() => this.engine?.toggleCover());
  }
  top(): void { this.zone.runOutsideAngular(() => this.engine?.top()); }
  reset(): void { this.textZoom = 1; this.zone.runOutsideAngular(() => this.engine?.reset()); }
  zoom(d: number): void {
    if (this.mode2d) { this.textZoom = Math.max(.75, Math.min(2.4, this.textZoom + d)); }
    else { this.zone.runOutsideAngular(() => this.engine?.setZoom(d)); }
  }
  toggleSound(): void { this.sound = !this.sound; this.engine?.setSound(this.sound); }
  retryPages(): void { this.imageFailed = false; this.zone.runOutsideAngular(() => this.engine?.retry()); }
  close(): void { this.engine?.dispose(); this.subscription?.unsubscribe(); this.generation++; this.closed.emit(); }
  cancel(event: Event): void { event.preventDefault(); this.close(); }
  key(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); this.step(event.key === 'ArrowRight' ? 1 : -1);
    }
  }
}
