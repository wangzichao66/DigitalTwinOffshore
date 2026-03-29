import { formatClock } from '../core/state';
import type {
  IncidentMedium,
  OverrideMode,
  RiskAssessment,
  RiskLevel,
  RuntimeState,
  SimulationFrame
} from '../core/types';

interface DashboardHandlers {
  onTogglePlay: () => void;
  onReset: () => void;
  onSetSpeed: (speed: number) => void;
  onSetMedium: (medium: IncidentMedium) => void;
  onCycleBoomOverride: () => void;
  onCycleEvacuationOverride: () => void;
  onCycleShipWarningOverride: () => void;
}

export type DashboardTab = 'recommendations' | 'sensors' | 'whatif';

function riskLabel(level: RiskLevel): string {
  if (level === 'danger') return '危险';
  if (level === 'warning') return '警戒';
  return '安全';
}

function overrideLabel(mode: OverrideMode): string {
  if (mode === 'force-on') return '强制开启';
  if (mode === 'force-off') return '强制关闭';
  return '自动';
}

function severityClass(level: RiskLevel): string {
  return `severity-${level}`;
}

export class Dashboard {
  private readonly sceneMount: HTMLDivElement;
  private readonly guiHost: HTMLDivElement;
  private readonly refs: Record<string, HTMLElement>;
  private readonly host: HTMLElement;
  private activeTab: DashboardTab = 'recommendations';

  constructor(container: HTMLElement) {
    this.host = container;
    container.innerHTML = `
      <div class="app-shell" style="position: relative; width: 100vw; height: 100vh; overflow: hidden; display: block;">
        <div class="scene-mount" style="position: absolute; inset: 0; z-index: 1;"></div>
        <div class="overlay-shell" style="position: absolute; inset: 0; z-index: 9999; pointer-events: none; display: flex; flex-direction: column;">
          <header class="hero-strip glass-panel" style="pointer-events: auto;">
            <div class="hero-copy-wrap">
              <p class="eyebrow">OFFSHORE DIGITAL TWIN</p>
              <h1>海上能源场站多灾种智能仿真预警平台</h1>
              <p class="hero-copy">统一展示海面溢油、空中气云、目标受影响态势与应急建议，面向课程级数字孪生原型演示。</p>
            </div>
            <div class="hero-status">
              <span id="overallRiskChip" class="risk-chip severity-safe">安全态势</span>
              <span id="timestampLabel">2026/3/27 09:00:00</span>
              <button id="toggleUiBtn" class="control-btn primary" style="margin-top: 4px; padding: 4px 10px; font-size: 11px;">👁️ 隐藏面板看模型</button>
            </div>
          </header>

          <div class="control-strip glass-panel" style="pointer-events: auto;">
            <div class="control-group">
              <button id="playPauseBtn" class="control-btn primary">暂停</button>
              <button id="resetBtn" class="control-btn">重置</button>
            </div>
            <div class="control-group">
              <button data-speed="1" class="control-btn speed-btn">1x</button>
              <button data-speed="4" class="control-btn speed-btn active">4x</button>
              <button data-speed="12" class="control-btn speed-btn">12x</button>
            </div>
            <div class="control-group">
              <button data-medium="LNG" class="control-btn medium-btn active">LNG</button>
              <button data-medium="CNG" class="control-btn medium-btn">CNG</button>
            </div>
            <div class="control-group control-group-wide">
              <button id="boomOverrideBtn" class="control-btn">围油栏：自动</button>
              <button id="evacuationOverrideBtn" class="control-btn">撤离：自动</button>
              <button id="shipWarningOverrideBtn" class="control-btn">航警：自动</button>
            </div>
          </div>

          <div class="panel-grid-wrap"><div class="panel-grid">
            <section class="panel-column panel-column-main">
              <article class="glass-panel panel">
                <div class="panel-head">
                  <p class="panel-kicker">ENVIRONMENT</p>
                  <h2>环境态势</h2>
                </div>
                <div class="metric-grid">
                  <div class="metric-item"><span>风速</span><strong id="windValue">0.0 m/s</strong></div>
                  <div class="metric-item"><span>风向</span><strong id="windDirectionValue">0°</strong></div>
                  <div class="metric-item"><span>海流</span><strong id="currentValue">0.0 m/s</strong></div>
                  <div class="metric-item"><span>浪高</span><strong id="waveValue">0.0 m</strong></div>
                </div>
              </article>

              <article class="glass-panel panel">
                <div class="panel-head">
                  <p class="panel-kicker">HAZARDS</p>
                  <h2>灾害态势</h2>
                </div>
                <div class="metric-grid">
                  <div class="metric-item"><span>介质类型</span><strong id="mediumValue">LNG</strong></div>
                  <div class="metric-item"><span>泄漏速率</span><strong id="leakValue">0 kg/s</strong></div>
                  <div class="metric-item"><span>溢油半径</span><strong id="oilRadiusValue">0 m</strong></div>
                  <div class="metric-item"><span>油膜面积</span><strong id="oilAreaValue">0 m²</strong></div>
                  <div class="metric-item"><span>气云半径</span><strong id="gasRadiusValue">0 m</strong></div>
                  <div class="metric-item"><span>气云抬升</span><strong id="gasHeightValue">0 m</strong></div>
                </div>
                <p id="gasPhaseValue" class="panel-note">冷态重气阶段，优先贴海面扩散。</p>
              </article>

              <article class="glass-panel panel panel-assets">
                <div class="panel-head">
                  <p class="panel-kicker">ASSETS</p>
                  <h2>受影响目标</h2>
                </div>
                <div id="assetList" class="list-stack"></div>
              </article>
            </section>

            <section class="panel-column panel-column-side">
              <article class="glass-panel panel panel-tabs">
                <div class="panel-head panel-head-tabs">
                  <div>
                    <p class="panel-kicker">SECONDARY PANELS</p>
                    <h2 id="secondaryTitle">应急建议</h2>
                  </div>
                  <div class="tab-strip" role="tablist" aria-label="侧边信息面板" style="pointer-events: auto;">
                    <button data-tab="recommendations" class="tab-btn active" type="button">建议</button>
                    <button data-tab="sensors" class="tab-btn" type="button">传感器</button>
                    <button data-tab="whatif" class="tab-btn" type="button">工况</button>
                  </div>
                </div>

                <div id="tabRecommendations" class="tab-panel active">
                  <div id="recommendationList" class="list-stack"></div>
                </div>

                <div id="tabSensors" class="tab-panel">
                  <div id="sensorList" class="list-stack sensors"></div>
                </div>

                <div id="tabWhatif" class="tab-panel" style="pointer-events: auto;">
                  <p class="panel-note panel-note-compact">调节环境工况与事故参数，观察系统预警和目标受影响状态如何变化。</p>
                  <div class="gui-host" style="pointer-events: auto;"></div>
                </div>
              </article>
            </section>
          </div></div>

          <div class="footer-strip glass-panel">
            <div class="footer-clock">
              <span class="footer-label">仿真时钟</span>
              <strong id="clockValue">T+00:00</strong>
            </div>
            <div class="alert-stack" id="alertList"></div>
          </div>
        </div>
      </div>
    `;

    this.sceneMount = container.querySelector('.scene-mount') as HTMLDivElement;
    this.guiHost = container.querySelector('.gui-host') as HTMLDivElement;

    const refIds = [
      'overallRiskChip',
      'timestampLabel',
      'playPauseBtn',
      'resetBtn',
      'windValue',
      'windDirectionValue',
      'currentValue',
      'waveValue',
      'mediumValue',
      'leakValue',
      'oilRadiusValue',
      'oilAreaValue',
      'gasRadiusValue',
      'gasHeightValue',
      'gasPhaseValue',
      'assetList',
      'recommendationList',
      'sensorList',
      'clockValue',
      'alertList',
      'boomOverrideBtn',
      'evacuationOverrideBtn',
      'shipWarningOverrideBtn',
      'secondaryTitle',
      'tabRecommendations',
      'tabSensors',
      'tabWhatif'
    ] as const;

    this.refs = Object.fromEntries(refIds.map((id) => [id, container.querySelector(`#${id}`) as HTMLElement]));
    this.bindTabEvents();
    this.updateActiveTab();

    const toggleUiBtn = container.querySelector('#toggleUiBtn') as HTMLButtonElement;
    if (toggleUiBtn) {
      let uiVisible = true;
      toggleUiBtn.addEventListener('click', () => {
        uiVisible = !uiVisible;
        const elementsToToggle = this.host.querySelectorAll<HTMLElement>('.control-strip, .panel-grid-wrap, .footer-strip');
        elementsToToggle.forEach((el) => {
          if (uiVisible) {
            el.style.display = el.dataset.originalDisplay || ''; // fallback
          } else {
            if (el.style.display !== 'none') el.dataset.originalDisplay = getComputedStyle(el).display;
            el.style.display = 'none';
          }
        });
        toggleUiBtn.innerHTML = uiVisible ? '👁️ 隐藏面板看模型' : '📊 展开全景数据看板';
        if (!uiVisible) {
          toggleUiBtn.classList.remove('primary');
        } else {
          toggleUiBtn.classList.add('primary');
        }
      });
    }
  }

  getSceneMount(): HTMLDivElement {
    return this.sceneMount;
  }

  getGuiHost(): HTMLDivElement {
    return this.guiHost;
  }

  bindControls(handlers: DashboardHandlers): void {
    this.refs.playPauseBtn.addEventListener('click', handlers.onTogglePlay);
    this.refs.resetBtn.addEventListener('click', handlers.onReset);
    this.refs.boomOverrideBtn.addEventListener('click', handlers.onCycleBoomOverride);
    this.refs.evacuationOverrideBtn.addEventListener('click', handlers.onCycleEvacuationOverride);
    this.refs.shipWarningOverrideBtn.addEventListener('click', handlers.onCycleShipWarningOverride);

    this.host.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => handlers.onSetSpeed(Number(button.dataset.speed)));
    });

    this.host.querySelectorAll<HTMLButtonElement>('[data-medium]').forEach((button) => {
      button.addEventListener('click', () => handlers.onSetMedium(button.dataset.medium as IncidentMedium));
    });
  }

  render(state: RuntimeState, frame: SimulationFrame): void {
    const riskChip = this.refs.overallRiskChip;
    riskChip.textContent = `${riskLabel(state.risk.overallRisk)}态势`;
    riskChip.className = `risk-chip ${severityClass(state.risk.overallRisk)}`;

    this.refs.timestampLabel.textContent = frame.timestamp;
    this.refs.playPauseBtn.textContent = state.simulation.playing ? '暂停' : '继续';
    this.refs.windValue.textContent = `${state.environment.windSpeed.toFixed(1)} m/s`;
    this.refs.windDirectionValue.textContent = `${state.environment.windDirection.toFixed(0)}°`;
    this.refs.currentValue.textContent = `${state.environment.currentSpeed.toFixed(2)} m/s`;
    this.refs.waveValue.textContent = `${state.environment.waveHeight.toFixed(1)} m`;
    this.refs.mediumValue.textContent = state.incident.medium;
    this.refs.leakValue.textContent = `${state.incident.leakRate.toFixed(0)} kg/s`;
    this.refs.oilRadiusValue.textContent = `${state.hazard.oilRadius.toFixed(0)} m`;
    this.refs.oilAreaValue.textContent = `${state.hazard.oilArea.toFixed(0)} m²`;
    this.refs.gasRadiusValue.textContent = `${state.hazard.gasRadius.toFixed(0)} m`;
    this.refs.gasHeightValue.textContent = `${state.hazard.gasHeight.toFixed(0)} m`;
    this.refs.gasPhaseValue.textContent =
      state.hazard.gasDensityPhase === 'heavy'
        ? '冷态重气阶段，优先贴海面扩散。'
        : '轻气抬升阶段，扩散高度快速增加。';

    this.refs.clockValue.textContent = formatClock(state.simulation.elapsedSeconds);
    this.refs.boomOverrideBtn.textContent = `围油栏：${overrideLabel(state.overrides.boom)}`;
    this.refs.evacuationOverrideBtn.textContent = `撤离：${overrideLabel(state.overrides.evacuation)}`;
    this.refs.shipWarningOverrideBtn.textContent = `航警：${overrideLabel(state.overrides.shipWarning)}`;

    this.host.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.speed) === state.controls.timeMultiplier);
    });
    this.host.querySelectorAll<HTMLButtonElement>('.medium-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.medium === state.controls.medium);
    });

    this.renderAssets(state.risk);
    this.renderRecommendations(state.risk);
    this.renderSensors(frame);
    this.renderAlerts(state.risk);
  }

  private bindTabEvents(): void {
    this.host.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activeTab = button.dataset.tab as DashboardTab;
        this.updateActiveTab();
      });
    });
  }

  private updateActiveTab(): void {
    const titles: Record<DashboardTab, string> = {
      recommendations: '应急建议',
      sensors: '传感器联动',
      whatif: '工况调节'
    };

    this.refs.secondaryTitle.textContent = titles[this.activeTab];
    this.host.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === this.activeTab);
    });

    const panels: Record<DashboardTab, HTMLElement> = {
      recommendations: this.refs.tabRecommendations,
      sensors: this.refs.tabSensors,
      whatif: this.refs.tabWhatif
    };

    (Object.keys(panels) as DashboardTab[]).forEach((key) => {
      panels[key].classList.toggle('active', key === this.activeTab);
    });
  }

  private renderAssets(risk: RiskAssessment): void {
    this.refs.assetList.innerHTML = risk.assets
      .map(
        (asset) => `
          <article class="list-card ${severityClass(asset.riskLevel)}">
            <div class="list-head">
              <strong>${asset.label}</strong>
              <span class="tag">${riskLabel(asset.riskLevel)}</span>
            </div>
            <p>${asset.summary}</p>
            <small>${asset.recommendedAction}</small>
          </article>
        `
      )
      .join('');
  }

  private renderRecommendations(risk: RiskAssessment): void {
    this.refs.recommendationList.innerHTML = risk.recommendations
      .map(
        (item) => `
          <article class="list-card recommendation-card">
            <strong>建议动作</strong>
            <p>${item}</p>
          </article>
        `
      )
      .join('');
  }

  private renderSensors(frame: SimulationFrame): void {
    this.refs.sensorList.innerHTML = frame.sensors
      .map(
        (sensor) => `
          <article class="list-card sensor-card ${sensor.status}">
            <div class="list-head">
              <strong>${sensor.label}</strong>
              <span class="tag">${sensor.status === 'alert' ? '告警' : sensor.status === 'watch' ? '关注' : '在线'}</span>
            </div>
            <p>${sensor.value.toFixed(1)} ${sensor.unit}</p>
            <small>${sensor.timestamp}</small>
          </article>
        `
      )
      .join('');
  }

  private renderAlerts(risk: RiskAssessment): void {
    this.refs.alertList.innerHTML = risk.alerts
      .map((alert) => `<span class="alert-pill ${severityClass(risk.overallRisk)}">${alert}</span>`)
      .join('');
  }
}
