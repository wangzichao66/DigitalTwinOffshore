export type RiskLevel = 'safe' | 'warning' | 'danger';
export type IncidentMedium = 'LNG' | 'CNG';
export type SensorType = 'wind' | 'current' | 'gas' | 'oil';
export type SensorStatus = 'online' | 'watch' | 'alert';
export type OverrideMode = 'auto' | 'force-on' | 'force-off';
export type AssetId = 'platform' | 'vessel' | 'sensitive-zone';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ControlSettings {
  windSpeedTarget: number;
  windDirectionTarget: number;
  currentSpeedTarget: number;
  currentDirectionTarget: number;
  waveHeightTarget: number;
  leakRateTarget: number;
  medium: IncidentMedium;
  timeMultiplier: number;
}

export interface EnvironmentState {
  windSpeed: number;
  windDirection: number;
  windX: number;
  windZ: number;
  currentSpeed: number;
  currentDirection: number;
  currentX: number;
  currentZ: number;
  waveHeight: number;
  timeMultiplier: number;
}

export interface IncidentState {
  medium: IncidentMedium;
  leakRate: number;
  leakPoint: Vec3;
  durationSeconds: number;
  containment: {
    boomDeployed: boolean;
    evacuationActive: boolean;
    shipWarningActive: boolean;
  };
}

export interface HazardState {
  oilRadius: number;
  oilArea: number;
  oilCenter: Vec3;
  gasHeight: number;
  gasRadius: number;
  gasConcentrationLevel: RiskLevel;
  gasDensityPhase: 'heavy' | 'light';
}

export interface SensorReading {
  id: string;
  label: string;
  type: SensorType;
  position: Vec3;
  value: number;
  unit: string;
  status: SensorStatus;
  timestamp: string;
}

export interface AssetStatus {
  id: AssetId;
  label: string;
  position: Vec3;
  riskLevel: RiskLevel;
  affectedBy: ('oil' | 'gas')[];
  summary: string;
  recommendedAction: string;
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  alerts: string[];
  recommendations: string[];
  assets: AssetStatus[];
  automation: {
    deployBoom: boolean;
    evacuate: boolean;
    shipWarning: boolean;
  };
}

export interface SimulationFrame {
  timestamp: string;
  environment: EnvironmentState;
  incident: IncidentState;
  sensors: SensorReading[];
}

export interface TelemetryProvider {
  getFrame(elapsedSeconds: number, state: RuntimeState): SimulationFrame;
}

export interface RuntimeState {
  controls: ControlSettings;
  environment: EnvironmentState;
  incident: IncidentState;
  hazard: HazardState;
  sensors: SensorReading[];
  risk: RiskAssessment;
  simulation: {
    elapsedSeconds: number;
    playing: boolean;
  };
  overrides: {
    boom: OverrideMode;
    evacuation: OverrideMode;
    shipWarning: OverrideMode;
  };
}

export interface AssetAnchor {
  id: AssetId;
  label: string;
  position: Vec3;
}
