# Digital Twin Offshore (海上能源场站数字孪生预警平台)

[![Built with Vite](https://img.shields.io/badge/Built_with-Vite-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Powered by Three.js](https://img.shields.io/badge/Powered_by-Three.js-black?style=flat-square&logo=three.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A web-based 3D digital twin prototype for offshore energy platforms. It provides real-time visualization of multi-hazard simulations (oil spills, gas cloud diffusion) and dynamic sensor networks.

这是一个基于 **Vite + TypeScript + Three.js + lil-gui** 构建的课程级数字孪生原型，在一个统一的 3D 三维场景中综合展示海上能源场站的灾害态势与自动化响应机制。

![Screenshot](./public/screenshot.png) <!-- 建议在 public 文件夹添加一张名为 screenshot.png 的截图展示给 GitHub 用户 -->

## ✨ 主要特性 (Features)

- **🌊 海面溢油模拟 (Oil Spill Diffusion)** - 动态粒子效果计算与渲染海面溢油扩散范围
- **☁️ 空中气云扩散 (Gas Cloud Diffusion)** - 区分 LNG (重气) 和 CNG (轻气) 的 3D 气体扩散行为
- **🔌 动态传感器感知 (Sensor Network)** - 三维空间内的传感器（风速、海流、气体、溢油）实时状态与告警反馈
- **🕹️ What-If 工况调节 (Interactive Dashboard)** - 实时调节风向、风速、海流、浪高、泄漏速率等参数
- **🛡️ 智能风险评估联动 (Risk Engine)** - 自动根据受波及范围触发智能告警、部署围油栏和人员撤离路线

## 🚀 快速启动 (Quick Start)

### 1. 安装依赖

```bash
npm install
```

2. 启动开发环境

```bash
npm run dev
```

3. 生产构建

```bash
npm run build
```

## 项目结构

```text
DigitalTwinOffshore/
├─ index.html
├─ package.json
├─ src/
│  ├─ core/          # 运行时状态、公共类型
│  ├─ data/          # mock telemetry provider
│  ├─ scene/         # Three.js 场景与可视化对象
│  ├─ simulation/    # 溢油、气云、风险评估
│  ├─ styles/        # 页面样式
│  └─ ui/            # HUD、控制区、面板渲染
└─ docs/
   └─ teacher-brief.md
```

## 模块说明

### 1. 数据层

`MockTelemetryProvider` 负责输出统一的 `SimulationFrame`，包含：

- `EnvironmentState`
- `IncidentState`
- `SensorReading[]`

这样后续如果需要接真实后端，只需替换 provider，而不需要重写 UI 和仿真逻辑。

### 2. 仿真层

- `SpillSimulation`
  - 使用简化粒子法更新海面油膜
  - 输出溢油半径、面积和中心位置
- `GasSimulation`
  - 使用简化三维粒子扩散
  - 区分 `LNG` 重气与 `CNG` 轻气两类行为
  - 输出气云半径、抬升高度和浓度等级

### 3. 风险引擎

`evaluateRisk()` 将溢油、气云和目标对象位置统一计算，输出：

- 综合风险等级
- 告警信息
- 应急建议
- 自动联动动作

### 4. 可视化层

`OffshoreScene` 负责：

- 海面、平台、船舶、敏感海域的建模
- 溢油点云与气云点云显示
- 传感器点位与风险状态联动
- 围油栏与撤离路线展示

### 5. UI 层

`Dashboard` 负责：

- 环境态势面板
- 灾害态势面板
- 受影响目标面板
- 应急建议面板
- 控制区与 what-if 工况调节

## 当前实现的工程假设

- 这是课程级原型，不是工业级 CFD 软件
- 不接真实后端，使用 mock 数据驱动
- 风险判定采用规则引擎，不采用机器学习
- 强调“统一态势展示 + 系统联动逻辑”，而不是追求高精度事故后果分析

## 演示建议

答辩时建议按照下面顺序演示：

1. 展示海上平台、海面、船舶、敏感海域和传感器点位
2. 说明系统支持 `LNG/CNG` 两种事故介质
3. 调整风速、风向、海流、浪高与泄漏速率
4. 观察溢油扩散、气云扩散和预警面板变化
5. 展示围油栏、撤离、船舶避让等联动建议

## 后续可扩展方向

- 将 `MockTelemetryProvider` 替换为真实 API 接口
- 接入历史工况回放
- 用规则表或配置文件管理风险阈值
- 将粒子近似升级为更稳定的体素/网格模型
- 引入真实场站模型或 GIS 数据底座
