/**
 * revelationExtras.js — what only the city of the Revelation needs (revelation-city.js, MODEL.scene.extras: 'revelation'):
 * the city coming down out of heaven in the Descend story (the whole city's groups lowered together from far above the
 * earth to the ground, 21:2, 10), the light that is not the sun's (21:23; 22:5 — one still light, no day and no night, the
 * throne's glory breathing), and the names over the gates.
 */
import * as THREE from 'three';
import { labelTexture } from './sky.js';
import { CITY_IDS, descentAt, SIDE, GATES, HALF, WALL, GATE_AT } from '../../lib/models/revelation-city.js';

const DROP = SIDE * 1.15;   // how far above the earth the city starts its descent

export function revelationExtras({ M, byId, lights, scene }) {
  const { sun, hemi } = lights;
  const sunOffset = new THREE.Vector3(160, 420, 120);   // the light from high overhead: no sun to rise or set
  sun.color.set('#fff3dc'); hemi.color?.set?.('#fff6e6');
  const mk = (text, color, x, y, z, big) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false, depthTest: false }));
    sp.position.set(x, y, z); sp.userData.size = big; sp.renderOrder = 998; return sp;
  };
  // the gates' names, over each pearl
  const gateNames = new THREE.Group(); scene.add(gateNames);
  const o = HALF + WALL.t / 2;
  for (const side of ['north', 'east', 'south', 'west']) GATES[side].forEach(([name], i) => {
    const at = GATE_AT[i], [x, z] = side === 'north' ? [at, -o] : side === 'south' ? [at, o] : side === 'east' ? [o, at] : [-o, at];
    gateNames.add(mk(name, '#fff0c0', x, 196, z, 110));
  });
  for (const sp of gateNames.children) { const s = sp.userData.size; sp.scale.set(s, s / 4, 1); }
  let glow = null;
  M.goldglass.fog = false; M.goldglass.needsUpdate = true;   // the body of gold seen from its foot: not greyed by the distance to its far corners
  return {
    sunOffset,
    place() { return 0; },
    after(mode, t) {
      const d = descentAt(mode, t), y = DROP * d;
      for (const id of CITY_IDS) { const g = byId(id); if (g) g.position.y = (g.userData.base || 0) + y; }   // each group is hoisted to its own base (buildPiece), the descent on top of that
      gateNames.position.y = y;
      // the throne's glory breathes a little
      if (!glow) { const g = byId('kasaa'); if (g) g.traverse((m) => { if (m.isMesh && m.material?.emissive && !glow) glow = m.material; }); }
      if (glow) glow.emissiveIntensity = 1.1 + 0.25 * Math.sin(t * 1.3);
    },
  };
}
