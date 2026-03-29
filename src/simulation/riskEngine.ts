import type { AssetAnchor, AssetStatus, RiskAssessment, RiskLevel, RuntimeState } from '../core/types';

function riskWeight(level: RiskLevel): number {
  if (level === 'danger') {
    return 2;
  }
  if (level === 'warning') {
    return 1;
  }
  return 0;
}

function maxRisk(...levels: RiskLevel[]): RiskLevel {
  const best = levels.reduce((highest, current) => Math.max(highest, riskWeight(current)), 0);
  if (best === 2) {
    return 'danger';
  }
  if (best === 1) {
    return 'warning';
  }
  return 'safe';
}

function distance2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function oilEnvelopeRisk(distance: number, oilRadius: number, buffer = 0): RiskLevel {
  if (distance <= oilRadius + buffer) {
    return oilRadius > 110 ? 'danger' : 'warning';
  }
  if (distance <= oilRadius + 18 + buffer) {
    return 'warning';
  }
  return 'safe';
}

function gasEnvelopeRisk(distance: number, gasRadius: number, gasLevel: RiskLevel, buffer = 0): RiskLevel {
  if (distance <= gasRadius + buffer) {
    return gasLevel;
  }
  if (gasLevel !== 'safe' && distance <= gasRadius + 18 + buffer) {
    return 'warning';
  }
  return 'safe';
}

function buildAssetStatus(anchor: AssetAnchor, state: RuntimeState): AssetStatus {
  const oilDistance = distance2D(anchor.position, state.hazard.oilCenter);
  const gasDistance = distance2D(anchor.position, state.incident.leakPoint);

  const oilRisk = oilEnvelopeRisk(oilDistance, state.hazard.oilRadius, anchor.id === 'vessel' ? 14 : 0);
  const gasRisk = gasEnvelopeRisk(gasDistance, state.hazard.gasRadius, state.hazard.gasConcentrationLevel, 10);
  const riskLevel = maxRisk(oilRisk, gasRisk);
  const affectedBy: AssetStatus['affectedBy'] = [];

  if (oilRisk !== 'safe') {
    affectedBy.push('oil');
  }
  if (gasRisk !== 'safe') {
    affectedBy.push('gas');
  }

  let summary = '未进入危险包络区';
  let recommendedAction = '保持跟踪监测';

  if (anchor.id === 'platform' && gasRisk !== 'safe') {
    summary = gasRisk === 'danger' ? '平台上部可燃气风险升高' : '平台存在气云接近趋势';
    recommendedAction = gasRisk === 'danger' ? '启动人员撤离并收紧点火源控制' : '封控甲板并加强监测';
  } else if (anchor.id === 'vessel' && riskLevel !== 'safe') {
    summary = riskLevel === 'danger' ? '船舶切入危险航路' : '船舶逼近危险包络边界';
    recommendedAction = '发布避让指令并调整航线';
  } else if (anchor.id === 'sensitive-zone' && oilRisk !== 'safe') {
    summary = oilRisk === 'danger' ? '油膜可能污染敏感海域' : '敏感海域进入预警缓冲带';
    recommendedAction = '优先布设围油栏并提升海面巡检频率';
  }

  return {
    id: anchor.id,
    label: anchor.label,
    position: anchor.position,
    riskLevel,
    affectedBy,
    summary,
    recommendedAction
  };
}

export function evaluateRisk(state: RuntimeState, anchors: AssetAnchor[]): RiskAssessment {
  const oilRisk: RiskLevel =
    state.hazard.oilRadius > 115 ? 'danger' : state.hazard.oilRadius > 72 ? 'warning' : 'safe';
  const gasRisk = state.hazard.gasConcentrationLevel;
  const assetStatuses = anchors.map((anchor) => buildAssetStatus(anchor, state));
  const overallRisk = assetStatuses.reduce(
    (level, asset) => maxRisk(level, asset.riskLevel, oilRisk, gasRisk),
    'safe' as RiskLevel
  );

  const alerts: string[] = [];
  const recommendations = new Set<string>();

  if (oilRisk === 'danger') {
    alerts.push('溢油扩散半径已进入红色区，海面控制优先级升高。');
    recommendations.add('立即部署围油栏，优先阻断向敏感海域漂移的油带。');
  } else if (oilRisk === 'warning') {
    alerts.push('溢油包络持续扩大，建议提前布控围油栏。');
    recommendations.add('预置围油栏与海面回收船，保持流场追踪。');
  }

  if (gasRisk === 'danger') {
    alerts.push('可燃气云达到危险等级，平台撤离条件成立。');
    recommendations.add('立即启动人员撤离，并锁定高风险区域点火源。');
  } else if (gasRisk === 'warning') {
    alerts.push('气云浓度进入警戒区，平台需转入限制作业状态。');
    recommendations.add('收紧作业许可，持续跟踪浓度云团抬升和扩散。');
  }

  for (const asset of assetStatuses) {
    if (asset.riskLevel !== 'safe') {
      alerts.push(`${asset.label}：${asset.summary}`);
      recommendations.add(asset.recommendedAction);
    }
  }

  if (alerts.length === 0) {
    alerts.push('系统运行稳定，海空态势在安全区内。');
    recommendations.add('维持监测，准备基于新工况进行 what-if 推演。');
  }

  return {
    overallRisk,
    alerts: alerts.slice(0, 4),
    recommendations: Array.from(recommendations).slice(0, 4),
    assets: assetStatuses,
    automation: {
      deployBoom: oilRisk !== 'safe' || assetStatuses.some((asset) => asset.id === 'sensitive-zone' && asset.riskLevel !== 'safe'),
      evacuate: gasRisk === 'danger' || assetStatuses.some((asset) => asset.id === 'platform' && asset.riskLevel === 'danger'),
      shipWarning: assetStatuses.some((asset) => asset.id === 'vessel' && asset.riskLevel !== 'safe')
    }
  };
}
