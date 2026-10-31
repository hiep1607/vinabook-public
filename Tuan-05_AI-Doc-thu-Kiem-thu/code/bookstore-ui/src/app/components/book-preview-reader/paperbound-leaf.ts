import * as THREE from 'three';
import { sheetCurve } from './paperbound-math';

// Paperbound app.js createLeaf/updateLeaf, extracted into an owned reusable mesh.
// Back-face UVs and winding are reversed independently, so printed text is not mirrored.
export class PaperboundLeaf {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, Array<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>>;
  private cols = 48;
  private rows = 6;
  constructor(private width: number, private height: number, blank: THREE.Texture) {
    const cols = this.cols, rows = this.rows, count = (cols + 1) * (rows + 1);
    const geometry = new THREE.BufferGeometry(), uv = new Float32Array(count * 4), indices: number[] = [];
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j <= rows; j++) {
        for (let k = 0; k <= cols; k++) {
          const n = side * count + j * (cols + 1) + k;
          uv[n * 2] = side ? 1 - k / cols : k / cols; uv[n * 2 + 1] = 1 - j / rows;
        }
      }
      const start = indices.length;
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < cols; k++) {
          const a = side * count + j * (cols + 1) + k, b = a + 1, c = a + cols + 1, d = c + 1;
          indices.push(...(side ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
        }
      }
      geometry.addGroup(start, indices.length - start, side);
    }
    const edgeStart = indices.length;
    for (let j = 0; j < rows; j++) {
      const a = j * (cols + 1) + cols, b = a + cols + 1;
      indices.push(a, b, a + count, b, b + count, a + count);
    }
    geometry.addGroup(edgeStart, indices.length - edgeStart, 2);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial({ map: blank, toneMapped: false }),
      new THREE.MeshBasicMaterial({ map: blank, toneMapped: false }),
      new THREE.MeshStandardMaterial({ color: 0xd5caba, roughness: 1 })
    ]);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
  }
  textures(front: THREE.Texture, back: THREE.Texture): void {
    this.mesh.material[0].map = front; this.mesh.material[1].map = back;
  }
  update(p: number, base: number, corner = 0): void {
    const curve = sheetCurve(p, this.width, this.cols, corner);
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const count = (this.cols + 1) * (this.rows + 1), motion = Math.sin(Math.PI * p);
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j <= this.rows; j++) {
        for (let k = 0; k <= this.cols; k++) {
          const u = k / this.cols, v = j / this.rows, n = side * count + j * (this.cols + 1) + k;
          // Offset along the strip normal (not world Y) to keep both faces apart even at 90 degrees.
          const a = curve[Math.max(0, k - 1)], b = curve[Math.min(this.cols, k + 1)];
          const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
          const thickness = side ? -.0015 : .0015;
          pos.setXYZ(n, curve[k][0] - dy / length * thickness,
            base + curve[k][1] + dx / length * thickness +
            motion * corner * .12 * u * u * (v - .5) +
            motion * .016 * Math.sin(u * 6 + v * 3) * u,
            (v - .5) * this.height + motion * .023 * Math.sin(u * Math.PI) * (v - .5));
        }
      }
    }
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
  }
}
