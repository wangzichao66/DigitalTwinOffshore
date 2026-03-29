import * as THREE from 'three';
import type { HazardState, RuntimeState } from '../core/types';

const OIL_COUNT = 5000;

export class SpillSimulation {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly geometry: THREE.BufferGeometry;

  private readonly positions: Float32Array;

  private readonly colors: Float32Array;

  private readonly ages: Float32Array;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(OIL_COUNT * 3);
    this.colors = new Float32Array(OIL_COUNT * 3);
    this.ages = new Float32Array(OIL_COUNT);
    this.seedParticles();

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 18,        // Large enough to see from any camera angle
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.points = new THREE.Points(this.geometry, material);
    scene.add(this.points);
  }

  reset(): void {
    this.seedParticles();
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  update(deltaSeconds: number, state: RuntimeState): Pick<HazardState, 'oilRadius' | 'oilArea' | 'oilCenter'> {
    let maxRadiusSq = 0;
    let sumX = 0;
    let sumZ = 0;

    for (let index = 0; index < OIL_COUNT; index += 1) {
      const ix = index * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      const windFactor = 1 + Math.min(state.incident.leakRate / 240, 0.7);

      this.ages[index] += deltaSeconds * 60;
      this.positions[ix] +=
        state.environment.windX * 9 * windFactor +
        state.environment.currentX * 6 +
        (Math.random() - 0.5) * 0.16;
      this.positions[iz] +=
        state.environment.windZ * 9 * windFactor +
        state.environment.currentZ * 6 +
        (Math.random() - 0.5) * 0.16;
      // Stay well above wave peaks (amplitude ~1.6m max) to prevent sea surface occlusion
      this.positions[iy] = 2.2 + Math.sin(this.ages[index] * 0.035) * state.environment.waveHeight * 0.22;

      const ageFraction = Math.min(this.ages[index] / 1200, 1);
      // Real crude oil is dark black/dark-brown on water - clearly contrasts with blue ocean
      if (ageFraction < 0.25) {
        // Fresh spill: very dark brownish-black
        this.colors[ix] = 0.05;
        this.colors[iy] = 0.04;
        this.colors[iz] = 0.03;
      } else if (ageFraction < 0.6) {
        // Spreading: slightly lighter oil sheen, dark olive-brown
        this.colors[ix] = 0.12 + ageFraction * 0.08;
        this.colors[iy] = 0.08 + ageFraction * 0.05;
        this.colors[iz] = 0.04 + ageFraction * 0.03;
      } else {
        // Old weathered oil: silvery-grey
        const w = 0.22 + ageFraction * 0.14;
        this.colors[ix] = w;
        this.colors[iy] = w * 0.8;
        this.colors[iz] = w * 0.6;
      }

      const containmentRadius = Math.max(80, state.hazard.oilRadius + 14);
      if (state.incident.containment.boomDeployed) {
        const currentRadiusSq = this.positions[ix] * this.positions[ix] + this.positions[iz] * this.positions[iz];
        if (currentRadiusSq > containmentRadius * containmentRadius) {
          const angle = Math.atan2(this.positions[iz], this.positions[ix]);
          this.positions[ix] = Math.cos(angle) * containmentRadius * 0.97;
          this.positions[iz] = Math.sin(angle) * containmentRadius * 0.97;
        }
      }

      if (
        this.ages[index] > 1450 ||
        Math.abs(this.positions[ix]) > 240 ||
        Math.abs(this.positions[iz]) > 240
      ) {
        this.positions[ix] = (Math.random() - 0.5) * 8;
        this.positions[iy] = 0.6;
        this.positions[iz] = (Math.random() - 0.5) * 8;
        this.ages[index] = 0;
      }

      const radiusSq = this.positions[ix] * this.positions[ix] + this.positions[iz] * this.positions[iz];
      if (radiusSq > maxRadiusSq) {
        maxRadiusSq = radiusSq;
      }

      sumX += this.positions[ix];
      sumZ += this.positions[iz];
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    return {
      oilRadius: Math.sqrt(maxRadiusSq),
      oilArea: Math.PI * maxRadiusSq,
      oilCenter: {
        x: sumX / OIL_COUNT,
        y: 0.6,
        z: sumZ / OIL_COUNT
      }
    };
  }

  private seedParticles(): void {
    for (let index = 0; index < OIL_COUNT; index += 1) {
      const ix = index * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      this.positions[ix] = (Math.random() - 0.5) * 6;
      this.positions[iy] = 0.6;
      this.positions[iz] = (Math.random() - 0.5) * 6;
      this.ages[index] = Math.random() * 500;
      this.colors[ix] = 0.08;
      this.colors[iy] = 0.05;
      this.colors[iz] = 0.03;
    }
  }
}
