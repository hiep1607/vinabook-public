import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  EventEmitter,
  Output
} from '@angular/core';
import type * as ThreeTypes from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';
import type { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { gsap } from 'gsap';
import { MotionService } from '../../services/motion.service';

import {
  BOOK_MATERIAL_CONFIG,
  BOOK_MODEL_CONFIG,
  BOOK_MOTION_CONFIG,
  BOOK_RENDER_CONFIG,
  BookPalette
} from './book-3d.config';

@Component({
  selector: 'app-book-3d-viewer',
  templateUrl: './book-3d-viewer.component.html',
  styleUrls: ['./book-3d-viewer.component.scss']
})
export class Book3dViewerComponent implements AfterViewInit, OnChanges, OnDestroy {

  private readonly canvasFontFamily = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';

  @Input() coverImage = '';
  @Input() originalCoverImage = '';
  @Input() title = 'Bìa sách';
  @Input() author = '';
  @Input() description = '';
  @Input() productId: number | string | null = null;
  @Input() category = '';
  @Input() publisher = '';
  @Input() pageCount: number | null = null;
  @Input() backImage = '';
  @Input() spineImage = '';
  @Input() previewEnabled = false;
  @Input() paused = false;

  @Output() previewRequested = new EventEmitter<void>();

  @ViewChild('canvasHost', { static: true })
  canvasHost!: ElementRef<HTMLDivElement>;

  @ViewChild('fallbackCover', { static: true })
  fallbackCover!: ElementRef<HTMLImageElement>;

  loading = true;
  fallback = false;
  imageUnavailable = false;
  fallbackCoverUrl = '';
  private three?: typeof import('three');
  private orbitControlsClass?: typeof import('three/examples/jsm/controls/OrbitControls')['OrbitControls'];
  private roundedBoxGeometryClass?: typeof RoundedBoxGeometry;
  private roomEnvironmentClass?: typeof RoomEnvironment;
  private scene?: ThreeTypes.Scene;
  private camera?: ThreeTypes.PerspectiveCamera;
  private renderer?: ThreeTypes.WebGLRenderer;
  private environmentTexture?: ThreeTypes.Texture;
  private controls?: OrbitControls;
  private bookGroup?: ThreeTypes.Group;
  private frontSpineHingePivot?: ThreeTypes.Group;
  private frontCoverPivot?: ThreeTypes.Group;
  private openTimeline?: gsap.core.Timeline;
  private bookOpen = false;
  private coverTexture?: ThreeTypes.Texture;
  private backTexture?: ThreeTypes.Texture;
  private spineTexture?: ThreeTypes.Texture;
  private generatedTextures: ThreeTypes.Texture[] = [];
  private sceneTextures: ThreeTypes.Texture[] = [];
  private resizeObserver?: ResizeObserver;
  private animationFrameId?: number;
  private initialized = false;
  private destroyed = false;
  private interacting = false;
  private lastInteractionAt = 0;
  private lastFrameAt = 0;
  private textureVersion = 0;
  private listeningToWindowResize = false;
  private targetBookRotation?: { x: number; y: number; z: number };
  private targetCameraPosition?: ThreeTypes.Vector3;
  private targetControlTarget?: ThreeTypes.Vector3;
  private homeCameraPosition?: ThreeTypes.Vector3;
  private homeControlTarget?: ThreeTypes.Vector3;
  private homeBookPositionY = 0;
  private readonly floorY = -1.69;
  private contactShadowMesh?: ThreeTypes.Mesh;
  private idleRotationY = BOOK_MODEL_CONFIG.initialRotation.y;
  private readonly reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly onControlStart = (): void => {
    this.interacting = true;
    this.targetBookRotation = undefined;
    this.targetCameraPosition = undefined;
    this.targetControlTarget = undefined;
    this.lastInteractionAt = performance.now();
  };

  private readonly onControlEnd = (): void => {
    this.interacting = false;
    this.lastInteractionAt = performance.now();
    this.idleRotationY = this.bookGroup?.rotation.y ?? this.idleRotationY;
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    this.showFallback();
  };

  private readonly onWindowResize = (): void => this.resizeRenderer();

  private readonly onCanvasDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.three && this.camera && this.bookGroup && this.renderer) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const pointer = new this.three.Vector2(
        ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
        -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
      );
      const raycaster = new this.three.Raycaster();
      raycaster.setFromCamera(pointer, this.camera);
      if (!raycaster.intersectObject(this.bookGroup, true).length) {
        return;
      }
    }
    this.requestPreview();
  };

  constructor(
    private zone: NgZone,
    private motion: MotionService
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      void this.motion.waitForBookRouteTransitionIdle().then(() => {
        if (!this.destroyed) {
          return this.initializeViewer();
        }
        return undefined;
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.paused) {
      if (this.animationFrameId !== undefined) {
        cancelAnimationFrame(this.animationFrameId); this.animationFrameId = undefined;
      }
      if (this.controls) { this.controls.enabled = !this.paused; }
      if (!this.paused && this.initialized && !this.destroyed && this.renderer) {
        this.lastFrameAt = performance.now();
        this.zone.runOutsideAngular(() => this.renderLoop(this.lastFrameAt));
      }
    }
    if (!this.initialized || this.destroyed) {
      return;
    }

    if (
      changes.coverImage
      || changes.originalCoverImage
      || changes.backImage
      || changes.spineImage
      || changes.title
      || changes.author
      || changes.description
      || changes.productId
      || changes.category
      || changes.publisher
      || changes.pageCount
    ) {
      this.zone.runOutsideAngular(() => this.loadBookTextures());
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.textureVersion++;
    this.openTimeline?.kill();
    this.openTimeline = undefined;

    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.listeningToWindowResize) {
      window.removeEventListener('resize', this.onWindowResize);
      this.listeningToWindowResize = false;
    }

    if (this.controls) {
      this.controls.removeEventListener('start', this.onControlStart);
      this.controls.removeEventListener('end', this.onControlEnd);
      this.controls.dispose();
      this.controls = undefined;
    }

    const canvas = this.renderer?.domElement;
    canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    canvas?.removeEventListener('dblclick', this.onCanvasDoubleClick);

    this.disposeBook();
    this.disposeSceneObjects();

    if (this.scene) {
      this.scene.environment = null;
    }
    this.environmentTexture?.dispose();
    this.environmentTexture = undefined;
    this.sceneTextures.forEach(texture => texture.dispose());
    this.sceneTextures = [];

    if (this.renderer) {
      this.renderer.renderLists.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.renderer = undefined;
    }

    this.scene = undefined;
    this.camera = undefined;
    this.initialized = false;
  }

  resetView(): void {
    const THREE = this.three;
    if (this.bookOpen) {
      this.closeBook();
      return;
    }
    if (!this.controls || !this.bookGroup || !this.camera || !THREE) {
      return;
    }

    const initialRotation = BOOK_MODEL_CONFIG.initialRotation;
    if (!this.homeCameraPosition || !this.homeControlTarget) {
      this.fitCameraToBook(false);
    }
    if (!this.homeCameraPosition || !this.homeControlTarget) {
      return;
    }
    this.targetBookRotation = { ...initialRotation };
    this.targetCameraPosition = this.homeCameraPosition.clone();
    this.targetControlTarget = this.homeControlTarget.clone();
    this.idleRotationY = initialRotation.y;

    if (this.reduceMotion) {
      this.bookGroup.rotation.set(initialRotation.x, initialRotation.y, initialRotation.z);
      this.bookGroup.position.y = this.homeBookPositionY;
      this.camera.position.copy(this.targetCameraPosition);
      this.controls.target.copy(this.targetControlTarget);
      this.targetBookRotation = undefined;
      this.targetCameraPosition = undefined;
      this.targetControlTarget = undefined;
      this.controls.update();
    }
    this.lastInteractionAt = performance.now();
  }

  requestPreview(): void {
    if (this.previewEnabled) {
      this.canvasHost.nativeElement.parentElement?.querySelector<HTMLButtonElement>(
        '.preview-button, .fallback-preview-button'
      )?.focus({ preventScroll: true });
      this.emitPreviewRequested();
    }
  }

  closeBook(): void {
    if (!this.openTimeline) {
      return;
    }
    if (this.openTimeline.isActive()) {
      this.openTimeline.reverse();
      return;
    }
    if (this.bookOpen) {
      this.openTimeline.reverse();
    }
  }

  private emitPreviewRequested(): void {
    this.zone.run(() => this.previewRequested.emit());
  }

  onFallbackImageError(): void {
    const original = (this.originalCoverImage || '').trim();
    if (original && this.fallbackCoverUrl !== original) {
      this.fallbackCoverUrl = original;
      return;
    }
    this.imageUnavailable = true;
    this.showFallback();
  }

  getMotionSource(): HTMLElement | null {
    return this.fallbackCover?.nativeElement || null;
  }

  private async initializeViewer(): Promise<void> {
    if (this.destroyed || !this.canvasHost?.nativeElement || !this.isWebGlAvailable()) {
      this.showFallback();
      return;
    }

    try {
      const [THREE, controlsModule, roundedBoxModule, roomEnvironmentModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls'),
        import('three/examples/jsm/geometries/RoundedBoxGeometry'),
        import('three/examples/jsm/environments/RoomEnvironment')
      ]);
      if (this.destroyed) {
        return;
      }
      this.three = THREE;
      this.orbitControlsClass = controlsModule.OrbitControls;
      this.roundedBoxGeometryClass = roundedBoxModule.RoundedBoxGeometry;
      this.roomEnvironmentClass = roomEnvironmentModule.RoomEnvironment;

      const host = this.canvasHost.nativeElement;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(BOOK_RENDER_CONFIG.desktopFov, 1, 0.1, 100);
      this.camera.position.set(0, 0.08, 7.4);

      this.renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, BOOK_RENDER_CONFIG.pixelRatioLimit));
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = BOOK_RENDER_CONFIG.toneMappingExposure;
      // A single soft contact-shadow plane is cleaner for this transparent
      // product stage than a low-angle shadow map, which can reveal polygonal
      // facets and sampling speckles on the background.
      this.renderer.shadowMap.enabled = false;
      this.renderer.domElement.className = 'book-canvas';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
      this.renderer.domElement.addEventListener('dblclick', this.onCanvasDoubleClick);
      host.appendChild(this.renderer.domElement);

      this.setupEnvironment();
      this.setupLights();
      this.setupGroundShadow();
      this.setupControls();
      this.setupResizeObserver();

      this.initialized = true;
      this.lastInteractionAt = performance.now();
      this.lastFrameAt = performance.now();
      this.resizeRenderer();
      this.loadBookTextures();
      this.renderLoop(this.lastFrameAt);
    } catch {
      this.disposeBook();
      this.disposeSceneObjects();
      this.renderer?.dispose();
      this.renderer?.domElement.remove();
      this.renderer = undefined;
      this.showFallback();
    }
  }

  private setupEnvironment(): void {
    const THREE = this.three;
    const RoomEnvironmentClass = this.roomEnvironmentClass;
    if (!this.scene || !this.renderer || !THREE || !RoomEnvironmentClass) {
      return;
    }

    const environment = new RoomEnvironmentClass();
    const generator = new THREE.PMREMGenerator(this.renderer);
    generator.compileEquirectangularShader();
    this.environmentTexture = generator.fromScene(environment, 0.035).texture;
    this.scene.environment = this.environmentTexture;
    environment.dispose();
    generator.dispose();
  }

  private setupLights(): void {
    const THREE = this.three;
    if (!this.scene || !THREE) {
      return;
    }

    const hemisphere = new THREE.HemisphereLight(0xfffbf2, 0x26302c, 0.21);
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0xfffbf2, 0.06);
    this.scene.add(ambient);

    // Rect lights provide the broad reflections of a product-photography softbox.
    const keySoftbox = new THREE.RectAreaLight(0xfff7eb, 0.86, 4.8, 5.4);
    keySoftbox.position.set(3.8, 4.9, 5.5);
    keySoftbox.lookAt(0, 0, 0);
    this.scene.add(keySoftbox);

    const keyLight = new THREE.DirectionalLight(0xfff7eb, 0.38);
    keyLight.position.set(2.2, 9, 3.2);
    this.scene.add(keyLight);

    const fillLight = new THREE.RectAreaLight(0xdce7e1, 0.28, 3.6, 4.4);
    fillLight.position.set(-4.2, 1.2, 3.3);
    fillLight.lookAt(0, -0.1, 0);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffe7c8, 0.15);
    rimLight.position.set(2.2, 3.2, -4.8);
    this.scene.add(rimLight);
  }

  private setupGroundShadow(): void {
    const THREE = this.three;
    if (!this.scene || !THREE) {
      return;
    }

    const contactTexture = this.createContactShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: contactTexture,
        color: 0x142019,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        toneMapped: false
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, this.floorY + 0.002, 0.015);
    contactShadow.renderOrder = 2;
    contactShadow.name = 'book-contact-shadow';
    contactShadow.visible = false;
    this.contactShadowMesh = contactShadow;
    this.scene.add(contactShadow);
  }

  private setupControls(): void {
    const OrbitControlsClass = this.orbitControlsClass;
    if (!this.camera || !this.renderer || !OrbitControlsClass) {
      return;
    }

    this.controls = new OrbitControlsClass(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = BOOK_MOTION_CONFIG.dampingFactor;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = BOOK_MOTION_CONFIG.rotateSpeed;
    this.controls.zoomSpeed = BOOK_MOTION_CONFIG.zoomSpeed;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 12;
    this.controls.minPolarAngle = BOOK_MOTION_CONFIG.minPolarAngle;
    this.controls.maxPolarAngle = BOOK_MOTION_CONFIG.maxPolarAngle;
    this.controls.target.set(0, 0, 0);
    this.controls.saveState();
    this.controls.addEventListener('start', this.onControlStart);
    this.controls.addEventListener('end', this.onControlEnd);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeRenderer());
      this.resizeObserver.observe(this.canvasHost.nativeElement);
      return;
    }

    window.addEventListener('resize', this.onWindowResize, { passive: true });
    this.listeningToWindowResize = true;
  }

  private resizeRenderer(): void {
    if (!this.renderer || !this.camera || !this.canvasHost?.nativeElement) {
      return;
    }

    const rect = this.canvasHost.nativeElement.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, BOOK_RENDER_CONFIG.pixelRatioLimit));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < 0.82
      ? BOOK_RENDER_CONFIG.narrowFov
      : BOOK_RENDER_CONFIG.desktopFov;
    this.camera.updateProjectionMatrix();
    if (this.bookGroup) {
      this.fitCameraToBook(false);
    }
  }

  private loadBookTextures(): void {
    const THREE = this.three;
    const source = (this.coverImage || '').trim();
    const version = ++this.textureVersion;

    this.zone.run(() => {
      this.loading = true;
      this.fallback = false;
      this.imageUnavailable = false;
      this.fallbackCoverUrl = source || (this.originalCoverImage || '').trim();
    });

    if (!source || !this.renderer || !this.scene || !THREE) {
      this.showFallback();
      return;
    }

    this.loadFrontTexture(source, version, true);
  }

  private loadFrontTexture(source: string, version: number, allowOriginalFallback: boolean): void {
    const THREE = this.three;
    if (!THREE) {
      this.showFallback();
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      source,
      texture => {
        if (this.destroyed || version !== this.textureVersion) {
          texture.dispose();
          return;
        }

        this.prepareTexture(texture);
        this.disposeBook();
        this.coverTexture = texture;
        this.loadOptionalTextures(version, texture);
      },
      undefined,
      () => {
        if (version !== this.textureVersion) {
          return;
        }

        const original = (this.originalCoverImage || '').trim();
        if (allowOriginalFallback && original && original !== source) {
          this.zone.run(() => this.fallbackCoverUrl = original);
          this.loadFrontTexture(original, version, false);
          return;
        }

        this.disposeBook();
        this.showFallback();
      }
    );
  }

  private loadOptionalTextures(version: number, cover: ThreeTypes.Texture): void {
    const THREE = this.three;
    if (!THREE) {
      this.showFallback();
      return;
    }
    const optionalSources = [this.backImage, this.spineImage];
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    const loadOptional = (source: string): Promise<ThreeTypes.Texture | undefined> => {
      const normalized = (source || '').trim();
      if (!normalized) {
        return Promise.resolve(undefined);
      }
      return new Promise(resolve => {
        loader.load(
          normalized,
          texture => {
            this.prepareTexture(texture);
            resolve(texture);
          },
          undefined,
          () => resolve(undefined)
        );
      });
    };

    Promise.all(optionalSources.map(loadOptional)).then(([back, spine]) => {
      if (this.destroyed || version !== this.textureVersion) {
        back?.dispose();
        spine?.dispose();
        return;
      }

      this.backTexture = back;
      this.spineTexture = spine;
      this.buildBook(cover);
    });
  }

  private prepareTexture(texture: ThreeTypes.Texture): void {
    const THREE = this.three;
    if (!THREE) {
      return;
    }
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(
      this.renderer?.capabilities.getMaxAnisotropy() || 1,
      BOOK_RENDER_CONFIG.textureAnisotropyLimit
    );
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }

  private buildBook(frontTexture: ThreeTypes.Texture): void {
    const THREE = this.three;
    if (!this.scene || !THREE) {
      return;
    }

    this.disposeBook(false);

    const height = BOOK_MODEL_CONFIG.height;
    const aspect = this.getTextureAspect(frontTexture);
    const width = height * aspect;
    const depth = this.resolveBookDepth(width);
    const coverThickness = height * BOOK_MODEL_CONFIG.coverThicknessRatio;
    const coverOverhang = height * BOOK_MODEL_CONFIG.coverOverhangRatio;
    const coverWarp = height * BOOK_MODEL_CONFIG.coverWarpRatio;
    const technicalGap = BOOK_MODEL_CONFIG.technicalGap;
    const palette = this.extractCoverPalette(frontTexture);

    const group = new THREE.Group();
    group.name = 'interactive-book';
    group.rotation.set(
      BOOK_MODEL_CONFIG.initialRotation.x,
      BOOK_MODEL_CONFIG.initialRotation.y,
      BOOK_MODEL_CONFIG.initialRotation.z
    );

    const coverEdgeMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.dark,
      roughness: BOOK_MATERIAL_CONFIG.coverEdge.roughness,
      metalness: 0,
      clearcoat: BOOK_MATERIAL_CONFIG.coverEdge.clearcoat,
      clearcoatRoughness: BOOK_MATERIAL_CONFIG.coverEdge.clearcoatRoughness,
      envMapIntensity: BOOK_MATERIAL_CONFIG.coverEdge.envMapIntensity
    });
    const pageEdgeTexture = this.createPageEdgeTexture('fore');
    const pageEdgeBump = this.createPageBumpTexture('fore');
    const pageEdgeRoughness = this.createPageRoughnessTexture('fore');
    const pageTopTexture = this.createPaperSurfaceTexture('top', 'color');
    const pageTopBump = this.createPaperSurfaceTexture('top', 'bump');
    const pageTopRoughness = this.createPaperSurfaceTexture('top', 'roughness');
    const pageBottomTexture = this.createPaperSurfaceTexture('bottom', 'color');
    const pageBottomBump = this.createPaperSurfaceTexture('bottom', 'bump');
    const pageBottomRoughness = this.createPaperSurfaceTexture('bottom', 'roughness');
    const coverBumpTexture = this.createCoverGrainTexture('bump');
    const coverRoughnessTexture = this.createCoverGrainTexture('roughness');
    const pageMaterial = new THREE.MeshStandardMaterial({
      color: 0xf1ede4,
      roughness: BOOK_MATERIAL_CONFIG.paper.roughness,
      metalness: 0,
      envMapIntensity: BOOK_MATERIAL_CONFIG.paper.envMapIntensity,
      side: THREE.DoubleSide
    });
    const pageForeMaterial = new THREE.MeshStandardMaterial({
      map: pageEdgeTexture,
      bumpMap: pageEdgeBump,
      roughnessMap: pageEdgeRoughness,
      bumpScale: BOOK_MATERIAL_CONFIG.paper.bumpScale,
      color: 0xf6f1e8,
      roughness: BOOK_MATERIAL_CONFIG.paper.roughness,
      metalness: 0,
      envMapIntensity: BOOK_MATERIAL_CONFIG.paper.envMapIntensity,
      side: THREE.DoubleSide
    });
    const pageTopMaterial = new THREE.MeshStandardMaterial({
      map: pageTopTexture,
      bumpMap: pageTopBump,
      roughnessMap: pageTopRoughness,
      bumpScale: 0.0018,
      color: 0xffffff,
      roughness: BOOK_MATERIAL_CONFIG.paper.roughness,
      metalness: 0,
      envMapIntensity: BOOK_MATERIAL_CONFIG.paper.envMapIntensity,
      side: THREE.DoubleSide
    });
    const pageBottomMaterial = new THREE.MeshStandardMaterial({
      map: pageBottomTexture,
      bumpMap: pageBottomBump,
      roughnessMap: pageBottomRoughness,
      bumpScale: 0.0015,
      color: 0xffffff,
      roughness: 0.97,
      metalness: 0,
      envMapIntensity: 0.09,
      side: THREE.DoubleSide
    });
    const pageGrooveMaterial = new THREE.LineBasicMaterial({
      color: 0x8f8372,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      toneMapped: false
    });
    const pageSpineMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4c9b5,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.08,
      side: THREE.DoubleSide
    });
    const frontMaterial = new THREE.MeshPhysicalMaterial({
      map: frontTexture,
      bumpMap: coverBumpTexture,
      roughnessMap: coverRoughnessTexture,
      bumpScale: BOOK_MATERIAL_CONFIG.cover.bumpScale,
      roughness: BOOK_MATERIAL_CONFIG.cover.roughness,
      metalness: 0,
      clearcoat: BOOK_MATERIAL_CONFIG.cover.clearcoat,
      clearcoatRoughness: BOOK_MATERIAL_CONFIG.cover.clearcoatRoughness,
      envMapIntensity: BOOK_MATERIAL_CONFIG.cover.envMapIntensity
    });
    const resolvedBackTexture = this.backTexture || this.createBackTexture(
      this.title,
      this.author,
      this.description,
      this.category,
      this.publisher,
      this.productId,
      palette
    );
    const resolvedSpineTexture = this.spineTexture || this.createSpineTexture(this.title, this.author, palette);
    const backMaterial = new THREE.MeshPhysicalMaterial({
      map: resolvedBackTexture,
      bumpMap: coverBumpTexture,
      roughnessMap: coverRoughnessTexture,
      bumpScale: BOOK_MATERIAL_CONFIG.cover.bumpScale,
      color: 0xffffff,
      roughness: BOOK_MATERIAL_CONFIG.cover.roughness + 0.04,
      clearcoat: BOOK_MATERIAL_CONFIG.cover.clearcoat * 0.7,
      clearcoatRoughness: BOOK_MATERIAL_CONFIG.cover.clearcoatRoughness,
      envMapIntensity: BOOK_MATERIAL_CONFIG.cover.envMapIntensity
    });
    const spineFaceMaterial = new THREE.MeshPhysicalMaterial({
      map: resolvedSpineTexture,
      bumpMap: coverBumpTexture,
      roughnessMap: coverRoughnessTexture,
      bumpScale: BOOK_MATERIAL_CONFIG.spine.bumpScale,
      color: 0xffffff,
      roughness: BOOK_MATERIAL_CONFIG.spine.roughness,
      clearcoat: BOOK_MATERIAL_CONFIG.spine.clearcoat,
      clearcoatRoughness: BOOK_MATERIAL_CONFIG.spine.clearcoatRoughness,
      envMapIntensity: BOOK_MATERIAL_CONFIG.spine.envMapIntensity,
      emissive: palette.base,
      emissiveIntensity: 0.055,
      side: THREE.DoubleSide
    });

    const pageWidth = width - coverOverhang * 2;
    const pageHeight = height - coverOverhang * 2;
    const pageDepth = depth;
    const pageOffsetX = 0;
    const spineLeftX = -width / 2;
    const pageBlock = new THREE.Mesh(
      this.createPageBlockGeometry(pageWidth, pageHeight, pageDepth),
      // RoundedBoxGeometry inherits BoxGeometry's six face groups. Applying
      // materials to those groups keeps the page detail on the real surface,
      // avoiding coplanar overlay planes that can disappear at shallow angles.
      [
        pageForeMaterial,
        pageSpineMaterial,
        pageTopMaterial,
        pageBottomMaterial,
        pageMaterial,
        pageMaterial
      ]
    );
    pageBlock.position.x = pageOffsetX;
    pageBlock.castShadow = true;
    pageBlock.receiveShadow = true;
    group.add(pageBlock);

    // Each sheet intersects the top/bottom edge from the bound spine to the
    // fore edge. Real line geometry keeps those long, parallel separators
    // crisp at shallow angles where a texture would be lost to mipmapping.
    const horizontalGrooveGeometry = this.createHorizontalPageGrooveGeometry(pageWidth, pageDepth);
    const topPageGrooves = new THREE.LineSegments(horizontalGrooveGeometry, pageGrooveMaterial);
    topPageGrooves.position.set(pageOffsetX, pageHeight / 2 + 0.0025, 0);
    topPageGrooves.renderOrder = 3;
    group.add(topPageGrooves);

    const bottomPageGrooves = new THREE.LineSegments(horizontalGrooveGeometry, pageGrooveMaterial);
    bottomPageGrooves.position.set(pageOffsetX, -pageHeight / 2 - 0.0025, 0);
    bottomPageGrooves.renderOrder = 3;
    group.add(bottomPageGrooves);

    const foreEdge = new THREE.Mesh(
      this.createCurvedPageEdgeGeometry(pageDepth - 0.006, pageHeight - 0.012),
      pageForeMaterial
    );
    foreEdge.rotation.y = Math.PI / 2;
    foreEdge.position.set(
      // The grouped page-block face below is the visual fallback. This small
      // offset only gives the fore edge its natural, shallow paper-block bow.
      pageOffsetX + pageWidth / 2 + 0.002,
      0,
      0
    );
    foreEdge.castShadow = true;
    foreEdge.receiveShadow = true;
    group.add(foreEdge);

    const coverGeometry = new THREE.BoxGeometry(width, height, coverThickness, 1, 1, 1);
    const frontCover = new THREE.Mesh(coverGeometry, coverEdgeMaterial);
    const frontCoverCenterZ = pageDepth / 2 + technicalGap + coverThickness / 2;
    const backCoverCenterZ = -frontCoverCenterZ;
    const coverOuterZ = pageDepth / 2 + technicalGap + coverThickness;
    // A paperback bends in two stages: the narrow glued hinge yields first,
    // then the cover swings around it. Both pivots share the real front-spine
    // seam, so the cover cannot orbit around the middle of the page block.
    const frontSpineHingePivot = new THREE.Group();
    frontSpineHingePivot.name = 'front-spine-hinge-pivot';
    frontSpineHingePivot.position.set(spineLeftX, 0, frontCoverCenterZ);

    const frontCoverPivot = new THREE.Group();
    frontCoverPivot.name = 'front-cover-pivot';
    frontCover.position.set(width / 2, 0, 0);
    frontCover.castShadow = true;
    frontCover.receiveShadow = true;
    frontCoverPivot.add(frontCover);

    const frontFace = new THREE.Mesh(
      this.createWarpedCoverFaceGeometry(width, height, coverWarp),
      frontMaterial
    );
    frontFace.position.set(
      width / 2,
      0,
      coverThickness / 2 + BOOK_MODEL_CONFIG.coverBevel * 0.5
    );
    frontFace.castShadow = true;
    frontCoverPivot.add(frontFace);
    frontSpineHingePivot.add(frontCoverPivot);
    group.add(frontSpineHingePivot);

    const backCover = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, coverThickness, 1, 1, 1),
      coverEdgeMaterial
    );
    backCover.position.z = backCoverCenterZ;
    backCover.castShadow = true;
    backCover.receiveShadow = true;
    group.add(backCover);

    const backFace = new THREE.Mesh(
      this.createWarpedCoverFaceGeometry(
        width,
        height,
        coverWarp * BOOK_MODEL_CONFIG.backCoverWarpFactor
      ),
      backMaterial
    );
    backFace.rotation.y = Math.PI;
    backFace.position.z = -coverOuterZ - BOOK_MODEL_CONFIG.coverBevel * 0.5;
    backFace.castShadow = true;
    group.add(backFace);

    const spineBulge = pageDepth * BOOK_MODEL_CONFIG.spineBulgeRatio;
    const spineTotalDepth = coverOuterZ * 2;
    const spine = new THREE.Mesh(
      this.createPaperbackSpineGeometry(spineLeftX, height, spineTotalDepth, spineBulge),
      spineFaceMaterial
    );
    spine.castShadow = true;
    spine.receiveShadow = true;
    spine.name = 'paperback-book-spine';
    group.add(spine);

    [-1, 1].forEach(side => {
      const cap = new THREE.Mesh(
        this.createPaperbackSpineCapGeometry(spineLeftX, spineTotalDepth, spineBulge),
        coverEdgeMaterial
      );
      cap.position.y = side * height / 2;
      cap.name = side > 0 ? 'spine-top-cap' : 'spine-bottom-cap';
      group.add(cap);
    });

    const hingeMaterial = new THREE.MeshStandardMaterial({
      color: palette.dark,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.1,
      side: THREE.DoubleSide
    });
    [-1].forEach(side => {
      const hinge = new THREE.Mesh(
        new THREE.PlaneGeometry(BOOK_MODEL_CONFIG.hingeWidth, height - 0.018),
        hingeMaterial
      );
      hinge.position.set(
        spineLeftX + 0.026,
        0,
        side * (coverOuterZ + 0.0018)
      );
      if (side < 0) {
        hinge.rotation.y = Math.PI;
      }
      hinge.castShadow = true;
      group.add(hinge);
    });

    const flexibleHingeWidth = Math.max(BOOK_MODEL_CONFIG.hingeWidth, height * 0.018);
    const frontFlexibleHinge = new THREE.Mesh(
      new THREE.PlaneGeometry(flexibleHingeWidth, height - 0.018),
      hingeMaterial
    );
    frontFlexibleHinge.name = 'front-flexible-spine-hinge';
    frontFlexibleHinge.position.set(
      flexibleHingeWidth / 2,
      0,
      coverThickness / 2 + 0.0018
    );
    frontFlexibleHinge.castShadow = true;
    frontSpineHingePivot.add(frontFlexibleHinge);

    this.frontSpineHingePivot = frontSpineHingePivot;
    this.frontCoverPivot = frontCoverPivot;
    this.bookGroup = group;
    this.scene.add(group);
    this.positionBookOnFloor();
    this.fitCameraToBook(false);
    this.targetBookRotation = undefined;
    this.idleRotationY = BOOK_MODEL_CONFIG.initialRotation.y;

    this.zone.run(() => {
      this.loading = false;
      this.fallback = false;
    });
  }

  private getTextureAspect(texture: ThreeTypes.Texture): number {
    const image = texture.image as {
      naturalWidth?: number;
      naturalHeight?: number;
      videoWidth?: number;
      videoHeight?: number;
      width?: number;
      height?: number;
    };
    const width = image?.naturalWidth || image?.videoWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.videoHeight || image?.height || 0;
    const ratio = width > 0 && height > 0 ? width / height : BOOK_MODEL_CONFIG.defaultAspect;
    return this.clamp(ratio, BOOK_MODEL_CONFIG.minAspect, BOOK_MODEL_CONFIG.maxAspect);
  }

  private resolveBookDepth(width: number): number {
    let depthRatio: number;
    if (Number.isFinite(this.pageCount) && Number(this.pageCount) > 0) {
      const normalizedPages = this.clamp(Number(this.pageCount), 80, 1000);
      depthRatio = 0.08 + (normalizedPages - 80) / 920 * 0.18;
    } else {
      const identity = String(this.productId ?? this.title ?? 'vinabook');
      let hash = 2166136261;
      for (let index = 0; index < identity.length; index++) {
        hash ^= identity.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      const normalizedSeed = (hash >>> 0) / 4294967295;
      depthRatio = 0.13 + normalizedSeed * 0.06;
    }

    return this.clamp(
      width * this.clamp(
        depthRatio,
        BOOK_MODEL_CONFIG.minDepthRatio,
        BOOK_MODEL_CONFIG.maxDepthRatio
      ),
      BOOK_MODEL_CONFIG.minDepth,
      BOOK_MODEL_CONFIG.maxDepth
    );
  }

  private createPageBlockGeometry(width: number, height: number, depth: number): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    if (this.roundedBoxGeometryClass) {
      return new this.roundedBoxGeometryClass(
        width,
        height,
        depth,
        2,
        BOOK_MODEL_CONFIG.pageCornerRadius
      );
    }
    return new THREE.BoxGeometry(width, height, depth, 1, 1, 1);
  }

  private createHorizontalPageGrooveGeometry(width: number, depth: number): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const separatorCount = Math.round(this.clamp(this.resolveVisiblePageSeparatorCount() * 1.45, 24, 36));
    const lastSeparatorIndex = Math.max(1, separatorCount - 1);
    // Fill the whole exposed surface in both directions. Insets at either the
    // fore edge or the cover edges read as artificial blank paper bands.
    const startX = -width / 2;
    const endX = width / 2;

    for (let index = 0; index < separatorCount; index++) {
      const isEdge = index === 0 || index === lastSeparatorIndex;
      const spacingJitter = isEdge
        ? 0
        : Math.sin(index * 1.91) * 0.16 + Math.sin(index * 0.73) * 0.07;
      const z = -depth / 2 + ((index + spacingJitter) / lastSeparatorIndex) * depth;
      positions.push(startX, 0, z, endX, 0, z);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }

  private createWarpedCoverFaceGeometry(
    width: number,
    height: number,
    warpAmount: number
  ): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    const geometry = new THREE.PlaneGeometry(width, height, 20, 24);
    const position = geometry.attributes.position as ThreeTypes.BufferAttribute;

    for (let index = 0; index < position.count; index++) {
      const normalizedX = position.getX(index) / (width / 2);
      const normalizedY = position.getY(index) / (height / 2);
      const openEdgeProgress = this.clamp((normalizedX + 0.35) / 1.35, 0, 1);
      const horizontalCurve = openEdgeProgress * openEdgeProgress * (3 - 2 * openEdgeProgress);
      const verticalFalloff = 0.7 + 0.3 * (1 - normalizedY * normalizedY);
      const materialVariation = Math.sin(normalizedY * Math.PI * 2.2) * 0.00032;
      position.setZ(
        index,
        warpAmount * horizontalCurve * verticalFalloff + materialVariation
      );
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private createPaperbackSpineGeometry(
    leftX: number,
    height: number,
    depth: number,
    bulge: number
  ): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    const depthSegments = 16;
    const heightSegments = 20;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let row = 0; row <= heightSegments; row++) {
      const v = row / heightSegments;
      const y = -height / 2 + v * height;
      for (let column = 0; column <= depthSegments; column++) {
        const u = column / depthSegments;
        const normalizedDepth = u * 2 - 1;
        const x = leftX - bulge * (1 - normalizedDepth * normalizedDepth);
        const z = -depth / 2 + u * depth;
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }

    const stride = depthSegments + 1;
    for (let row = 0; row < heightSegments; row++) {
      for (let column = 0; column < depthSegments; column++) {
        const a = row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private createPaperbackSpineCapGeometry(
    leftX: number,
    depth: number,
    bulge: number
  ): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    const segments = 16;
    const positions: number[] = [];
    const indices: number[] = [];
    const innerX = leftX + 0.012;

    for (let index = 0; index <= segments; index++) {
      const u = index / segments;
      const normalizedDepth = u * 2 - 1;
      const z = -depth / 2 + u * depth;
      positions.push(leftX - bulge * (1 - normalizedDepth * normalizedDepth), 0, z);
      positions.push(innerX, 0, z);
    }

    for (let index = 0; index < segments; index++) {
      const outer = index * 2;
      const inner = outer + 1;
      const nextOuter = outer + 2;
      const nextInner = outer + 3;
      indices.push(outer, inner, nextOuter, nextOuter, inner, nextInner);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private positionBookOnFloor(): void {
    const THREE = this.three;
    if (!THREE || !this.bookGroup) {
      return;
    }
    this.bookGroup.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.bookGroup);
    this.homeBookPositionY = this.bookGroup.position.y + this.floorY - bounds.min.y;
    this.bookGroup.position.y = this.homeBookPositionY;
    this.bookGroup.updateMatrixWorld(true);

    if (this.contactShadowMesh) {
      const groundedBounds = new THREE.Box3().setFromObject(this.bookGroup);
      const size = groundedBounds.getSize(new THREE.Vector3());
      const center = groundedBounds.getCenter(new THREE.Vector3());
      this.contactShadowMesh.position.set(center.x, this.floorY + 0.002, center.z + 0.015);
      this.contactShadowMesh.scale.set(
        Math.max(size.x * 0.94, 1.08),
        Math.max(size.z * 1.9, 0.68),
        1
      );
      this.contactShadowMesh.visible = true;
    }
  }

  private fitCameraToBook(animate: boolean): void {
    const THREE = this.three;
    if (!THREE || !this.bookGroup || !this.camera || !this.controls || !this.canvasHost?.nativeElement) {
      return;
    }

    this.bookGroup.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.bookGroup);
    const size = bounds.getSize(new THREE.Vector3());
    const bookCenter = bounds.getCenter(new THREE.Vector3());
    const rect = this.canvasHost.nativeElement.getBoundingClientRect();
    const aspect = Math.max(0.2, rect.width / Math.max(rect.height, 1));
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const verticalHalfSize = size.y / 2;
    const horizontalHalfSize = size.x / 2;
    const verticalDistance = verticalHalfSize / Math.tan(verticalFov / 2);
    const horizontalDistance = horizontalHalfSize / Math.tan(horizontalFov / 2);
    const mobilePadding = aspect < 0.82 ? BOOK_RENDER_CONFIG.mobileFitPadding : 1;
    const distance = Math.max(verticalDistance, horizontalDistance)
      * BOOK_RENDER_CONFIG.fitPadding
      * mobilePadding;
    const target = new THREE.Vector3(bookCenter.x, bookCenter.y - size.y * 0.045, bookCenter.z);
    const direction = new THREE.Vector3(
      BOOK_RENDER_CONFIG.cameraDirection.x,
      BOOK_RENDER_CONFIG.cameraDirection.y,
      BOOK_RENDER_CONFIG.cameraDirection.z
    ).normalize();
    const cameraPosition = target.clone().addScaledVector(direction, distance);

    this.homeCameraPosition = cameraPosition;
    this.homeControlTarget = target;
    this.controls.minDistance = distance * BOOK_MOTION_CONFIG.minDistanceFactor;
    this.controls.maxDistance = distance * BOOK_MOTION_CONFIG.maxDistanceFactor;

    if (animate && !this.reduceMotion) {
      this.targetCameraPosition = cameraPosition.clone();
      this.targetControlTarget = target.clone();
    } else {
      this.camera.position.copy(cameraPosition);
      this.controls.target.copy(target);
      this.targetCameraPosition = undefined;
      this.targetControlTarget = undefined;
      this.controls.update();
    }
    this.controls.saveState();
  }

  private createCurvedPageEdgeGeometry(depth: number, height: number): ThreeTypes.BufferGeometry {
    const THREE = this.three!;
    const geometry = new THREE.PlaneGeometry(depth, height, 24, 32);
    const position = geometry.attributes.position as ThreeTypes.BufferAttribute;

    for (let index = 0; index < position.count; index++) {
      const normalizedDepth = position.getX(index) / (depth / 2);
      const normalizedHeight = position.getY(index) / (height / 2);
      const bow = 1 - normalizedDepth * normalizedDepth;
      const unevenness = Math.sin(normalizedHeight * Math.PI * 9) * 0.0014;
      position.setZ(
        index,
        BOOK_MODEL_CONFIG.pageForeEdgeBow * bow + unevenness
      );
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private extractCoverPalette(texture: ThreeTypes.Texture): BookPalette {
    const fallback: BookPalette = {
      base: '#174838',
      dark: '#09271f',
      accent: '#d8ab55',
      ink: '#f4efdf'
    };

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 36;
      canvas.height = 52;
      const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
      if (!context || !texture.image) {
        return fallback;
      }

      const image = texture.image as CanvasImageSource & { width?: number; height?: number };
      const sourceWidth = Math.max(1, image.width || canvas.width);
      const sourceHeight = Math.max(1, image.height || canvas.height);
      const spineSampleWidth = Math.max(1, Math.round(sourceWidth * 0.12));
      context.drawImage(
        image,
        0,
        0,
        spineSampleWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      let totalWeight = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 180) {
          continue;
        }
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        if (brightness < 20 || brightness > 238) {
          continue;
        }
        const weight = 0.8 + (max - min) / 90;
        red += r * weight;
        green += g * weight;
        blue += b * weight;
        totalWeight += weight;
      }

      if (totalWeight < 8) {
        return fallback;
      }

      const sampled = {
        r: red / totalWeight,
        g: green / totalWeight,
        b: blue / totalWeight
      };
      const luminance = sampled.r * 0.2126 + sampled.g * 0.7152 + sampled.b * 0.0722;
      const targetLuminance = this.clamp(luminance, 52, 108);
      const scale = luminance > 0 ? targetLuminance / luminance : 1;
      const base = {
        r: this.clamp(sampled.r * scale, 18, 154),
        g: this.clamp(sampled.g * scale, 18, 154),
        b: this.clamp(sampled.b * scale, 18, 154)
      };
      const dark = this.mixRgb(base, { r: 8, g: 15, b: 13 }, 0.56);
      const accent = this.mixRgb(base, { r: 226, g: 180, b: 82 }, 0.66);

      return {
        base: this.rgbToHex(base),
        dark: this.rgbToHex(dark),
        accent: this.rgbToHex(accent),
        ink: '#f4efdf'
      };
    } catch {
      return fallback;
    }
  }

  private mixRgb(
    first: { r: number; g: number; b: number },
    second: { r: number; g: number; b: number },
    amount: number
  ): { r: number; g: number; b: number } {
    return {
      r: first.r + (second.r - first.r) * amount,
      g: first.g + (second.g - first.g) * amount,
      b: first.b + (second.b - first.b) * amount
    };
  }

  private rgbToHex(color: { r: number; g: number; b: number }): string {
    const channel = (value: number): string => Math.round(this.clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0');
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
  }

  private resolveVisiblePageSeparatorCount(): number {
    const suppliedPageCount = Number(this.pageCount);
    const pageCount = Number.isFinite(suppliedPageCount) && suppliedPageCount > 0
      ? suppliedPageCount
      : 320;

    // Rendering every sheet aliases into a flat colour once the edge becomes
    // narrow on screen. These separators represent bound page signatures,
    // which remain legible while the finer paper relief comes from bump maps.
    return Math.round(this.clamp(pageCount / 18, 14, 28));
  }

  private createPaperSurfaceTexture(
    orientation: 'top' | 'bottom',
    kind: 'color' | 'bump' | 'roughness'
  ): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 192;
    const context = canvas.getContext('2d')!;

    if (kind === 'color') {
      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height * 0.22);
      gradient.addColorStop(0, orientation === 'bottom' ? '#ddd5c8' : '#e8e1d6');
      gradient.addColorStop(0.2, orientation === 'bottom' ? '#e9e3d8' : '#f0ebe2');
      gradient.addColorStop(0.56, orientation === 'bottom' ? '#f0ebe2' : '#f7f3eb');
      gradient.addColorStop(0.82, orientation === 'bottom' ? '#e6ded1' : '#eee7dc');
      gradient.addColorStop(1, orientation === 'bottom' ? '#d8cebf' : '#e1d7c8');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Sparse fibre flecks are confined to the paper texture. Their low
      // opacity breaks the synthetic flatness without reading as dirt.
      for (let index = 0; index < 180; index++) {
        const x = (index * 83 + (index % 7) * 11) % canvas.width;
        const y = (index * 137 + (index % 13) * 5) % canvas.height;
        const alpha = 0.012 + (index % 4) * 0.004;
        context.fillStyle = `rgba(92, 78, 59, ${alpha.toFixed(3)})`;
        context.fillRect(x, y, index % 5 === 0 ? 2 : 1, 1);
      }
    } else {
      const baseValue = kind === 'bump' ? 128 : 230;
      context.fillStyle = `rgb(${baseValue}, ${baseValue}, ${baseValue})`;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Broad low-frequency bands add barely visible paper relief while the
      // real line geometry remains responsible for individual sheet edges.
      for (let band = 0; band < 14; band++) {
        const y = ((band + 0.5 + Math.sin(band * 1.37) * 0.18) / 14) * canvas.height;
        const variation = kind === 'bump'
          ? 126 + (band % 4) * 2
          : 222 + (band % 5) * 3;
        context.strokeStyle = `rgba(${variation}, ${variation}, ${variation}, ${kind === 'bump' ? 0.24 : 0.2})`;
        context.lineWidth = band % 4 === 0 ? 2 : 1;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.prepareTexture(texture);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createPageEdgeTexture(orientation: 'fore' | 'top' | 'bottom'): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    const isFore = orientation === 'fore';
    canvas.width = isFore ? 512 : 1024;
    canvas.height = isFore ? 1024 : 320;
    const context = canvas.getContext('2d')!;

    const paper = context.createLinearGradient(0, 0, isFore ? canvas.width : 0, isFore ? 0 : canvas.height);
    paper.addColorStop(0, orientation === 'bottom' ? '#ded6c8' : '#e6dfd3');
    paper.addColorStop(0.12, '#eee9df');
    paper.addColorStop(0.5, '#f5f1e8');
    paper.addColorStop(0.88, '#ece5d9');
    paper.addColorStop(1, '#d8cfbf');
    context.fillStyle = paper;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!isFore) {
      const spineShade = context.createLinearGradient(0, 0, canvas.width * 0.2, 0);
      spineShade.addColorStop(0, 'rgba(72, 58, 42, 0.2)');
      spineShade.addColorStop(0.42, 'rgba(112, 91, 64, 0.08)');
      spineShade.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = spineShade;
      context.fillRect(0, 0, canvas.width * 0.2, canvas.height);
    }

    const lineCount = this.resolveVisiblePageSeparatorCount();
    const spacing = canvas.width / lineCount;
    for (let line = 0; line < lineCount; line++) {
      // Use full-height vertical separators on every exposed paper face.
      // Keeping one direction across colour, bump and roughness prevents
      // perspective from turning small procedural marks into diagonal dashes.
      const spacingJitter = Math.sin(line * 1.73) * 0.16 + Math.sin(line * 0.47) * 0.07;
      const position = (line + 0.5 + spacingJitter) * spacing;
      const alpha = 0.17 + ((Math.sin(line * 0.91) + 1) * 0.025);
      context.strokeStyle = `rgba(86, 74, 58, ${alpha.toFixed(3)})`;
      context.lineWidth = isFore
        ? (line % 7 === 0 ? 1.7 : 1)
        : (line % 7 === 0 ? 3.6 : 2.1);
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
      context.stroke();
    }

    for (let index = 0; index < 360; index++) {
      const x = (index * 83 + (index % 9) * 7) % canvas.width;
      const y = (index * 197 + (index % 11) * 13) % canvas.height;
      const alpha = 0.012 + (index % 5) * 0.003;
      context.fillStyle = `rgba(88, 74, 57, ${alpha.toFixed(3)})`;
      context.fillRect(x, y, index % 8 === 0 ? 2 : 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.prepareTexture(texture);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createPageBumpTexture(orientation: 'fore' | 'top' | 'bottom'): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    const isFore = orientation === 'fore';
    canvas.width = isFore ? 512 : 1024;
    canvas.height = isFore ? 1024 : 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#808080';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const lineCount = this.resolveVisiblePageSeparatorCount();
    const spacing = canvas.width / lineCount;
    for (let line = 0; line < lineCount; line++) {
      const spacingJitter = Math.sin(line * 1.73) * 0.16 + Math.sin(line * 0.47) * 0.07;
      const position = (line + 0.5 + spacingJitter) * spacing;
      const value = 118 + ((line * 13) % 18);
      context.strokeStyle = `rgba(${value}, ${value}, ${value}, 0.36)`;
      context.lineWidth = isFore
        ? (line % 7 === 0 ? 1.55 : 0.9)
        : (line % 7 === 0 ? 3.3 : 1.9);
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
      context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.generatedTextures.push(texture);
    return texture;
  }

  private createPageRoughnessTexture(orientation: 'fore' | 'top' | 'bottom'): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    const isFore = orientation === 'fore';
    canvas.width = isFore ? 512 : 1024;
    canvas.height = isFore ? 1024 : 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = orientation === 'bottom' ? '#dedede' : '#e7e7e7';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const lineCount = this.resolveVisiblePageSeparatorCount();
    const spacing = canvas.width / lineCount;
    for (let line = 0; line < lineCount; line++) {
      const spacingJitter = Math.sin(line * 1.73) * 0.16 + Math.sin(line * 0.47) * 0.07;
      const position = (line + 0.5 + spacingJitter) * spacing;
      const value = 194 + ((line * 17) % 24);
      context.strokeStyle = `rgb(${value}, ${value}, ${value})`;
      context.lineWidth = isFore
        ? (line % 7 === 0 ? 1.35 : 0.8)
        : (line % 7 === 0 ? 2.9 : 1.65);
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, canvas.height);
      context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.generatedTextures.push(texture);
    return texture;
  }

  private createContactShadowTexture(): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 140;
    const context = canvas.getContext('2d')!;
    context.save();
    context.scale(3, 1);
    const gradient = context.createRadialGradient(70, 70, 2, 70, 70, 68);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    gradient.addColorStop(0.13, 'rgba(0, 0, 0, 0.58)');
    gradient.addColorStop(0.38, 'rgba(0, 0, 0, 0.28)');
    gradient.addColorStop(0.73, 'rgba(0, 0, 0, 0.075)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 140, 140);
    context.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    this.sceneTextures.push(texture);
    return texture;
  }

  private createCoverGrainTexture(kind: 'bump' | 'roughness'): ThreeTypes.Texture {
    const THREE = this.three!;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;

    context.fillStyle = kind === 'bump' ? '#808080' : '#e0e0e0';
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < canvas.height; y += 2) {
      const value = kind === 'bump'
        ? 124 + Math.round((Math.sin(y * 0.51) + 1) * 3)
        : 216 + Math.round((Math.sin(y * 0.51) + 1) * 8);
      context.fillStyle = `rgb(${value}, ${value}, ${value})`;
      context.fillRect(0, y, canvas.width, 1);
    }

    for (let index = 0; index < 1300; index++) {
      const x = (index * 73) % canvas.width;
      const y = (index * 151) % canvas.height;
      const value = kind === 'bump'
        ? 118 + ((index * 17) % 20)
        : 208 + ((index * 17) % 32);
      context.fillStyle = `rgba(${value}, ${value}, ${value}, 0.24)`;
      context.fillRect(x, y, 1, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, 3.5);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createBackTexture(
    title: string,
    author: string,
    description: string,
    category: string,
    publisher: string,
    productId: number | string | null,
    palette: BookPalette
  ): ThreeTypes.Texture {
    const THREE = this.three!;
    const textureScale = 1.5;
    const logicalWidth = 720;
    const logicalHeight = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = logicalWidth * textureScale;
    canvas.height = logicalHeight * textureScale;
    const context = canvas.getContext('2d')!;
    context.scale(textureScale, textureScale);
    const safeTitle = this.normalizeBookText(title);
    const safeAuthor = this.normalizeBookText(author);
    const safeDescription = this.normalizeBookText(description);
    const safeCategory = this.normalizeBookText(category);
    const safePublisher = this.normalizeBookText(publisher);
    const background = context.createLinearGradient(0, 0, logicalWidth, logicalHeight);
    background.addColorStop(0, palette.base);
    background.addColorStop(0.58, palette.dark);
    background.addColorStop(1, '#08110f');
    context.fillStyle = background;
    context.fillRect(0, 0, logicalWidth, logicalHeight);

    const vignette = context.createRadialGradient(360, 430, 70, 360, 430, 650);
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, logicalWidth, logicalHeight);

    context.strokeStyle = palette.accent;
    context.globalAlpha = 0.62;
    context.lineWidth = 3;
    context.strokeRect(40, 40, logicalWidth - 80, logicalHeight - 80);
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    context.lineWidth = 1;
    context.strokeRect(55, 55, logicalWidth - 110, logicalHeight - 110);

    context.textAlign = 'center';
    if (safeDescription) {
      context.fillStyle = palette.accent;
      context.font = `700 24px ${this.canvasFontFamily}`;
      context.fillText('GIỚI THIỆU SÁCH', logicalWidth / 2, 126);
    }

    if (safeTitle) {
      context.fillStyle = palette.ink;
      context.font = `700 42px ${this.canvasFontFamily}`;
      this.drawWrappedText(context, safeTitle, logicalWidth / 2, 198, 536, 52, 3);
    }

    if (safeAuthor) {
      context.fillStyle = 'rgba(244, 239, 223, 0.76)';
      context.font = `600 23px ${this.canvasFontFamily}`;
      context.fillText(safeAuthor, logicalWidth / 2, 370, 520);
    }

    context.strokeStyle = palette.accent;
    context.globalAlpha = 0.52;
    context.beginPath();
    context.moveTo(280, 416);
    context.lineTo(440, 416);
    context.stroke();
    context.globalAlpha = 1;

    if (safeDescription) {
      context.fillStyle = 'rgba(244, 239, 223, 0.76)';
      context.font = `500 22px ${this.canvasFontFamily}`;
      this.drawWrappedText(
        context,
        safeDescription,
        logicalWidth / 2,
        468,
        500,
        34,
        10
      );
    }

    const metadata = [
      safeCategory ? `Thể loại: ${safeCategory}` : '',
      safePublisher ? `Nhà xuất bản: ${safePublisher}` : '',
      productId !== null && productId !== undefined && String(productId).trim()
        ? `Mã sản phẩm: ${String(productId).trim()}`
        : ''
    ].filter(Boolean);
    if (metadata.length) {
      context.fillStyle = palette.accent;
      context.font = `600 18px ${this.canvasFontFamily}`;
      metadata.slice(0, 3).forEach((value, index) => {
        context.fillText(value, logicalWidth / 2, 900 + index * 24, 560);
      });
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.prepareTexture(texture);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createSpineTexture(title: string, author: string, palette: BookPalette): ThreeTypes.Texture {
    const THREE = this.three!;
    const textureScale = 1.5;
    const logicalWidth = 320;
    const logicalHeight = 1400;
    const canvas = document.createElement('canvas');
    canvas.width = logicalWidth * textureScale;
    canvas.height = logicalHeight * textureScale;
    const context = canvas.getContext('2d')!;
    context.scale(textureScale, textureScale);
    const background = context.createLinearGradient(0, 0, logicalWidth, 0);
    background.addColorStop(0, palette.dark);
    background.addColorStop(0.2, palette.base);
    background.addColorStop(0.5, palette.base);
    background.addColorStop(0.8, palette.base);
    background.addColorStop(1, palette.dark);
    context.fillStyle = background;
    context.fillRect(0, 0, logicalWidth, logicalHeight);
    context.fillStyle = 'rgba(255, 248, 232, 0.055)';
    context.fillRect(0, 0, logicalWidth, logicalHeight);
    context.strokeStyle = palette.accent;
    context.globalAlpha = 0.24;
    context.lineWidth = 1.5;
    context.strokeRect(15, 18, logicalWidth - 30, logicalHeight - 36);
    context.globalAlpha = 1;

    const safeTitle = this.normalizeBookText(title);
    if (safeTitle) {
      const titleFit = this.fitCanvasLabel(context, safeTitle, 980, 32, 56, this.canvasFontFamily, 700);
      context.save();
      context.translate(logicalWidth / 2 - 18, logicalHeight / 2);
      context.rotate(-Math.PI / 2);
      context.fillStyle = palette.ink;
      context.font = `700 ${titleFit.fontSize}px ${this.canvasFontFamily}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(titleFit.label, 0, 0);
      context.restore();
    }

    const safeAuthor = this.normalizeBookText(author);
    if (safeAuthor) {
      const authorFit = this.fitCanvasLabel(context, safeAuthor, 720, 20, 29, this.canvasFontFamily, 600);
      context.save();
      context.translate(logicalWidth / 2 + 55, logicalHeight / 2);
      context.rotate(-Math.PI / 2);
      context.fillStyle = 'rgba(244, 239, 223, 0.68)';
      context.font = `600 ${authorFit.fontSize}px ${this.canvasFontFamily}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(authorFit.label, 0, 0);
      context.restore();
    }

    const safePublisher = this.normalizeBookText(this.publisher);
    if (safePublisher) {
      const publisherFit = this.fitCanvasLabel(
        context,
        safePublisher,
        logicalWidth - 48,
        16,
        22,
        this.canvasFontFamily,
        600
      );
      context.fillStyle = palette.accent;
      context.font = `600 ${publisherFit.fontSize}px ${this.canvasFontFamily}`;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      context.fillText(publisherFit.label, logicalWidth / 2, 1330);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.prepareTexture(texture);
    this.generatedTextures.push(texture);
    return texture;
  }

  private fitCanvasLabel(
    context: CanvasRenderingContext2D,
    value: string,
    maxWidth: number,
    minimumFontSize: number,
    maximumFontSize: number,
    fontFamily: string,
    fontWeight: number
  ): { label: string; fontSize: number } {
    let fontSize = maximumFontSize;
    let label = value;
    const applyFont = (): void => {
      context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    };
    applyFont();

    while (fontSize > minimumFontSize && context.measureText(label).width > maxWidth) {
      fontSize -= 2;
      applyFont();
    }

    if (context.measureText(label).width > maxWidth) {
      while (label.length > 2 && context.measureText(`${label}...`).width > maxWidth) {
        label = label.slice(0, -1).replace(/\s+$/, '');
      }
      label = `${label}...`;
    }

    return { label, fontSize };
  }

  private normalizeBookText(value: string): string {
    const source = (value || '').trim();
    if (!source) {
      return '';
    }

    const decoder = document.createElement('textarea');
    decoder.innerHTML = source.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ');
    return decoder.value.normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  private drawWrappedText(
    context: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number
  ): void {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let line = '';

    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) {
      lines.push(line);
    }

    lines.slice(0, maxLines).forEach((value, index) => {
      const isTruncated = index === maxLines - 1 && lines.length > maxLines;
      let visibleValue = value;
      if (isTruncated) {
        while (visibleValue.length > 2 && context.measureText(`${visibleValue}...`).width > maxWidth) {
          visibleValue = visibleValue.slice(0, -1).replace(/\s+$/, '');
        }
        visibleValue = `${visibleValue}...`;
      }
      context.fillText(visibleValue, centerX, startY + index * lineHeight, maxWidth);
    });
  }

  private renderLoop = (now: number): void => {
    if (this.paused || this.destroyed || !this.renderer || !this.scene || !this.camera) {
      return;
    }

    const deltaSeconds = Math.min((now - this.lastFrameAt) / 1000, 0.05);
    this.lastFrameAt = now;

    if (this.targetCameraPosition && this.targetControlTarget && this.controls) {
      const resetSmoothing = 1 - Math.exp(-deltaSeconds * BOOK_MOTION_CONFIG.resetSmoothing);
      this.camera.position.lerp(this.targetCameraPosition, resetSmoothing);
      this.controls.target.lerp(this.targetControlTarget, resetSmoothing);

      if (
        this.camera.position.distanceTo(this.targetCameraPosition) < 0.002
        && this.controls.target.distanceTo(this.targetControlTarget) < 0.002
      ) {
        this.camera.position.copy(this.targetCameraPosition);
        this.controls.target.copy(this.targetControlTarget);
        this.targetCameraPosition = undefined;
        this.targetControlTarget = undefined;
      }
    }

    this.controls?.update();

    if (this.bookGroup && !this.reduceMotion && !this.bookOpen) {
      if (this.targetBookRotation) {
        const smoothing = 1 - Math.exp(-deltaSeconds * BOOK_MOTION_CONFIG.resetSmoothing);
        this.bookGroup.rotation.x += (this.targetBookRotation.x - this.bookGroup.rotation.x) * smoothing;
        this.bookGroup.rotation.y += (this.targetBookRotation.y - this.bookGroup.rotation.y) * smoothing;
        this.bookGroup.rotation.z += (this.targetBookRotation.z - this.bookGroup.rotation.z) * smoothing;
        this.bookGroup.position.y += (this.homeBookPositionY - this.bookGroup.position.y) * smoothing;

        if (
          Math.abs(this.targetBookRotation.x - this.bookGroup.rotation.x) < 0.002
          && Math.abs(this.targetBookRotation.y - this.bookGroup.rotation.y) < 0.002
        ) {
          this.bookGroup.rotation.set(
            this.targetBookRotation.x,
            this.targetBookRotation.y,
            this.targetBookRotation.z
          );
          this.idleRotationY = this.targetBookRotation.y;
          this.targetBookRotation = undefined;
        }
      }

      const idleFor = now - this.lastInteractionAt;
      if (!this.interacting && !this.targetBookRotation && idleFor > BOOK_MOTION_CONFIG.idleDelayMs) {
        this.bookGroup.rotation.y = this.idleRotationY
          + Math.sin(now * 0.00034) * BOOK_MOTION_CONFIG.idleYawAmount;
        this.bookGroup.rotation.x = BOOK_MODEL_CONFIG.initialRotation.x + Math.sin(now * 0.00027) * 0.006;
        this.bookGroup.position.y = this.homeBookPositionY
          + Math.sin(now * 0.00058) * BOOK_MOTION_CONFIG.idleFloatAmount;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private disposeBook(disposeTextures = true): void {
    this.openTimeline?.kill();
    this.openTimeline = undefined;
    this.bookOpen = false;
    this.frontSpineHingePivot = undefined;
    this.frontCoverPivot = undefined;
    if (this.controls) {
      this.controls.enabled = true;
    }
    if (this.bookGroup) {
      this.scene?.remove(this.bookGroup);
      this.disposeObject(this.bookGroup);
      this.bookGroup = undefined;
    }
    if (this.contactShadowMesh) {
      this.contactShadowMesh.visible = false;
    }

    this.generatedTextures.forEach(texture => texture.dispose());
    this.generatedTextures = [];

    if (disposeTextures) {
      this.coverTexture?.dispose();
      this.backTexture?.dispose();
      this.spineTexture?.dispose();
      this.coverTexture = undefined;
      this.backTexture = undefined;
      this.spineTexture = undefined;
    }
  }

  private disposeSceneObjects(): void {
    if (!this.scene) {
      return;
    }
    this.disposeObject(this.scene);
    this.scene.clear();
    this.contactShadowMesh = undefined;
  }

  private disposeObject(root: ThreeTypes.Object3D): void {
    const geometries = new Set<ThreeTypes.BufferGeometry>();
    const materials = new Set<ThreeTypes.Material>();

    root.traverse(object => {
      const mesh = object as ThreeTypes.Mesh;
      if (mesh.geometry) {
        geometries.add(mesh.geometry);
      }
      if (mesh.material) {
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        meshMaterials.forEach(material => materials.add(material));
      }
    });

    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  }

  private showFallback(): void {
    this.zone.run(() => {
      this.loading = false;
      this.fallback = true;
    });
  }

  private isWebGlAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext
        && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
      );
    } catch {
      return false;
    }
  }
}
