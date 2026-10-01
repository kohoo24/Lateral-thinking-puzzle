// 등실 장면(PixiJS). 아트가 들어오기 전까지는 그레이디언트와 빛 효과만으로 그린다.
// 배의 불빛, 우리 신호등, 오염 단계별 변화(docs/05)를 담당한다.
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Pulse } from "./core/morse";
import type { Light } from "./core/state";

const HORIZON = 0.6;
const LIE_TINT = 0xb9d4ff; // 거짓 대답의 푸르스름한 빛
const WHITE = 0xfff6e8;
const LAMP_WARMTH = [0xffae55, 0xffb566, 0xe6c7a4, 0xc9c6c0, 0xa9b0b8];
const LIE_STRENGTH = [0.55, 0.4, 0.25, 0, 0]; // 3단계부터는 구분할 수 없다
const SHIP_OFFSET = [0, 0, 0.025, 0.05, 0.08]; // 가까워질수록 수평선 아래로
const SHIP_SCALE = [1, 1, 1.35, 1.7, 2.1];
const FOG_ALPHA = [0, 0.07, 0.09, 0.12, 0.15];
const VIGNETTE_ALPHA = [0.55, 0.68, 0.78, 0.86, 0.92];

function radialTexture(size: number, stops: [number, string][]): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

function backgroundTexture(w: number, h: number): Texture {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w / 2));
  c.height = Math.max(1, Math.floor(h / 2));
  const g = c.getContext("2d")!;
  const hy = c.height * HORIZON;
  const sky = g.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, "#04060a");
  sky.addColorStop(1, "#141b25");
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, hy);
  const sea = g.createLinearGradient(0, hy, 0, c.height);
  sea.addColorStop(0, "#0b1118");
  sea.addColorStop(1, "#030507");
  g.fillStyle = sea;
  g.fillRect(0, hy, c.width, c.height - hy);
  return Texture.from(c);
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [ar, ag, ab] = ch(a);
  const [br, bg, bb] = ch(b);
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

type Segment = { ms: number; v: number };
type Timeline = { segs: Segment[]; idx: number; t: number; set: (v: number) => void; onEnd?: (i: number) => void; resolve: () => void };

export class LampRoomScene {
  private app = new Application();
  private bg = new Sprite();
  private waves = new Graphics();
  private shipGlow = new Sprite();
  private shipCore = new Sprite();
  private reflection = new Sprite();
  private frame = new Graphics();
  private lampGlow = new Sprite();
  private fog = new Sprite(Texture.WHITE);
  private vignette = new Sprite();

  private stage = 0;
  private time = 0;
  shipIntensity = 0; // 대답 불빛 세기(0~1). 기본 상태에서도 배는 희미하게 보인다
  private shipColor = WHITE;
  private afterglow = 0.15; // 불빛이 꺼질 때의 감쇠 속도(단계가 오를수록 잔광이 길다)
  private target = 0;
  private lampPulse = 0; // 우리 신호등의 모스 깜빡임
  private lampSputter = false;
  private lampSway = 0;
  private echo = 0; // 4단계 수면 반사
  private rain = new Graphics();
  private silhouette = new Graphics();
  private flashOverlay = new Sprite(Texture.WHITE);
  private dawnOverlay = new Sprite(Texture.WHITE);
  private weather = 0; // 0~4 폭풍 단계
  private dawn = 0; // 0~1 새벽빛
  private drops: { x: number; y: number; len: number; speed: number }[] = [];
  private silhouetteShown = false;
  private timelines = new Set<Timeline>();

  async init(parent: HTMLElement) {
    await this.app.init({ resizeTo: window, background: 0x030507, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
    parent.appendChild(this.app.canvas);

    const glow = radialTexture(256, [[0, "rgba(255,255,255,0.9)"], [0.15, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]);
    const core = radialTexture(64, [[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.8)"], [1, "rgba(255,255,255,0)"]]);
    const warm = radialTexture(512, [[0, "rgba(255,255,255,0.55)"], [0.5, "rgba(255,255,255,0.15)"], [1, "rgba(255,255,255,0)"]]);
    const dark = radialTexture(512, [[0, "rgba(0,0,0,0)"], [0.55, "rgba(0,0,0,0.25)"], [1, "rgba(0,0,0,1)"]]);

    for (const s of [this.shipGlow, this.shipCore, this.reflection, this.lampGlow]) {
      s.anchor.set(0.5);
      s.blendMode = "add";
    }
    this.shipGlow.texture = glow;
    this.shipCore.texture = core;
    this.reflection.texture = glow;
    this.lampGlow.texture = warm;
    this.vignette.texture = dark;
    this.vignette.anchor.set(0.5);
    this.fog.tint = 0xcfd8e0;

    const world = new Container();
    this.dawnOverlay.tint = 0x8a95a3;
    this.dawnOverlay.alpha = 0;
    this.flashOverlay.tint = 0xdfe8ff;
    this.flashOverlay.alpha = 0;
    this.silhouette.alpha = 0;
    world.addChild(
      this.bg,
      this.dawnOverlay,
      this.silhouette,
      this.waves,
      this.reflection,
      this.shipGlow,
      this.shipCore,
      this.rain,
      this.fog,
      this.flashOverlay,
      this.frame,
      this.lampGlow,
      this.vignette,
    );
    this.app.stage.addChild(world);

    this.layout();
    this.app.renderer.on("resize", () => this.layout());
    // elapsedMS는 느린 프레임에서도 잘리지 않은 실제 경과 시간이다
    this.app.ticker.add((t) => this.tick(t.elapsedMS));
  }

  private get w() {
    return this.app.screen.width;
  }
  private get h() {
    return this.app.screen.height;
  }

  private layout() {
    const { w, h } = this;
    this.bg.texture = backgroundTexture(w, h);
    this.bg.width = w;
    this.bg.height = h;
    for (const o of [this.fog, this.flashOverlay]) {
      o.width = w;
      o.height = h;
    }
    this.dawnOverlay.width = w;
    this.dawnOverlay.height = h * HORIZON;
    this.drawSilhouette();
    this.vignette.position.set(w / 2, h / 2);
    this.vignette.width = w * 1.5;
    this.vignette.height = h * 1.5;
    this.lampGlow.position.set(w / 2, h * 1.05);
    this.lampGlow.width = w * 1.3;
    this.lampGlow.height = h * 0.9;

    // 등실 창틀: 세로 창살 두 개와 가로 창살 하나, 아래 난간
    const f = this.frame;
    f.clear();
    const bar = Math.max(10, w * 0.012);
    for (const x of [w * 0.33, w * 0.67]) f.rect(x - bar / 2, 0, bar, h).fill({ color: 0x0b0d10 });
    f.rect(0, h * 0.18, w, bar * 0.8).fill({ color: 0x0b0d10 });
    f.rect(0, h * 0.82, w, h * 0.18).fill({ color: 0x07080a });
    f.rect(0, h * 0.82, w, 3).fill({ color: 0x2a2520, alpha: 0.8 });
    this.applyStage();
  }

  // 번개가 칠 때 딱 한 번 드러나는 부서진 여객선의 형체(docs/05)
  private drawSilhouette() {
    const { x, y } = this.shipPos();
    const u = Math.max(0.6, this.h / 900) * 40;
    const g = this.silhouette;
    g.clear();
    g.poly([x - 4 * u, y, x - 3.2 * u, y - 0.9 * u, x - 1.2 * u, y - 1.1 * u, x - 0.8 * u, y - 2.4 * u, x - 0.4 * u, y - 2.4 * u, x - 0.3 * u, y - 1.2 * u, x + 1.6 * u, y - 1.0 * u, x + 2.2 * u, y - 0.2 * u, x + 3.4 * u, y + 0.4 * u])
      .fill({ color: 0x05070a });
    g.rect(x + 0.6 * u, y - 2.9 * u, 0.12 * u, 1.9 * u).fill({ color: 0x05070a });
  }

  private shipPos() {
    return { x: this.w * 0.58, y: this.h * (HORIZON + SHIP_OFFSET[this.stage]) };
  }

  setStage(stage: number) {
    this.stage = Math.min(stage, 4);
    this.applyStage();
  }

  private applyStage() {
    const s = this.stage;
    const { x, y } = this.shipPos();
    const scale = SHIP_SCALE[s] * Math.max(0.6, this.h / 900);
    this.shipGlow.position.set(x, y);
    this.shipGlow.scale.set(0.5 * scale);
    this.shipCore.position.set(x, y);
    this.shipCore.scale.set(0.28 * scale);
    this.reflection.position.set(x, y + this.h * 0.12);
    this.reflection.scale.set(0.12 * scale, 0.9 * scale);
    this.fog.alpha = FOG_ALPHA[s];
    this.vignette.alpha = VIGNETTE_ALPHA[s];
    this.lampGlow.tint = LAMP_WARMTH[s];
    this.afterglow = [0.2, 0.08, 0.07, 0.04, 0.03][s];
  }

  private tick(dtMs: number) {
    this.time += dtMs / 1000;
    this.advanceTimelines(dtMs);
    const k = this.target > this.shipIntensity ? 0.45 : this.afterglow;
    this.shipIntensity += (this.target - this.shipIntensity) * Math.min(1, k * (dtMs / 16.7));

    const idle = 0.18 + 0.03 * Math.sin(this.time * 1.3);
    const on = Math.min(1, idle + this.shipIntensity);
    this.shipCore.alpha = on;
    this.shipGlow.alpha = 0.25 + 0.75 * this.shipIntensity;
    this.reflection.alpha = 0.08 + 0.3 * this.shipIntensity + this.echo;
    this.shipCore.tint = this.shipGlow.tint = this.reflection.tint = this.shipColor;

    let lamp = 0.85 + (0.05 + this.weather * 0.02) * Math.sin(this.time * (2.1 + this.weather)) + this.lampPulse * 0.5;
    if (this.lampSputter) lamp = 0.35 + Math.random() * 0.6;
    this.lampGlow.alpha = lamp;
    this.lampGlow.rotation = Math.sin(this.time * 9) * 0.03 * this.lampSway;
    this.lampGlow.x = this.w / 2 + Math.sin(this.time * 7) * this.w * 0.02 * this.lampSway;

    this.dawnOverlay.alpha = this.dawn * 0.55;
    this.bg.tint = lerpColor(0xffffff, 0xc4ccd6, this.dawn);
    this.drawRain(dtMs);

    const g = this.waves;
    g.clear();
    const hy = this.h * HORIZON;
    for (let i = 0; i < 18; i++) {
      const y = hy + ((i + 1) ** 1.6) * this.h * 0.004;
      const drift = Math.sin(this.time * (0.6 + this.weather * 0.5) + i) * (20 + this.weather * 12);
      g.moveTo(-20 + drift, y).lineTo(this.w + 20 + drift, y).stroke({ width: 1, color: 0x6b7c8f, alpha: 0.05 + 0.02 * Math.sin(this.time + i * 1.7) });
    }
  }

  // 프레임 경과 시간으로 재생하는 타임라인. 타이머가 밀려도 깜빡임 길이가 정확하다.
  private play(segs: Segment[], set: (v: number) => void, onEnd?: (i: number) => void): Promise<void> {
    if (segs.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      set(segs[0].v);
      this.timelines.add({ segs, idx: 0, t: 0, set, onEnd, resolve });
    });
  }

  private advanceTimelines(dtMs: number) {
    for (const tl of this.timelines) {
      tl.t += dtMs;
      while (tl.idx < tl.segs.length && tl.t >= tl.segs[tl.idx].ms) {
        tl.t -= tl.segs[tl.idx].ms;
        tl.onEnd?.(tl.idx);
        tl.idx++;
        if (tl.idx < tl.segs.length) tl.set(tl.segs[tl.idx].v);
      }
      if (tl.idx >= tl.segs.length) {
        this.timelines.delete(tl);
        tl.resolve();
      }
    }
  }

  private flash(on: number, holdMs: number, offMs: number) {
    return this.play([{ ms: holdMs, v: on }, { ms: offMs, v: 0 }], (v) => (this.target = v));
  }

  // 우리 신호등이 질문을 모스 부호로 보낸다
  async sendSignal(pulses: Pulse[]) {
    await this.play(pulses.map((p) => ({ ms: p.ms, v: p.on ? 1 : 0 })), (v) => (this.lampPulse = v));
    this.lampPulse = 0;
  }

  // 배의 대답(docs/05 불빛 대답 4종). lie면 푸르스름한 빛이 섞인다
  async answer(light: Light, lie: boolean) {
    this.shipColor = lie ? lerpColor(WHITE, LIE_TINT, LIE_STRENGTH[this.stage]) : WHITE;
    const setTarget = (v: number) => (this.target = v);
    switch (light) {
      case "yes":
        await this.flash(1, 350, 700);
        break;
      case "no":
        await this.flash(1, 300, 300);
        await this.flash(1, 300, 700);
        break;
      case "irrelevant":
        await this.play([{ ms: 1300, v: 1 }], setTarget);
        this.afterglow = 0.02;
        await this.play([{ ms: 1400, v: 0 }], setTarget);
        this.applyStage();
        break;
      case "send_again":
        await this.play(
          [...Array.from({ length: 10 }, () => ({ ms: 200, v: 0.1 + Math.random() * 0.2 })), { ms: 400, v: 0 }],
          setTarget,
        );
        break;
      case "no_reach":
        await this.sputter();
        break;
    }
    this.shipColor = WHITE;
    if (this.stage >= 4 && light !== "no_reach") await this.playEcho();
  }

  // 신호가 닿지 않음: 배가 아니라 우리 신호등의 불꽃이 바람에 흩어진다
  async sputter() {
    await this.play([{ ms: 1300, v: 1 }], (v) => (this.lampSputter = v === 1));
    this.lampSputter = false;
  }

  // 4단계 메아리: 배의 등불이 아니라 수면 반사로 천천히 번진다
  private async playEcho() {
    const segs = [{ ms: 3000, v: 0 }, ...Array.from({ length: 21 }, (_, i) => ({ ms: 60, v: Math.sin((i / 20) * Math.PI) * 0.2 }))];
    await this.play(segs, (v) => (this.echo = v));
    this.echo = 0;
  }

  // 배가 먼저 모스 부호를 보낸다(1→2 전환: 플레이어의 이름). 글자 사이 간격이 지날 때마다 한 글자씩 해독된다
  async shipMorse(pulses: Pulse[], onLetter?: (i: number) => void) {
    const minOff = Math.min(...pulses.filter((p) => !p.on).map((p) => p.ms));
    let letter = 0;
    await this.play(
      pulses.map((p) => ({ ms: p.ms, v: p.on ? 0.8 : 0 })),
      (v) => (this.target = v),
      (i) => {
        if (!pulses[i].on && pulses[i].ms > minOff * 2) onLetter?.(letter++);
      },
    );
    this.target = 0;
    onLetter?.(letter);
  }

  // 0→1 전환: 등불이 한 번 크게 흔들린다
  async sway() {
    await this.play(Array.from({ length: 21 }, (_, i) => ({ ms: 60, v: 1 - i / 20 })), (v) => (this.lampSway = v));
    this.lampSway = 0;
  }

  private drawRain(dtMs: number) {
    const want = [0, 70, 160, 220, 260][this.weather];
    while (this.drops.length < want) this.drops.push({ x: Math.random() * this.w, y: Math.random() * this.h, len: 8 + Math.random() * 18, speed: 0.6 + Math.random() * 0.6 });
    if (this.drops.length > want) this.drops.length = want;
    const g = this.rain;
    g.clear();
    const slant = 0.15 + this.weather * 0.08;
    for (const d of this.drops) {
      d.y += d.speed * dtMs;
      d.x += d.speed * dtMs * slant;
      if (d.y > this.h) {
        d.y = -d.len;
        d.x = Math.random() * this.w;
      }
      g.moveTo(d.x, d.y).lineTo(d.x + d.len * slant, d.y + d.len).stroke({ width: 1, color: 0x9fb0c4, alpha: 0.18 });
    }
  }

  setWeather(phase: number) {
    this.weather = Math.min(4, phase);
  }

  setDawn(p: number) {
    this.dawn = p;
  }

  // 번개. showShip이면 배의 실루엣이 아주 짧게 드러난다(게임 전체에서 한 번)
  async lightning(showShip: boolean) {
    const reveal = showShip && !this.silhouetteShown;
    if (reveal) this.silhouetteShown = true;
    await this.play(
      [
        { ms: 70, v: 0.55 },
        { ms: 90, v: 0 },
        { ms: 160, v: 0.35 },
        { ms: 400, v: 0 },
      ],
      (v) => {
        this.flashOverlay.alpha = v;
        this.silhouette.alpha = reveal && v > 0 ? 1 : 0;
      },
    );
  }

  // 수칙 3의 유혹: 같은 간격의 세 번 깜빡임, 그 뒤 희미한 빛이 windowMs 동안 남는다
  async threeFlashes(windowMs: number) {
    this.shipColor = WHITE;
    for (let i = 0; i < 3; i++) await this.flash(0.9, 380, 380);
    await this.play([{ ms: windowMs, v: 0.12 }], (v) => (this.target = v));
    this.target = 0;
  }

  // 세 번 깜빡임에 대답했을 때: 배의 불빛이 한 번 길게 밝아진다
  async longGlow() {
    await this.play([{ ms: 1800, v: 1 }, { ms: 800, v: 0 }], (v) => (this.target = v));
  }

  // 서약으로 회복할 때: 등불이 한 번 따뜻하게 밝아진다
  async warmPulse() {
    await this.play(Array.from({ length: 20 }, (_, i) => ({ ms: 60, v: Math.sin((i / 19) * Math.PI) })), (v) => (this.lampPulse = v));
    this.lampPulse = 0;
  }

  // 35분 마지막 경고: 등불이 크게 흔들린다
  async bigSway() {
    await this.play(Array.from({ length: 30 }, (_, i) => ({ ms: 60, v: 2 * (1 - i / 29) })), (v) => (this.lampSway = v));
    this.lampSway = 0;
  }

  lampOut() {
    this.lampGlow.visible = false;
    this.target = 0;
  }
}
