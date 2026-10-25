export interface BookPalette {
  base: string;
  dark: string;
  accent: string;
  ink: string;
}

export const BOOK_MODEL_CONFIG = {
  type: 'paperback' as 'paperback' | 'hardcover',
  height: 3.38,
  defaultAspect: 0.7,
  minAspect: 0.58,
  maxAspect: 0.82,
  minDepthRatio: 0.08,
  maxDepthRatio: 0.26,
  minDepth: 0.24,
  maxDepth: 0.58,
  coverThicknessRatio: 0.0042,
  coverOverhangRatio: 0.0024,
  technicalGap: 0.0025,
  coverBevel: 0.0015,
  coverWarpRatio: 0.0032,
  backCoverWarpFactor: 0.58,
  pageCornerRadius: 0.006,
  pageForeEdgeBow: 0.007,
  spineBulgeRatio: 0.02,
  hingeWidth: 0.004,
  initialRotation: { x: -0.055, y: -0.32, z: -0.006 }
};

export const BOOK_MATERIAL_CONFIG = {
  cover: {
    roughness: 0.79,
    clearcoat: 0.08,
    clearcoatRoughness: 0.78,
    bumpScale: 0.0015,
    envMapIntensity: 0.22
  },
  coverEdge: {
    roughness: 0.84,
    clearcoat: 0,
    clearcoatRoughness: 1,
    envMapIntensity: 0.24
  },
  spine: {
    roughness: 0.84,
    clearcoat: 0.04,
    clearcoatRoughness: 0.86,
    bumpScale: 0.0014,
    envMapIntensity: 0.22
  },
  paper: {
    roughness: 0.96,
    bumpScale: 0.0038,
    envMapIntensity: 0.11
  }
};

export const BOOK_RENDER_CONFIG = {
  desktopFov: 30,
  narrowFov: 34,
  fitPadding: 1.265,
  mobileFitPadding: 1.025,
  cameraDirection: { x: 0, y: 0.018, z: 1 },
  pixelRatioLimit: 1.75,
  toneMappingExposure: 0.88,
  textureAnisotropyLimit: 8,
  shadowMapSize: 1536
};

export const BOOK_MOTION_CONFIG = {
  dampingFactor: 0.075,
  rotateSpeed: 0.62,
  zoomSpeed: 0.54,
  minDistanceFactor: 0.64,
  maxDistanceFactor: 1.52,
  minPolarAngle: 1.02,
  maxPolarAngle: 2.04,
  resetSmoothing: 8.5,
  idleDelayMs: 3200,
  idleYawAmount: 0.045,
  idleFloatAmount: 0
};
