import type {
  EnvironmentState,
  IncidentState,
  RuntimeState,
  SensorReading,
  SimulationFrame,
  TelemetryProvider,
  Vec3
} from '../core/types';

function toVector(speed: number, directionDeg: number): { x: number; z: number } {
  const radians = (directionDeg * Math.PI) / 180;
  return {
    x: Math.sin(radians) * speed,
    z: Math.cos(radians) * speed
  };
}

function formatTimestamp(elapsedSeconds: number): string {
  const base = new Date('2026-03-27T09:00:00');
  base.setSeconds(base.getSeconds() + Math.floor(elapsedSeconds));
  return `${base.toLocaleDateString('zh-CN')} ${base.toLocaleTimeString('zh-CN', {
    hour12: false
  })}`;
}

function createSensor(
  id: string,
  label: string,
  type: SensorReading['type'],
  position: Vec3,
  value: number,
  unit: string,
  timestamp: string,
  alertThreshold: number,
  warningThreshold: number
): SensorReading {
  let status: SensorReading['status'] = 'online';
  if (value >= alertThreshold) {
    status = 'alert';
  } else if (value >= warningThreshold) {
    status = 'watch';
  }

  return {
    id,
    label,
    type,
    position,
    value,
    unit,
    status,
    timestamp
  };
}

export class MockTelemetryProvider implements TelemetryProvider {
  getFrame(elapsedSeconds: number, state: RuntimeState): SimulationFrame {
    const windPulse = Math.sin(elapsedSeconds * 0.04) * 0.9;
    const currentPulse = Math.cos(elapsedSeconds * 0.025) * 0.18;
    const wavePulse = Math.sin(elapsedSeconds * 0.03) * 0.25;
    const leakPulse = Math.sin(elapsedSeconds * 0.055) * 8;

    const windSpeed = Math.max(0, state.controls.windSpeedTarget + windPulse);
    const windDirection = (state.controls.windDirectionTarget + Math.sin(elapsedSeconds * 0.015) * 14 + 360) % 360;
    const currentSpeed = Math.max(0, state.controls.currentSpeedTarget + currentPulse);
    const currentDirection =
      (state.controls.currentDirectionTarget + Math.cos(elapsedSeconds * 0.018) * 10 + 360) % 360;
    const waveHeight = Math.max(0.2, state.controls.waveHeightTarget + wavePulse);
    const leakRate = Math.max(20, state.controls.leakRateTarget + leakPulse);

    const wind = toVector(windSpeed / 55, windDirection);
    const current = toVector(currentSpeed / 18, currentDirection);
    const timestamp = formatTimestamp(elapsedSeconds);

    const environment: EnvironmentState = {
      windSpeed,
      windDirection,
      windX: wind.x,
      windZ: wind.z,
      currentSpeed,
      currentDirection,
      currentX: current.x,
      currentZ: current.z,
      waveHeight,
      timeMultiplier: state.controls.timeMultiplier
    };

    const incident: IncidentState = {
      medium: state.controls.medium,
      leakRate,
      leakPoint: { x: -10, y: 22, z: -10 },
      durationSeconds: elapsedSeconds,
      containment: { ...state.incident.containment }
    };

    const sensors: SensorReading[] = [
      createSensor(
        'wind-01',
        '风场桅杆',
        'wind',
        { x: 0, y: 36, z: 18 },
        windSpeed,
        'm/s',
        timestamp,
        14,
        10
      ),
      createSensor(
        'current-01',
        '流场浮标',
        'current',
        { x: 80, y: 1, z: 44 },
        currentSpeed,
        'm/s',
        timestamp,
        2.3,
        1.8
      ),
      createSensor(
        'gas-01',
        '可燃气探头',
        'gas',
        { x: -12, y: 24, z: -8 },
        state.hazard.gasRadius * 0.12 + leakRate * 0.08,
        '%LEL',
        timestamp,
        65,
        38
      ),
      createSensor(
        'oil-01',
        '油膜雷达',
        'oil',
        { x: -6, y: 4, z: 20 },
        state.hazard.oilArea / 120,
        'm²×10²',
        timestamp,
        180,
        90
      )
    ];

    return {
      timestamp,
      environment,
      incident,
      sensors
    };
  }
}
