import * as THREE from 'three';
import { ReaderBook, ReaderPage } from './reader-model';

// Sliding window: at most eight page textures, including in-flight loads.
// Cover textures are separate and capped at three. No full-book texture allocation.
export class ReaderTextures {
  readonly blank: THREE.Texture;
  private entries = new Map<number, { texture?: THREE.Texture; task: Promise<THREE.Texture>; abort: AbortController }>();
  private disposed = false;
  private width = 1024;
  constructor(private book: ReaderBook, private invalidate: () => void) {
    this.blank = this.paint('');
  }
  resolution(viewWidth: number, zoom: number): void {
    const width = viewWidth * zoom > 1200 ? 1536 : 1024;
    if (this.width === width) { return; }
    this.width = width;
    this.clear();
  }
  window(indices: number[]): void {
    const keep = new Set(indices.filter(i => i >= 0 && i < this.book.pages.length).slice(0, 8));
    this.entries.forEach((entry, i) => {
      if (!keep.has(i)) { entry.abort.abort(); entry.texture?.dispose(); this.entries.delete(i); }
    });
    keep.forEach(i => {
      if (this.entries.has(i)) { return; }
      const abort = new AbortController();
      const entry = { abort, task: Promise.resolve(this.blank), texture: undefined as THREE.Texture | undefined };
      this.entries.set(i, entry);
      entry.task = this.load(this.book.pages[i], abort.signal).catch(() =>
        this.disposed || abort.signal.aborted ? this.blank : this.paint('Không tải được trang này.\nBạn có thể thử lại hoặc xem trang tiếp theo.')
      ).then(texture => {
        if (this.disposed || abort.signal.aborted || this.entries.get(i) !== entry) {
          if (texture !== this.blank) { texture.dispose(); }
          return this.blank;
        }
        entry.texture = texture; this.invalidate(); return texture;
      });
    });
  }
  at(i: number): THREE.Texture { return this.entries.get(i)?.texture || this.blank; }
  async ready(indices: number[]): Promise<void> {
    await Promise.all(indices.map(i => this.entries.get(i)?.task));
  }
  retry(): void { this.clear(); }
  dispose(): void { this.disposed = true; this.clear(); this.blank.dispose(); }
  private clear(): void {
    this.entries.forEach(e => { e.abort.abort(); e.texture?.dispose(); }); this.entries.clear();
  }
  async image(url: string, signal: AbortSignal): Promise<THREE.Texture> {
    const request = new AbortController();
    const cancel = (): void => request.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { request.abort(); }
    const timer = window.setTimeout(cancel, 12000);
    try {
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok) { throw new Error('image'); }
    const blob = await response.blob();
    if (signal.aborted || this.disposed) { throw new Error('cancelled'); }
    const bitmap = await createImageBitmap(blob);
    try {
      if (signal.aborted || this.disposed) { throw new Error('cancelled'); }
      const canvas = document.createElement('canvas');
      canvas.width = this.width;
      canvas.height = Math.round(this.width * this.book.height / this.book.width);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
      ctx.drawImage(bitmap, (canvas.width - bitmap.width * scale) / 2,
        (canvas.height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
      return this.texture(canvas);
    } finally { bitmap.close(); }
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
    }
  }
  private load(page: ReaderPage, signal: AbortSignal): Promise<THREE.Texture> {
    return page.kind === 'image' ? this.image(page.url, signal)
      : Promise.resolve(this.paint(page.text, page.heading, page));
  }
  paint(text: string, heading = '', page?: Extract<ReaderPage, { kind: 'text' }>): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = this.width; canvas.height = Math.round(this.width * this.book.height / this.book.width);
    const ctx = canvas.getContext('2d')!, w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#242424';
    // Fit the real text, never truncate it silently; 2D remains available.
    const family = page?.fontFamily === 'sans' ? 'Arial, sans-serif' : '"Vina Reader", Georgia, serif';
    let fontSize = w * Math.max(18, Math.min(22, page?.fontSize || 20)) / 500, lines: string[] = [];
    do {
      ctx.font = fontSize + 'px ' + family;
      lines = [];
      (heading ? heading + '\n\n' + text : text).split('\n').forEach(para => {
        let line = '';
        para.split(' ').forEach(word => {
          if (ctx.measureText(line + word).width > w * .82 && line) { lines.push(line); line = ''; }
          // Long unbroken tokens must wrap too; never draw outside the paper.
          for (const glyph of Array.from(word)) {
            if (line && ctx.measureText(line + glyph).width > w * .82) { lines.push(line); line = ''; }
            line += glyph;
          }
          line += ' ';
        });
        lines.push(line);
      });
      if (lines.length * fontSize * 1.5 <= h * .82) { break; }
      fontSize *= .9;
    } while (fontSize > 8);
    ctx.textAlign = page?.textAlign === 'center' ? 'center' : 'left';
    lines.forEach((line, i) => ctx.fillText(line, ctx.textAlign === 'center' ? w / 2 : w * .09, h * .09 + i * fontSize * 1.5));
    if (page?.printedNumber) {
      ctx.textAlign = 'center'; ctx.font = w * .025 + 'px ' + family;
      ctx.fillText(String(page.printedNumber), w / 2, h * .955);
    }
    return this.texture(canvas);
  }
  private texture(canvas: HTMLCanvasElement): THREE.Texture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    return texture;
  }
}
