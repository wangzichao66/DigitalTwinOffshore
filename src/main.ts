import { GUI } from 'lil-gui';
import './styles/app.css';
import { createInitialState, resetRuntimeState } from './core/state';
import type { IncidentMedium, OverrideMode, RuntimeState } from './core/types';
import { MockTelemetryProvider } from './data/mockTelemetryProvider';
import { OffshoreScene } from './scene/offshoreScene';
import { GasSimulation } from './simulation/gasSimulation';
import { evaluateRisk } from './simulation/riskEngine';
import { SpillSimulation } from './simulation/spillSimulation';
import { Dashboard } from './ui/dashboard';

function cycleOverride(mode: OverrideMode): OverrideMode {
  if (mode === 'auto') return 'force-on';
  if (mode === 'force-on') return 'force-off';
  return 'auto';
}

function resolveOverride(mode: OverrideMode, recommended: boolean): boolean {
  if (mode === 'force-on') return true;
  if (mode === 'force-off') return false;
  return recommended;
}

// One-way latch flags: once auto-triggered, stay deployed until manually overridden
let boomLatch = false;
let evacuationLatch = false;
let shipWarningLatch = false;

function applyContainmentState(state: RuntimeState): void {
  // Latch: if auto system recommends deploying, lock it on
  if (state.risk.automation.deployBoom) boomLatch = true;
  if (state.risk.automation.evacuate) evacuationLatch = true;
  if (state.risk.automation.shipWarning) shipWarningLatch = true;

  // Manual force-off resets the latch
  if (state.overrides.boom === 'force-off') boomLatch = false;
  if (state.overrides.evacuation === 'force-off') evacuationLatch = false;
  if (state.overrides.shipWarning === 'force-off') shipWarningLatch = false;

  state.incident.containment.boomDeployed = resolveOverride(state.overrides.boom, boomLatch);
  state.incident.containment.evacuationActive = resolveOverride(state.overrides.evacuation, evacuationLatch);
  state.incident.containment.shipWarningActive = resolveOverride(state.overrides.shipWarning, shipWarningLatch);
}

type RecursiveGui = GUI & {
  controllersRecursive?: () => Array<{ updateDisplay: () => void }>;
};

function refreshGui(gui: GUI): void {
  const recursiveGui = gui as RecursiveGui;
  recursiveGui.controllersRecursive?.().forEach((controller) => controller.updateDisplay());
}

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) {
  throw new Error('Missing #app mount node.');
}

const state = createInitialState();
const dashboard = new Dashboard(appRoot);
const scene = new OffshoreScene(dashboard.getSceneMount());
const telemetryProvider = new MockTelemetryProvider();
const spillSimulation = new SpillSimulation(scene.getScene());
const gasSimulation = new GasSimulation(scene.getScene());

const gui = new GUI({
  container: dashboard.getGuiHost(),
  title: '工况调节'
});

const environmentFolder = gui.addFolder('环境参数');
environmentFolder.add(state.controls, 'windSpeedTarget', 0, 20, 0.1).name('目标风速');
environmentFolder.add(state.controls, 'windDirectionTarget', 0, 359, 1).name('目标风向');
environmentFolder.add(state.controls, 'currentSpeedTarget', 0, 3.5, 0.05).name('目标海流');
environmentFolder.add(state.controls, 'currentDirectionTarget', 0, 359, 1).name('海流方向');
environmentFolder.add(state.controls, 'waveHeightTarget', 0.3, 4.5, 0.1).name('浪高');
environmentFolder.open();

const incidentFolder = gui.addFolder('事故参数');
incidentFolder
  .add(state.controls, 'medium', {
    'LNG 重气': 'LNG',
    'CNG 轻气': 'CNG'
  })
  .name('介质类型');
incidentFolder.add(state.controls, 'leakRateTarget', 20, 220, 1).name('泄漏速率');
incidentFolder.open();

dashboard.bindControls({
  onTogglePlay: () => {
    state.simulation.playing = !state.simulation.playing;
  },
  onReset: () => {
    resetRuntimeState(state);
    spillSimulation.reset();
    gasSimulation.reset();
    refreshGui(gui);
  },
  onSetSpeed: (speed) => {
    state.controls.timeMultiplier = speed;
  },
  onSetMedium: (medium: IncidentMedium) => {
    state.controls.medium = medium;
  },
  onCycleBoomOverride: () => {
    state.overrides.boom = cycleOverride(state.overrides.boom);
  },
  onCycleEvacuationOverride: () => {
    state.overrides.evacuation = cycleOverride(state.overrides.evacuation);
  },
  onCycleShipWarningOverride: () => {
    state.overrides.shipWarning = cycleOverride(state.overrides.shipWarning);
  }
});

let lastFrameTime = performance.now();

function tick(now: number): void {
  requestAnimationFrame(tick);
  try {
    const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.12);
    lastFrameTime = now;
    const step = state.simulation.playing ? deltaSeconds * state.controls.timeMultiplier : 0;

    if (state.simulation.playing) {
      state.simulation.elapsedSeconds += step;
    }

    applyContainmentState(state);

    const frame = telemetryProvider.getFrame(state.simulation.elapsedSeconds, state);
    Object.assign(state.environment, frame.environment);
    Object.assign(state.incident, {
      medium: frame.incident.medium,
      leakRate: frame.incident.leakRate,
      durationSeconds: frame.incident.durationSeconds,
      leakPoint: { ...frame.incident.leakPoint },
      containment: { ...state.incident.containment }
    });
    state.sensors.splice(0, state.sensors.length, ...frame.sensors);

    scene.updateMotion(step, state);

    const oilState = spillSimulation.update(Math.max(step, 0.016), state);
    // Monotonic radius logic: ensure oilRadius never shrinks (from particle respawn)
    // to prevent the boom ring from oscillating/looping in size.
    if (!state.hazard.oilRadius || oilState.oilRadius > state.hazard.oilRadius) {
      state.hazard.oilRadius = oilState.oilRadius;
    }
    state.hazard.oilArea = oilState.oilArea;
    state.hazard.oilCenter = oilState.oilCenter;

    const gasState = gasSimulation.update(Math.max(step, 0.016), state);
    Object.assign(state.hazard, gasState);

    state.risk = evaluateRisk(state, scene.getAssetAnchors());
    applyContainmentState(state);

    scene.updateVisualState(state, state.risk, state.sensors);
    dashboard.render(state, frame);
    scene.render();
  } catch (err) {
    console.error('Tick Crash:', err);
  }
}

requestAnimationFrame((time) => {
  lastFrameTime = time;
  tick(time);
});
