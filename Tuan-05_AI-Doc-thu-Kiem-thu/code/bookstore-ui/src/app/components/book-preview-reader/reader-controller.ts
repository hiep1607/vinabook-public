import { clamp, maxTurns, releaseTarget, smooth } from './paperbound-math';
export type ReaderState = 'loading' | 'opening' | 'ready' | 'dragging' | 'settling' | 'closing' | 'closed' | 'disposed';
export class ReaderController {
  state: ReaderState = 'loading';
  turned = 0;
  opening = 0;
  collect = 0;
  progress = 0;
  direction = 1;
  corner = 0;
  private animation?: { start: number; duration: number; from: number; to: number; kind: 'opening' | 'progress' | 'collect'; done: () => void };
  constructor(readonly count: number, private reduced: boolean, private notify: () => void) {}
  get busy(): boolean { return !['ready', 'closed'].includes(this.state); }
  canTurn(d: number): boolean {
    return this.state === 'ready' && (d > 0 ? this.turned < maxTurns(this.count) : this.turned > 0);
  }
  open(): void {
    if (this.state !== 'loading' && this.state !== 'closed') { return; }
    this.state = 'opening';
    this.tween('opening', 1, 620, () => { this.state = 'ready'; this.notify(); });
  }
  close(): void {
    if (this.state !== 'ready') { return; }
    this.state = 'closing';
    const cover = (): void => {
      this.turned = 0; this.collect = 0;
      this.tween('opening', 0, 580, () => { this.state = 'closed'; this.notify(); });
    };
    if (this.turned) { this.tween('collect', 1, 620, cover); } else { cover(); }
  }
  begin(d: number, drag = false): boolean {
    if (!this.canTurn(d)) { return false; }
    this.direction = d; this.progress = d > 0 ? 0 : 1;
    this.state = drag ? 'dragging' : 'settling'; this.notify();
    return true;
  }
  drag(p: number): void { if (this.state === 'dragging') { this.progress = clamp(p); } }
  release(velocity: number, commit = true): void {
    if (this.state !== 'dragging') { return; }
    this.settle(releaseTarget(this.progress, this.direction, velocity, commit));
  }
  settle(target: 0 | 1 = this.direction > 0 ? 1 : 0): void {
    if (!['dragging', 'settling'].includes(this.state)) { return; }
    this.state = 'settling';
    this.tween('progress', target, Math.max(220, 850 * Math.abs(target - this.progress)), () => {
      if (this.direction > 0 && target === 1) { this.turned++; }
      if (this.direction < 0 && target === 0) { this.turned--; }
      this.state = 'ready'; this.notify();
    });
  }
  tick(now: number): boolean {
    const a = this.animation;
    if (!a) { return false; }
    const t = clamp((now - a.start) / a.duration);
    this[a.kind] = a.from + (a.to - a.from) * smooth(t);
    if (t === 1) { this.animation = undefined; a.done(); }
    return !!this.animation;
  }
  dispose(): void { this.animation = undefined; this.state = 'disposed'; }
  private tween(kind: 'opening' | 'progress' | 'collect', to: number, duration: number, done: () => void): void {
    this.animation = { kind, to, from: this[kind], duration: this.reduced ? 1 : duration, start: performance.now(), done };
    this.notify();
  }
}
