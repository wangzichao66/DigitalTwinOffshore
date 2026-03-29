import type {
  ControlSettings,
  EnvironmentState,
  HazardState,
  IncidentState,
  RiskAssessment,
  RuntimeState
} from './types';

const DEFAULT_CONTROLS: ControlSettings = {
  windSpeedTarget: 8.6,
  windDirectionTarget: 38,
  currentSpeedTarget: 1.4,
  currentDirectionTarget: 64,
  waveHeightTarget: 1.8,
  leakRateTarget: 108,
  medium: 'LNG',
  timeMultiplier: 4
};

const DEFAULT_ENVIRONMENT: EnvironmentState = {
  windSpeed: DEFAULT_CONTROLS.windSpeedTarget,
  windDirection: DEFAULT_CONTROLS.windDirectionTarget,
  windX: 0,
  windZ: 0,
  currentSpeed: DEFAULT_CONTROLS.currentSpeedTarget,
  currentDirection: DEFAULT_CONTROLS.currentDirectionTarget,
  currentX: 0,
  currentZ: 0,
  waveHeight: DEFAULT_CONTROLS.waveHeightTarget,
  timeMultiplier: DEFAULT_CONTROLS.timeMultiplier
};

const DEFAULT_INCIDENT: IncidentState = {
  medium: DEFAULT_CONTROLS.medium,
  leakRate: DEFAULT_CONTROLS.leakRateTarget,
  leakPoint: { x: -10, y: 22, z: -10 },
  durationSeconds: 0,
  containment: {
    boomDeployed: false,
    evacuationActive: false,
    shipWarningActive: false
  }
};

const DEFAULT_HAZARD: HazardState = {
  oilRadius: 0,
  oilArea: 0,
  oilCenter: { x: 0, y: 0.6, z: 0 },
  gasHeight: 0,
  gasRadius: 0,
  gasConcentrationLevel: 'safe',
  gasDensityPhase: 'heavy'
};

function createDefaultRisk(): RiskAssessment {
  return {
    overallRisk: 'safe',
    alerts: ['系统启动完成，等待态势演化。'],
    recommendations: ['保持监测，确认围油栏与撤离通道处于待命状态。'],
    assets: [],
    automation: {
      deployBoom: false,
      evacuate: false,
      shipWarning: false
    }
  };
}

export function createInitialState(): RuntimeState {
  return {
    controls: { ...DEFAULT_CONTROLS },
    environment: { ...DEFAULT_ENVIRONMENT },
    incident: {
      ...DEFAULT_INCIDENT,
      leakPoint: { ...DEFAULT_INCIDENT.leakPoint },
      containment: { ...DEFAULT_INCIDENT.containment }
    },
    hazard: {
      ...DEFAULT_HAZARD,
      oilCenter: { ...DEFAULT_HAZARD.oilCenter }
    },
    sensors: [],
    risk: createDefaultRisk(),
    simulation: {
      elapsedSeconds: 0,
      playing: true
    },
    overrides: {
      boom: 'auto',
      evacuation: 'auto',
      shipWarning: 'auto'
    }
  };
}

export function resetRuntimeState(state: RuntimeState): void {
  const fresh = createInitialState();
  Object.assign(state.controls, fresh.controls);
  Object.assign(state.environment, fresh.environment);
  Object.assign(state.incident, {
    ...fresh.incident,
    leakPoint: { ...fresh.incident.leakPoint },
    containment: { ...fresh.incident.containment }
  });
  Object.assign(state.hazard, {
    ...fresh.hazard,
    oilCenter: { ...fresh.hazard.oilCenter }
  });
  state.sensors.splice(0, state.sensors.length, ...fresh.sensors);
  state.risk = fresh.risk;
  Object.assign(state.simulation, fresh.simulation);
  Object.assign(state.overrides, fresh.overrides);
}

export function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
