import * as THREE from 'three';
import type { HazardState, RuntimeState, RiskLevel } from '../core/types';

const GAS_COUNT = 8000;

function pickGasRisk(leakRate: number, gasRadius: number): RiskLevel {
  if (leakRate >= 160 || gasRadius >= 90) {
    return 'danger';
  }
  if (leakRate >= 95 || gasRadius >= 55) {
    return 'warning';
  }
  return 'safe';
}

export class GasSimulation {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly geometry: THREE.BufferGeometry;

  private readonly positions: Float32Array;

  private readonly colors: Float32Array;

  private readonly opacities: Float32Array;

  private readonly ages: Float32Array;

  private readonly lifetimes: Float32Array;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(GAS_COUNT * 3);
    this.colors = new Float32Array(GAS_COUNT * 3);
    this.opacities = new Float32Array(GAS_COUNT);
    this.ages = new Float32Array(GAS_COUNT);
    this.lifetimes = new Float32Array(GAS_COUNT);
    this.seedParticles();

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 14,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.NormalBlending,
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

  update(
    deltaSeconds: number,
    state: RuntimeState
  ): Pick<HazardState, 'gasHeight' | 'gasRadius' | 'gasConcentrationLevel' | 'gasDensityPhase'> {
    const activeCount = Math.min(GAS_COUNT, Math.round(state.incident.leakRate * 42));
    let maxRadiusSq = 0;
    let maxHeight = 0;

    const windDriftX = state.environment.windX * 12;
    const windDriftZ = state.environment.windZ * 12;
    const isLNG = state.incident.medium === 'LNG';

    for (let index = 0; index < GAS_COUNT; index += 1) {
      const ix = index * 3;
      const iy = ix + 1;
      const iz = ix + 2;

      if (index >= activeCount) {
        this.positions[iy] = -400;
        continue;
      }

      this.ages[index] += deltaSeconds * 60;
      const t = this.ages[index] / this.lifetimes[index]; // Normalized lifetime 0..1

      // --- Turbulent horizontal drift (Fractal-like Brownian motion) ---
      const turbX = (Math.random() - 0.5) * 1.1 + Math.sin(this.ages[index] * 0.07) * 0.55;
      const turbZ = (Math.random() - 0.5) * 1.1 + Math.cos(this.ages[index] * 0.06) * 0.55;
      this.positions[ix] += windDriftX + turbX;
      this.positions[iz] += windDriftZ + turbZ;

      // --- Vertical motion by gas phase ---
      if (isLNG) {
        // LNG: cold heavy gas, initially sinks, then lifts at t~0.3
        if (t < 0.3) {
          this.positions[iy] -= 0.28 + Math.random() * 0.12;
        } else {
          this.positions[iy] += 0.08 + (Math.random() - 0.5) * 0.25;
        }
      } else {
        // CNG: hot gas jets upward fast, spreads outward
        const lift = 0.48 - t * 0.22;
        this.positions[iy] += Math.max(0.05, lift) + (Math.random() - 0.5) * 0.3;
      }

      // Clamp to sea surface
      if (this.positions[iy] < 0.6) {
        this.positions[iy] = 0.6;
      }

      // --- Color by gas type and age ---
      if (isLNG) {
        // LNG: starts ice-white/pale-blue, gradually fades to translucent white
        const coldBlend = Math.max(0, 1 - t * 1.2);
        this.colors[ix] = 0.82 + coldBlend * 0.12;
        this.colors[iy] = 0.88 + coldBlend * 0.1;
        this.colors[iz] = 1.0;
      } else {
        // CNG/smoke: begins pale orange-yellow at core, ages into charcoal grey
        if (t < 0.15) {
          this.colors[ix] = 1.0;
          this.colors[iy] = 0.62 + Math.random() * 0.2;
          this.colors[iz] = 0.18;
        } else {
          const grey = 0.4 + t * 0.28;
          this.colors[ix] = grey;
          this.colors[iy] = grey;
          this.colors[iz] = grey;
        }
      }

      // Respawn if age exceeded -> create continuous fresh emission
      if (
        this.ages[index] >= this.lifetimes[index] ||
        Math.abs(this.positions[ix]) > 320 ||
        Math.abs(this.positions[iz]) > 320 ||
        this.positions[iy] > 200
      ) {
        this.respawnParticle(ix, iy, iz, index, state);
      }

      const radiusSq =
        (this.positions[ix] - state.incident.leakPoint.x) * (this.positions[ix] - state.incident.leakPoint.x) +
        (this.positions[iz] - state.incident.leakPoint.z) * (this.positions[iz] - state.incident.leakPoint.z);
      if (radiusSq > maxRadiusSq) {
        maxRadiusSq = radiusSq;
      }
      if (this.positions[iy] > maxHeight) {
        maxHeight = this.positions[iy];
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    const gasRadius = Math.sqrt(maxRadiusSq);
    return {
      gasHeight: maxHeight,
      gasRadius,
      gasConcentrationLevel: pickGasRisk(state.incident.leakRate, gasRadius),
      gasDensityPhase: state.incident.medium === 'LNG' ? 'heavy' : 'light'
    };
  }

  private respawnParticle(
    ix: number,
    iy: number,
    iz: number,
    index: number,
    state: RuntimeState
  ): void {
    // Emit from a small Gaussian spray around the leak point
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 4.5;
    this.positions[ix] = state.incident.leakPoint.x + Math.cos(angle) * radius;
    this.positions[iy] = state.incident.leakPoint.y + Math.random() * 5;
    this.positions[iz] = state.incident.leakPoint.z + Math.sin(angle) * radius;
    this.ages[index] = 0;
    // Randomize per-particle lifetime for natural variation in cloud density
    this.lifetimes[index] = 480 + Math.random() * 360;
  }

  private seedParticles(): void {
    for (let index = 0; index < GAS_COUNT; index += 1) {
      const ix = index * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      this.positions[ix] = 0;
      this.positions[iy] = -400;
      this.positions[iz] = 0;
      this.ages[index] = Math.random() * 400;
      this.lifetimes[index] = 480 + Math.random() * 360;
      this.colors[ix] = 0.82;
      this.colors[iy] = 0.9;
      this.colors[iz] = 1;
    }
  }
}
