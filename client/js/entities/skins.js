// Забавные облики для игроков и существ (утка, куб, банан) — по команде хоста
import * as THREE from 'three';

const lam = (color, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive });

// Модель высотой ~ростом человека; ноги на y=0
export function makeSkin(kind, color = 0xffd23a) {
  const g = new THREE.Group();
  if (kind === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), lam(0xffd23a, 0x221a00)); body.scale.set(1, 0.8, 1.3); body.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), lam(0xffd23a, 0x221a00)); head.position.set(0, 1.25, 0.45);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 10), lam(0xff7a1a)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.2, 0.85);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x111111 })); eyes.position.set(0, 1.35, 0.7);
    g.add(body, head, beak, eyes);
  } else if (kind === 'cube') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), lam(color, 0x111111)); b.position.y = 0.55;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 })); face.position.set(0, 0.7, 0.56);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff })); mouth.position.set(0, 0.55, 0.57);
    g.add(b, face, mouth);
  } else if (kind === 'banana') {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.6, 1.0, 0), new THREE.Vector3(0, 1.9, 0));
    const b = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.22, 10), lam(0xffe14a, 0x221a00));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 8), lam(0x4a3a10)); tip.position.set(0, 1.95, 0);
    g.add(b, tip);
  }
  return g;
}
