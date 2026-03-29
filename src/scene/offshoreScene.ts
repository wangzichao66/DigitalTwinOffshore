import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetAnchor, RiskAssessment, RuntimeState, SensorReading } from '../core/types';

interface WaveMeta {
  baseZ: number;
  angle: number;
  amplitude: number;
  speed: number;
}

function colorForLevel(level: RiskAssessment['overallRisk']): number {
  if (level === 'danger') {
    return 0xff5b4d;
  }
  if (level === 'warning') {
    return 0xffb74d;
  }
  return 0x4ee6b6;
}

function createTextSprite(text: string, color: string = '#5cf4da'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 256;
  canvas.height = 64;

  // Background pill
  ctx.fillStyle = 'rgba(3, 17, 29, 0.72)';
  const radius = 12;
  const x = 4, y = 4, w = canvas.width - 8, h = canvas.height - 8;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(10, 2.5, 1);
  return sprite;
}

export class OffshoreScene {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly seaGeometry: THREE.PlaneGeometry;
  private readonly waveMeta: WaveMeta[] = [];
  private readonly sensitiveZoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x21c0c7,
    roughness: 0.6,
    metalness: 0.2,
    transparent: true,
    opacity: 0.4
  });
  private readonly boomMaterial = new THREE.MeshStandardMaterial({ color: 0xff9a2f, roughness: 0.35, metalness: 0.2 });
  private readonly flameLight = new THREE.PointLight(0xff5c33, 1.6, 70);
  private readonly platformAlarmLight = new THREE.PointLight(0xff0000, 0, 180);
  private readonly platformGroup = new THREE.Group();
  private readonly shipGroup = new THREE.Group();
  private readonly sensitiveZone: THREE.Mesh;
  private readonly boomRing: THREE.Mesh;
  private readonly evacuationLine: THREE.Line;
  private readonly leakBeacon: THREE.Mesh;
  private readonly leakHalo: THREE.Mesh;
  private readonly sensorMeshes = new Map<string, THREE.Mesh>();
  private readonly sensorRings: THREE.Mesh[] = [];
  private readonly assetAnchors: AssetAnchor[] = [
    { id: 'platform', label: '平台人员区', position: { x: 0, y: 20, z: 0 } },
    { id: 'vessel', label: '过往船舶', position: { x: 160, y: 2, z: 0 } },
    { id: 'sensitive-zone', label: '敏感海域', position: { x: 182, y: 0, z: -96 } }
  ];

  constructor(mount: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03111d);
    this.scene.fog = new THREE.FogExp2(0x07131f, 0.0017);

    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2200);
    this.camera.position.set(82, 46, 92);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x03111d, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100vw';
    this.renderer.domElement.style.height = '100vh';
    this.renderer.domElement.style.pointerEvents = 'auto';

    mount.style.position = 'relative';
    mount.style.width = '100%';
    mount.style.height = '100%';
    mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 360;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;

    this.addSky();
    this.addLights();
    this.seaGeometry = new THREE.PlaneGeometry(1200, 1200, 160, 160);
    this.addSea();
    this.addPlatform();
    this.addShip();
    this.sensitiveZone = this.addSensitiveZone();
    this.boomRing = this.addBoomRing();
    this.evacuationLine = this.addEvacuationLine();
    const leakBeacon = this.addLeakBeacon();
    this.leakBeacon = leakBeacon.beacon;
    this.leakHalo = leakBeacon.halo;
    this.addSensors();

    window.addEventListener('resize', () => this.resize(mount));
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getAssetAnchors(): AssetAnchor[] {
    this.assetAnchors[1].position = {
      x: this.shipGroup.position.x,
      y: this.shipGroup.position.y,
      z: this.shipGroup.position.z
    };
    return this.assetAnchors;
  }

  updateMotion(deltaSeconds: number, state: RuntimeState): void {
    const positions = this.seaGeometry.attributes.position.array as Float32Array;
    for (let index = 0, waveIndex = 0; index < positions.length; index += 3, waveIndex += 1) {
      const wave = this.waveMeta[waveIndex];
      positions[index + 2] =
        wave.baseZ +
        Math.sin(wave.angle) * wave.amplitude * (0.55 + state.environment.waveHeight * 0.35);
      wave.angle += wave.speed * (0.8 + state.environment.waveHeight * 0.2) * Math.max(deltaSeconds * 60, 0.4);
    }
    this.seaGeometry.attributes.position.needsUpdate = true;
    this.seaGeometry.computeVertexNormals(); // Required for smooth rolling highlights

    if (deltaSeconds > 0) {
      const shipAngle = state.simulation.elapsedSeconds * 0.018;
      this.shipGroup.position.x = Math.cos(shipAngle) * 160;
      this.shipGroup.position.z = Math.sin(shipAngle) * 160;
      this.shipGroup.rotation.y = -shipAngle;
      this.flameLight.intensity = 1.3 + Math.sin(state.simulation.elapsedSeconds * 0.22) * 0.35;
      this.leakBeacon.scale.setScalar(0.95 + Math.sin(state.simulation.elapsedSeconds * 0.28) * 0.08);
      this.leakHalo.scale.setScalar(1 + Math.sin(state.simulation.elapsedSeconds * 0.18) * 0.1);

      // Sensor breathing animation
      const breath = 0.92 + Math.sin(state.simulation.elapsedSeconds * 1.8) * 0.08;
      this.sensorMeshes.forEach((mesh) => {
        mesh.scale.setScalar(breath);
      });
      // Ring rotation animation
      this.sensorRings.forEach((ring) => {
        ring.rotation.z += deltaSeconds * 0.8;
        const ringBreath = 0.95 + Math.sin(state.simulation.elapsedSeconds * 1.2) * 0.05;
        ring.scale.setScalar(ringBreath);
      });
    }
  }

  updateVisualState(state: RuntimeState, risk: RiskAssessment, sensors: SensorReading[]): void {
    const flash = Math.sin(performance.now() * 0.006) * 0.5 + 0.5;
    const platformDanger = risk.assets.find((asset) => asset.id === 'platform')?.riskLevel ?? 'safe';
    const shipDanger = risk.assets.find((asset) => asset.id === 'vessel')?.riskLevel ?? 'safe';
    const zoneDanger = risk.assets.find((asset) => asset.id === 'sensitive-zone')?.riskLevel ?? 'safe';

    this.boomRing.visible = state.incident.containment.boomDeployed;
    if (this.boomRing.visible) {
      const ringRadius = Math.max(90, state.hazard.oilRadius + 18);
      // 不要使用 setScalar 缩放，这会导致管径跟着等比放大变成“沙漏”
      // 而是动态更新其几何体
      if ((this.boomRing.userData.currentRadius || 0) !== ringRadius) {
        if (this.boomRing.geometry) {
          this.boomRing.geometry.dispose();
        }
        this.boomRing.geometry = new THREE.TorusGeometry(ringRadius, 1.2, 12, 80);
        this.boomRing.userData.currentRadius = ringRadius;
      }
    }
    this.evacuationLine.visible = state.incident.containment.evacuationActive;

    this.leakBeacon.position.set(state.incident.leakPoint.x, state.incident.leakPoint.y, state.incident.leakPoint.z);
    this.leakHalo.position.copy(this.leakBeacon.position);
    this.leakHalo.lookAt(this.camera.position);

    if (platformDanger === 'danger') {
      this.platformAlarmLight.color.setHex(0xff0000);
      this.platformAlarmLight.intensity = 3 + flash * 2;
    } else if (platformDanger === 'warning') {
      this.platformAlarmLight.color.setHex(0xff9900);
      this.platformAlarmLight.intensity = 1.5 + flash * 1;
    } else {
      this.platformAlarmLight.intensity = 0;
    }

    this.shipGroup.children.forEach((child) => {
      const shipLight = child.userData.alarmLight as THREE.PointLight | undefined;
      if (shipLight) {
        if (shipDanger === 'danger') {
          shipLight.color.setHex(0xff0000);
          shipLight.intensity = 2 + flash;
        } else if (shipDanger === 'warning') {
          shipLight.color.setHex(0xff9900);
          shipLight.intensity = 1 + flash;
        } else {
          shipLight.intensity = 0;
        }
      }
    });

    this.sensitiveZoneMaterial.color.setHex(colorForLevel(zoneDanger));
    this.sensitiveZoneMaterial.opacity = zoneDanger === 'safe' ? 0.34 : 0.52;
    const haloMaterial = this.leakHalo.material as THREE.MeshBasicMaterial;
    haloMaterial.color.setHex(colorForLevel(risk.overallRisk));

    for (const sensor of sensors) {
      const mesh = this.sensorMeshes.get(sensor.id);
      if (!mesh) {
        continue;
      }
      const material = mesh.material as THREE.MeshBasicMaterial;
      if (sensor.status === 'alert') {
        material.color.setHex(0xff6f61);
      } else if (sensor.status === 'watch') {
        material.color.setHex(0xffc14d);
      } else {
        material.color.setHex(0x5cf4da);
      }
    }
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize(mount: HTMLElement): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private addSky(): void {
    const skyGeometry = new THREE.SphereGeometry(950, 40, 24);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x08192b) },
        bottomColor: { value: new THREE.Color(0x235379) },
        offset: { value: 24 },
        exponent: { value: 0.48 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          float mixFactor = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, mixFactor), 1.0);
        }
      `
    });
    this.scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
  }

  private addLights(): void {
    this.scene.add(new THREE.AmbientLight(0x90cfff, 0.34));
    const keyLight = new THREE.DirectionalLight(0xfff0d5, 0.95);
    keyLight.position.set(120, 180, 60);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x1a71ba, 0.35);
    fillLight.position.set(-90, 55, -40);
    this.scene.add(fillLight);
    this.flameLight.position.set(-16, 49, -16);
    this.scene.add(this.flameLight);
    this.platformAlarmLight.position.set(0, 10, 0);
    this.platformGroup.add(this.platformAlarmLight);
  }

  private addSea(): void {
    const material = new THREE.MeshPhongMaterial({
      color: 0x05516f,
      specular: 0x39a4d8,
      shininess: 110,
      transparent: true,
      opacity: 0.88,
      flatShading: false // Changed to false for smooth water
    });
    const sea = new THREE.Mesh(this.seaGeometry, material);
    sea.rotation.x = -Math.PI / 2;
    this.scene.add(sea);

    const positions = this.seaGeometry.attributes.position.array as Float32Array;
    for (let index = 0; index < positions.length; index += 3) {
      this.waveMeta.push({
        baseZ: positions[index + 2],
        angle: Math.random() * Math.PI * 2,
        amplitude: 0.4 + Math.random() * 1.2,
        speed: 0.006 + Math.random() * 0.015
      });
    }
  }

  private addPlatform(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/platform.glb',
      (gltf: any) => {
        const model = gltf.scene;
        model.scale.setScalar(0.25); // Recalibrated
        model.position.set(0, 0, 0);
        this.platformGroup.add(model);
      },
      undefined,
      (err: any) => console.error('Platform GLB load error:', err)
    );

    this.scene.add(this.platformGroup);
  }

  private addShip(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/ship.glb',
      (gltf: any) => {
        const model = gltf.scene;
        model.scale.setScalar(0.3); // Shrunk 10x as requested
        const shipLight = new THREE.PointLight(0xff0000, 0, 80);
        shipLight.position.set(0, 10, 0);
        model.add(shipLight);
        model.userData.alarmLight = shipLight;
        this.shipGroup.add(model);
      },
      undefined,
      (err: any) => console.error('Ship GLB load error:', err)
    );

    this.shipGroup.position.set(160, 0, 0);
    this.scene.add(this.shipGroup);
  }

  private addSensitiveZone(): THREE.Mesh {
    const geometry = new THREE.TorusGeometry(1, 0.05, 12, 64);
    const ring = new THREE.Mesh(geometry, this.sensitiveZoneMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(24);
    ring.position.set(this.assetAnchors[2].position.x, 0.7, this.assetAnchors[2].position.z);
    ring.visible = false; // 用户要求去掉它的画面显示
    this.scene.add(ring);
    return ring;
  }

  private addBoomRing(): THREE.Mesh {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(100, 1.2, 12, 80), this.boomMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6;
    ring.visible = false;
    ring.userData.currentRadius = 100;
    this.scene.add(ring);
    return ring;
  }

  private addEvacuationLine(): THREE.Line {
    const points = [
      new THREE.Vector3(10, 23, 10),
      new THREE.Vector3(0, 23, 10),
      new THREE.Vector3(0, 18, 10),
      new THREE.Vector3(0, 18, 0),
      new THREE.Vector3(0, 18.1, 0)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x73f6a5 });
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    this.platformGroup.add(line);
    return line;
  }

  private addLeakBeacon(): { beacon: THREE.Mesh; halo: THREE.Mesh } {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7b63 }));
    beacon.position.set(-10, 22, -10);
    this.scene.add(beacon);

    // Label for leak beacon, made a child so it moves with the beacon
    const label = createTextSprite('泄漏源', '#ff7b63');
    label.position.set(0, 7, 0); // Relative to beacon
    beacon.add(label);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xff7b63, transparent: true, opacity: 0.12, depthWrite: false })
    );
    halo.position.copy(beacon.position);
    this.scene.add(halo);

    // Vertical guide line from leak beacon to sea level
    const linePoints = [beacon.position.clone(), new THREE.Vector3(beacon.position.x, 0, beacon.position.z)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineDashedMaterial({ color: 0xff7b63, dashSize: 1.5, gapSize: 1.0, transparent: true, opacity: 0.45 });
    const guideLine = new THREE.Line(lineGeo, lineMat);
    guideLine.computeLineDistances();
    this.scene.add(guideLine);

    return { beacon, halo };
  }

  private addSensors(): void {
    const sensorPoints: Array<{ id: string; type: string; label: string; position: [number, number, number] }> = [
      { id: 'wind-01', type: 'buoy', label: '风速浮标', position: [48, 1, 55] },
      { id: 'current-01', type: 'buoy', label: '海流浮标', position: [85, 1, -38] },
      { id: 'gas-01', type: 'sensor', label: '气体传感器', position: [-10, 30, -6] },
      { id: 'oil-01', type: 'sensor', label: '溢油传感器', position: [18, 1, 22] }
    ];

    const loader = new GLTFLoader();

    sensorPoints.forEach((sensorCfg) => {
      const group = new THREE.Group();
      group.position.set(sensorCfg.position[0], sensorCfg.position[1], sensorCfg.position[2]);

      // --- Smaller, refined sphere marker ---
      const haloNode = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x5cf4da, transparent: true, opacity: 0.85 })
      );
      haloNode.position.y = 3;
      group.add(haloNode);

      // --- Text label above sensor ---
      const label = createTextSprite(sensorCfg.label);
      label.position.y = 7;
      group.add(label);

      // --- Outer ring halo for sci-fi effect ---
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.0, 2.4, 32),
        new THREE.MeshBasicMaterial({ color: 0x5cf4da, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.position.y = 3;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      this.sensorRings.push(ring);

      // --- Vertical dashed guide line to sea surface ---
      const sensorY = sensorCfg.position[1];
      if (sensorY > 2) {
        const topPoint = new THREE.Vector3(0, 3, 0);  // local coordinates relative to group
        const bottomPoint = new THREE.Vector3(0, -sensorY, 0); // down to y=0 world
        const lineGeo = new THREE.BufferGeometry().setFromPoints([topPoint, bottomPoint]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0x5cf4da,
          dashSize: 1.2,
          gapSize: 0.8,
          transparent: true,
          opacity: 0.3
        });
        const guideLine = new THREE.Line(lineGeo, lineMat);
        guideLine.computeLineDistances();
        group.add(guideLine);
      }

      this.sensorMeshes.set(sensorCfg.id, haloNode);
      this.scene.add(group);

      const path = sensorCfg.type === 'buoy' ? '/models/buoy.glb' : '/models/sensor.glb';
      loader.load(
        path,
        (gltf: any) => {
          const model = gltf.scene;
          model.scale.setScalar(sensorCfg.type === 'buoy' ? 0.003 : 0.006);
          group.add(model);
        },
        undefined,
        (err: any) => console.error(`Sensor GLB load error for ${sensorCfg.id}:`, err)
      );
    });
  }
}
