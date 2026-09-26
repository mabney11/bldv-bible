/**
 * cityExtras.js — what only the city's model needs (ezekiel-city.js, MODEL.scene.extras: 'city'): the day and the night over
 * it (sky.js) — a still mid-morning in the stories, day or night on foot as the reader asks — and the names written over the
 * land: each gate's tribe over its gate, and in the Portion story the strips' owners over the strips and the house's name over
 * the house, so that the picture from above reads without the card.
 */
import * as THREE from 'three';
import { makeSky, labelTexture } from './sky.js';
import { CITY, GATES, STRIP, TRIBES_N, TRIBES_S, TRIBE_H, HOUSE_AT, PRINCE, RIVER_Z } from '../../lib/models/ezekiel-city.js';

const GATE_AT = [-1500, 0, 1500];

export function cityExtras({ lights, sky, scene }) {
  const { sunOffset, daylight } = makeSky({ scene, lights, sky, reach: 60 });
  let wantNight = false;
  const mk = (text, color, x, y, z, big) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthWrite: false, depthTest: false }));
    sp.position.set(x, y, z); sp.userData.size = big; sp.renderOrder = 998; return sp;
  };
  // the gates' names, over each gate (always)
  const gateNames = new THREE.Group(); scene.add(gateNames);
  const o = CITY.half + CITY.wallT;
  for (const side of ['north', 'east', 'south', 'west']) GATES[side].forEach(([name], i) => {
    const at = GATE_AT[i], [x, z] = side === 'north' ? [at, -o + 25] : side === 'south' ? [at, o - 25] : side === 'east' ? [o - 25, at] : [-o + 25, at];
    gateNames.add(mk(name, '#ffe08a', x, 70, z, 120));
  });
  // the land's owners, over the strips (the Portion story)
  const landNames = new THREE.Group(); landNames.visible = false; scene.add(landNames);
  landNames.add(mk('kahanayam', '#f3e6c4', 0, 600, (STRIP.priests[0] + STRIP.priests[1]) / 2 + 3000, 5000));
  landNames.add(mk('bayath', '#ffe08a', HOUSE_AT[0], 500, HOUSE_AT[2] - 900, 2200));
  landNames.add(mk('Lawayay', '#f3e6c4', 0, 600, (STRIP.levites[0] + STRIP.levites[1]) / 2, 5000));
  landNames.add(mk('iyar', '#ffe08a', 0, 500, 0, 2600));
  landNames.add(mk('nashayaa', '#e8dcc6', (PRINCE.x0 + PRINCE.x1) / 2, 600, -10000, 5000));
  landNames.add(mk('nashayaa', '#e8dcc6', -(PRINCE.x0 + PRINCE.x1) / 2, 600, -10000, 5000));
  landNames.add(mk('nachal', '#9fd0ea', HOUSE_AT[0] + 6000, 400, RIVER_Z - 900, 2400));
  TRIBES_N.forEach((name, i) => landNames.add(mk(name, '#e6f0d6', 0, 700, STRIP.priests[0] - (6.5 - i) * TRIBE_H, 6500)));
  TRIBES_S.forEach((name, i) => landNames.add(mk(name, '#e6f0d6', 0, 700, STRIP.city[1] + (i + 0.5) * TRIBE_H, 6500)));
  function size(group, k) { for (const sp of group.children) { const s = sp.userData.size * k; sp.scale.set(s, s / 4, 1); sp.material.opacity = Math.min(1, k * 1.2); } }
  return {
    sunOffset,
    place() { return 0; },
    set({ time }) { if (time) wantNight = time === 'night'; },
    after(mode) {
      daylight(mode === 'roam' && wantNight ? 0.0 : 0.42);
      const portion = mode === 'portion';
      landNames.visible = portion; if (portion) size(landNames, 1);
      gateNames.visible = true; size(gateNames, mode === 'roam' ? 0.5 : 1);
    },
  };
}
