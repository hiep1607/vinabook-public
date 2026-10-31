import * as THREE from 'three';
import { ReaderBook } from './reader-model';
import { ReaderController } from './reader-controller';
import { PaperboundLeaf } from './paperbound-leaf';
import { ReaderTextures } from './reader-textures';
import { clamp, spread } from './paperbound-math';

export interface ReaderSnapshot { state: string; turned: number; opened: boolean; }
export class ReaderScene {
  readonly control: ReaderController;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(33, 1, .05, 100);
  private book = new THREE.Group();
  private cover = new THREE.Group();
  private bundle = new THREE.Group();
  private left!: PaperboundLeaf;
  private right!: PaperboundLeaf;
  private active!: PaperboundLeaf;
  private leftStack!: THREE.Mesh;
  private rightStack!: THREE.Mesh;
  private textures: ReaderTextures;
  private coverTextures: THREE.Texture[] = [];
  private abort = new AbortController();
  private observer?: ResizeObserver;
  private frame?: number;
  private dead = false;
  private hidden = false;
  private cleanup: Array<() => void> = [];
  private zoom = 1;
  private yaw = 0;
  private tilt = 1.49;
  private depth: number;
  private board: number;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag?: { id: number; x: number; y: number; lastX: number; lastY: number; time: number; velocity: number; origin: number; direction: number; moved: boolean };
  private pinch = 0;
  private sound = false;
  private audio?: AudioContext;
  private notified = '';

  constructor(private host: HTMLElement, private data: ReaderBook, reduced: boolean,
    private change: (snapshot: ReaderSnapshot) => void, private failed: () => void) {
    this.board = data.hardcover ? .045 : .015;
    this.depth = clamp((data.totalPages || 180) * .0008, .12, .4);
    this.control = new ReaderController(data.pages.length, reduced, () => { this.notify(); this.invalidate(); });
    this.textures = new ReaderTextures(data, () => this.invalidate());
  }
  async init(): Promise<void> {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = .85;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
      this.renderer.domElement.setAttribute('aria-hidden', 'true'); this.host.appendChild(this.renderer.domElement);
      this.scene.add(new THREE.HemisphereLight(0xfff9ed, 0x6a6256, .85));
      const light = new THREE.DirectionalLight(0xfff2de, .65);
      light.position.set(-3, 8, 3); light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -6; light.shadow.camera.right = 6;
      light.shadow.camera.top = 5; light.shadow.camera.bottom = -5; light.shadow.normalBias = .006;
      this.scene.add(light);
      const fill = new THREE.DirectionalLight(0xf4f7ff, .15); fill.position.set(4, 5, -3); this.scene.add(fill);
      this.scene.add(this.book);
      this.buildBook();
      this.listen();
      this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host);
      this.resize(); this.syncTextures();
      await Promise.all([this.loadCovers(), this.textures.ready([0, 1])]);
      if (this.dead) { return; }
      this.control.open(); this.invalidate();
    } catch {
      if (!this.dead) { this.dispose(); this.failed(); }
    }
  }
  private buildBook(): void {
    const w = this.data.width, h = this.data.height, b = this.board;
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x545047, roughness: .85 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + .07, b, h + .09), coverMat);
    back.position.set(w / 2, .05, 0); back.castShadow = true; this.book.add(back);
    back.name = 'back-board';
    const front = new THREE.Mesh(new THREE.BoxGeometry(w + .07, b, h + .09), coverMat);
    front.position.x = w / 2; front.castShadow = true; front.receiveShadow = true; this.cover.add(front);
    const face = this.face(w, h, this.textures.blank);
    face.position.y = b / 2 + .003; face.name = 'front-art'; this.cover.add(face);
    const inside = this.face(w, h, this.textures.blank);
    inside.rotation.x = Math.PI / 2; inside.position.y = -b / 2 - .003; this.cover.add(inside);
    this.book.add(this.cover);
    const rear = this.face(w, h, this.textures.blank);
    rear.rotation.x = Math.PI / 2; rear.position.y = .05 - b / 2 - .003; rear.name = 'back-art'; this.book.add(rear);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(.055, this.depth + b * 2, h + .09), coverMat.clone());
    spine.position.set(-.025, .05 + this.depth / 2, 0); spine.name = 'spine'; spine.castShadow = true; this.book.add(spine);
    this.leftStack = this.stack(w, h); this.rightStack = this.stack(w, h);
    this.bundle.add(this.leftStack); this.book.add(this.bundle, this.rightStack);
    this.left = new PaperboundLeaf(w, h, this.textures.blank);
    this.right = new PaperboundLeaf(w, h, this.textures.blank);
    this.active = new PaperboundLeaf(w, h, this.textures.blank);
    this.book.add(this.left.mesh, this.right.mesh, this.active.mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: .18 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = .012; this.scene.add(floor);
  }
  private face(w: number, h: number, texture: THREE.Texture): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }));
    face.rotation.x = -Math.PI / 2; face.position.x = w / 2; return face;
  }
  private stack(w: number, h: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w - .01, 1, h - .012),
      new THREE.MeshStandardMaterial({ color: 0xe2d9c8, roughness: 1 }));
    mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  private async loadCovers(): Promise<void> {
    await Promise.all([
      [this.data.cover, this.cover.getObjectByName('front-art')],
      [this.data.backCover, this.book.getObjectByName('back-art')],
      [this.data.spine, this.book.getObjectByName('spine')]
    ].map(async ([source, object]) => {
      if (!object) { return; }
      if (!source && object !== this.cover.getObjectByName('front-art')) { return; }
      let texture: THREE.Texture;
      try { texture = source ? await this.textures.image(source as string, this.abort.signal) : this.textures.paint(this.data.author, this.data.title); }
      catch {
        if (this.dead) { return; }
        texture = this.textures.paint(this.data.author, this.data.title);
      }
      if (this.dead) { texture.dispose(); return; }
      this.coverTextures.push(texture);
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      mesh.material.map = texture; mesh.material.needsUpdate = true; this.invalidate();
    }));
  }
  private syncTextures(): void {
    const pair = spread(this.control.turned, this.data.pages.length);
    const center = Math.max(0, pair.right === -1 ? pair.left : pair.right);
    this.textures.window(Array.from({ length: 8 }, (_, i) => center - 3 + i));
  }
  private layout(): void {
    const c = this.control, w = this.data.width, count = Math.max(1, Math.ceil(this.data.pages.length / 2));
    const pair = spread(c.turned, this.data.pages.length);
    const turning = c.state === 'dragging' || c.state === 'settling';
    const t = c.turned, progress = c.progress;
    const moved = turning ? (c.direction > 0 ? t + progress : t - 1 + progress) : t;
    const leftDepth = this.depth * moved / count, rightDepth = this.depth - leftDepth;
    const base = .09, lift = .04;
    this.book.position.x = -(1 - c.opening) * w / 2;
    this.cover.rotation.z = Math.PI * c.opening;
    this.cover.position.y = (base + this.depth + this.board) * (1 - c.opening) + .05 * c.opening;
    this.leftStack.visible = moved > 0;
    this.leftStack.scale.y = Math.max(.002, leftDepth);
    this.leftStack.position.set(-w / 2, leftDepth / 2, 0);
    this.bundle.position.set(0, base, 0); this.bundle.rotation.z = 0;
    this.rightStack.scale.y = Math.max(.002, rightDepth);
    this.rightStack.position.set(w / 2, base + rightDepth / 2, 0);
    this.left.mesh.visible = pair.left >= 0 && c.opening > .98;
    this.right.mesh.visible = pair.right >= 0 && c.opening > .98;
    this.active.mesh.visible = turning;
    this.left.textures(this.textures.blank, this.textures.at(pair.left));
    this.right.textures(this.textures.at(pair.right), this.textures.blank);
    this.left.update(1, base + leftDepth + lift);
    this.right.update(0, base + rightDepth + lift);
    if (turning) {
      const index = c.direction > 0 ? t : t - 1;
      // Support blocks exclude the moving sheet; otherwise their top faces
      // occlude the next printed page during the first half of a turn.
      const underLeft = this.depth * index / count;
      const underRight = this.depth * Math.max(0, count - index - 1) / count;
      this.leftStack.visible = index > 0;
      this.leftStack.scale.y = Math.max(.002, underLeft);
      this.leftStack.position.y = underLeft / 2;
      this.rightStack.scale.y = Math.max(.002, underRight);
      this.rightStack.position.y = base + underRight / 2;
      this.left.mesh.visible = index > 0;
      this.right.mesh.visible = 2 * index + 2 < this.data.pages.length;
      this.left.textures(this.textures.blank, this.textures.at(index * 2 - 1));
      this.right.textures(this.textures.at(index * 2 + 2), this.textures.blank);
      this.active.textures(this.textures.at(index * 2), this.textures.at(index * 2 + 1));
      this.active.update(progress, base + rightDepth * (1 - progress) + leftDepth * progress + lift + .009, c.corner);
      this.left.update(1, base + this.depth * index / count + lift);
      this.right.update(0, base + this.depth * Math.max(0, count - index - 1) / count + lift);
    }
    if (c.state === 'closing' && c.collect > 0) {
      // One solid bundle, not simultaneous leaves using colliding leafBase values.
      // Rotate it above the untouched right stack, then lower it as a single block.
      this.left.mesh.visible = this.right.mesh.visible = this.active.mesh.visible = false;
      const p = c.collect;
      this.bundle.position.y = base + (rightDepth + leftDepth + .08) * Math.min(1, p * 5);
      this.bundle.rotation.z = -Math.PI * clamp((p - .2) / .6);
      if (p > .8) { this.bundle.position.y = base + rightDepth + leftDepth + .08 * (1 - (p - .8) / .2); }
    }
    this.cameraFit();
  }
  private cameraFit(): void {
    const aspect = this.camera.aspect, opening = this.control.opening;
    const w = this.data.width * (1 + opening) + .14, h = this.data.height + .16;
    const fov = this.camera.fov * Math.PI / 180;
    const distance = Math.max(h, w / aspect) / (2 * Math.tan(fov / 2)) * 1.02 / this.zoom;
    const target = new THREE.Vector3(0, .12, 0);
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.tilt) * distance,
      target.y + Math.sin(this.tilt) * distance, Math.cos(this.yaw) * Math.cos(this.tilt) * distance);
    this.camera.lookAt(target); this.camera.updateMatrixWorld();
  }
  private resize(): void {
    if (this.dead || !this.renderer) { return; }
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.textures.resolution(width, this.zoom); this.syncTextures(); this.invalidate();
  }
  private notify(): void {
    const c = this.control, key = c.state + ':' + c.turned;
    if (key !== this.notified) {
      this.notified = key; this.change({ state: c.state, turned: c.turned, opened: c.state !== 'closed' });
    }
    this.syncTextures();
  }
  private invalidate = (): void => {
    if (this.dead || this.hidden || this.frame !== undefined) { return; }
    this.frame = requestAnimationFrame(now => {
      this.frame = undefined;
      if (this.dead) { return; }
      const moving = this.control.tick(now);
      this.layout(); this.renderer?.render(this.scene, this.camera);
      if (moving) { this.invalidate(); }
    });
  };
  turn(direction: number): void {
    if (this.control.begin(direction)) {
      this.control.settle(); this.playPaper(); this.invalidate();
    }
  }
  toggleCover(): void {
    if (this.control.state === 'closed') { this.control.open(); } else { this.control.close(); }
    this.invalidate();
  }
  seek(index: number): void {
    if (this.control.busy) { return; }
    this.control.turned = Math.floor((index + 1) / 2);
    this.control.state = 'ready'; this.control.opening = 1;
    this.notify(); this.invalidate();
  }
  setZoom(delta: number): void {
    this.zoom = clamp(this.zoom + delta, .7, 2.4); this.resize();
  }
  top(): void { this.yaw = 0; this.tilt = 1.56; this.zoom = 1; this.resize(); }
  reset(): void { this.yaw = 0; this.tilt = 1.49; this.zoom = 1; this.resize(); }
  setSound(enabled: boolean): void { this.sound = enabled; }
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) {
      this.cancelDrag();
      if (this.frame !== undefined) { cancelAnimationFrame(this.frame); this.frame = undefined; }
    } else { this.resize(); }
  }
  retry(): void { this.textures.retry(); this.syncTextures(); this.invalidate(); }
  private playPaper(): void {
    if (!this.sound || this.dead) { return; }
    try {
      this.audio = this.audio || new AudioContext();
      void this.audio.resume();
      const n = Math.floor(this.audio.sampleRate * .35), buffer = this.audio.createBuffer(1, n, this.audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) { data[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * i / n), 1.8); }
      const src = this.audio.createBufferSource(), gain = this.audio.createGain(), filter = this.audio.createBiquadFilter();
      src.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 1500; gain.gain.value = .055;
      src.connect(filter).connect(gain).connect(this.audio.destination);
      src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); }; src.start();
    } catch { /* Optional sound must not prevent reading. */ }
  }
  private hit(event: PointerEvent): { x: number; z: number } | undefined {
    const ray = this.ray(event);
    const hits = ray.intersectObjects([this.left.mesh, this.right.mesh, this.active.mesh].filter(m => m.visible));
    if (!hits.length) { return undefined; }
    return this.book.worldToLocal(hits[0].point);
  }
  private ray(event: PointerEvent): THREE.Raycaster {
    const rect = this.host.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera); return ray;
  }
  private groundX(event: PointerEvent): number {
    const point = this.ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.35), new THREE.Vector3());
    return point ? point.x - this.book.position.x : 0;
  }
  private down = (e: PointerEvent): void => {
    if (e.button > 0 || this.hidden) { return; }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.host.setPointerCapture(e.pointerId);
    if (this.pointers.size >= 2) {
      this.cancelDrag();
      const pts = [...this.pointers.values()]; this.pinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); return;
    }
    if (this.control.busy) { return; }
    const hit = this.hit(e), direction = hit ? (hit.x > 0 ? 1 : -1) : 0;
    if (hit && !this.control.canTurn(direction)) { return; }
    this.control.corner = hit ? clamp(hit.z / (this.data.height / 2), -1, 1) : 0;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX,
      lastY: e.clientY, time: performance.now(), velocity: 0, origin: this.groundX(e), direction, moved: false };
  };
  private move = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) { return; }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const pts = [...this.pointers.values()], distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinch) { this.zoom = clamp(this.zoom * distance / this.pinch, .7, 2.4); }
      this.pinch = distance; this.invalidate(); return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) { return; }
    const now = performance.now();
    d.moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
    if (d.direction && d.moved) {
      if (this.control.state === 'ready') { this.control.begin(d.direction, true); }
      this.control.drag((d.direction > 0 ? 0 : 1) - (this.groundX(e) - d.origin) / (this.data.width * 1.68));
      d.velocity = (e.clientX - d.lastX) / Math.max(1, now - d.time);
    } else if (!d.direction) {
      this.yaw -= (e.clientX - d.lastX) * .004;
      this.tilt = clamp(this.tilt + (e.clientY - d.lastY) * .003, .6, 1.56);
    }
    d.lastX = e.clientX; d.lastY = e.clientY; d.time = now;
    this.invalidate();
  };
  private up = (e: PointerEvent): void => {
    const cancelled = e.type !== 'pointerup', d = this.drag;
    this.pointers.delete(e.pointerId);
    if (d?.id === e.pointerId) {
      if (this.control.state === 'dragging') {
        this.control.release(performance.now() - d.time < 120 ? d.velocity : 0, !cancelled);
        if (!cancelled) { this.playPaper(); }
      } else if (!cancelled && !d.moved && d.direction) { this.turn(d.direction); }
      this.drag = undefined;
    }
    if (this.host.hasPointerCapture(e.pointerId)) { this.host.releasePointerCapture(e.pointerId); }
    if (!this.pointers.size) { this.pinch = 0; this.resize(); }
    this.invalidate();
  };
  private cancelDrag(): void {
    if (this.control.state === 'dragging') { this.control.release(0, false); }
    this.drag = undefined; this.invalidate();
  }
  private listen(): void {
    const add = (name: string, fn: EventListener, options?: AddEventListenerOptions): void => {
      this.host.addEventListener(name, fn, options);
      this.cleanup.push(() => this.host.removeEventListener(name, fn, options));
    };
    add('pointerdown', this.down as EventListener); add('pointermove', this.move as EventListener);
    add('pointerup', this.up as EventListener); add('pointercancel', this.up as EventListener);
    add('lostpointercapture', this.up as EventListener);
    add('wheel', ((e: WheelEvent) => { e.preventDefault(); this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * .001), .7, 2.4); this.resize(); }) as EventListener, { passive: false });
    const lost = (e: Event): void => { e.preventDefault(); this.dispose(); this.failed(); };
    this.renderer.domElement.addEventListener('webglcontextlost', lost);
    this.cleanup.push(() => this.renderer.domElement.removeEventListener('webglcontextlost', lost));
  }
  dispose(): void {
    if (this.dead) { return; }
    this.dead = true; this.abort.abort(); this.control.dispose(); this.observer?.disconnect();
    this.cleanup.forEach(fn => fn()); this.cleanup = [];
    this.pointers.forEach((_, id) => { if (this.host.hasPointerCapture(id)) { this.host.releasePointerCapture(id); } });
    this.pointers.clear(); this.drag = undefined;
    if (this.frame !== undefined) { cancelAnimationFrame(this.frame); this.frame = undefined; }
    this.textures.dispose(); this.coverTextures.forEach(t => t.dispose()); this.coverTextures = [];
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.DirectionalLight) { object.shadow.map?.dispose(); }
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) { geometry.add(mesh.geometry); }
      (Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []).forEach(m => materials.add(m));
    });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    this.scene.clear(); this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer?.domElement.remove();
    if (this.audio) { void this.audio.close(); this.audio = undefined; }
  }
}
