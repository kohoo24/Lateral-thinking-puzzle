// 등대 안 다섯 곳(docs/07). 등실은 PixiJS 장면이고, 나머지는 아트가 들어오기 전까지 임시 화면으로 그린다.
import { artUrl, ROOM_ART } from "../content/art";
import type { Strings } from "../i18n";
import { el } from "./dom";

export type RoomId = "lamp" | "watch" | "stairs" | "storeroom" | "entrance";
export type Hotspot = "journal" | "journalBack" | "frame" | "clock" | "record" | "door13" | "oathBox" | "letter" | "blankOath" | "register" | "frontDoor";

// 1층 입구 ↔ 계단 ↔ 2층 당직실 ↔ 꼭대기 등실, 계단 13번째 칸 아래 창고
const LINKS: Record<RoomId, RoomId[]> = {
  lamp: ["watch"],
  watch: ["lamp", "stairs"],
  stairs: ["watch", "entrance", "storeroom"],
  storeroom: ["stairs"],
  entrance: ["stairs"],
};

// 이동 버튼의 화살표: 위층이면 ↑, 아래층이면 ↓
const FLOOR: Record<RoomId, number> = { lamp: 4, watch: 3, stairs: 2, storeroom: 1, entrance: 1 };

const HOTSPOTS: Record<RoomId, Hotspot[]> = {
  lamp: [],
  watch: ["journal", "journalBack", "frame", "clock", "record"],
  stairs: ["door13"],
  storeroom: ["oathBox", "letter", "blankOath"],
  entrance: ["register", "frontDoor"],
};

export class Rooms {
  current: RoomId = "lamp";
  // 한 번이라도 이동하기 전까지 이동 버튼을 은은하게 깜빡여 눈에 띄게 한다
  moved = false;
  private overlay = el("div", "room");
  private nav = el("nav", "roomnav");
  // 방 그림: 주소를 찾고 실제로 디코딩까지 끝낸 것(없으면 null). 그림이 준비된 뒤에 방을 그려야
  // 소품 버튼이 먼저 보였다가 그림 위로 옮겨지는 깜빡임이 없다
  private art = new Map<RoomId, Promise<string | null>>();
  private artReady = new Map<RoomId, string | null>();

  constructor(
    private t: () => Strings,
    private opts: {
      canEnter: (room: RoomId) => boolean | Promise<boolean>;
      onEnter: (room: RoomId) => void;
      onHotspot: (h: Hotspot) => void;
      hotspotVisible: (h: Hotspot) => boolean;
    },
  ) {
    this.overlay.hidden = true;
    document.getElementById("ui")!.append(this.overlay, this.nav);
    this.render();
  }

  // 방 그림을 미리 불러 둔다(게임 시작 때 한 번)
  preload() {
    for (const room of Object.keys(ROOM_ART) as RoomId[]) void this.loadArt(room);
  }

  private loadArt(room: RoomId): Promise<string | null> {
    if (!this.art.has(room)) {
      const file = ROOM_ART[room]?.file;
      this.art.set(
        room,
        (async () => {
          const url = file ? await artUrl(file) : null;
          if (!url) return null;
          const img = new Image();
          img.src = url;
          await img.decode().catch(() => undefined);
          return url;
        })().then((url) => {
          this.artReady.set(room, url);
          return url;
        }),
      );
    }
    return this.art.get(room)!;
  }

  async go(room: RoomId) {
    if (!(await this.opts.canEnter(room))) return;
    this.moved = true;
    document.body.classList.add("moving");
    // 화면이 어두워지는 동안 그림을 준비하고, 준비된 그림과 소품을 한꺼번에 그린다
    const [url] = await Promise.all([this.loadArt(room), new Promise((r) => setTimeout(r, 450))]);
    this.current = room;
    this.render(url);
    this.opts.onEnter(room);
    document.body.classList.remove("moving");
  }

  // 그림이 있으면 배경으로 깔고 소품 버튼을 그림 위 제자리에 놓는다
  private applyArt(room: RoomId, url: string, spots: HTMLElement, buttons: [Hotspot, HTMLButtonElement][]) {
    const art = ROOM_ART[room]!;
    const stage = el("div", "room-art");
    stage.style.backgroundImage = `url("${url}")`;
    for (const [h, b] of buttons) {
      const box = art.hotspots[h];
      if (!box) {
        // 그림에 자리가 없는 소품은 감춘다(예: 일지 맨 뒷장은 일지 안에서 넘긴다)
        b.remove();
        continue;
      }
      b.classList.add("on-art");
      Object.assign(b.style, { left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2]}%`, height: `${box[3]}%` });
      stage.append(b);
    }
    this.overlay.prepend(stage);
    this.overlay.classList.add("has-art");
    if (!spots.children.length) spots.remove();
  }

  // url: 이 방의 그림(준비된 것). 생략하면 이미 준비된 그림을 쓴다(언어 전환 등 다시 그리기)
  render(url: string | null = this.artReady.get(this.current) ?? null) {
    const t = this.t();
    const room = this.current;
    document.body.dataset.room = room;
    this.overlay.hidden = room === "lamp";
    this.overlay.classList.remove("has-art");
    this.overlay.replaceChildren();
    if (room !== "lamp") {
      this.overlay.append(el("h2", "room-title", t[`room_${room}`]));
      const spots = el("div", "hotspots");
      const buttons: [Hotspot, HTMLButtonElement][] = [];
      for (const h of HOTSPOTS[room]) {
        if (!this.opts.hotspotVisible(h)) continue;
        const b = el("button", `hotspot hs-${h}`, t[`hs_${h}`]);
        b.type = "button";
        b.addEventListener("click", () => this.opts.onHotspot(h));
        spots.append(b);
        buttons.push([h, b]);
      }
      this.overlay.append(spots);
      if (url) this.applyArt(room, url, spots, buttons);
    }
    this.nav.classList.toggle("unmoved", !this.moved);
    this.nav.replaceChildren(
      ...LINKS[room].map((to) => {
        const arrow = FLOOR[to] > FLOOR[room] ? "↑" : "↓";
        const b = el("button", "", `<span class="arrow">${arrow}</span>${t.go}: ${t[`room_${to}`]}`);
        b.type = "button";
        b.addEventListener("click", () => void this.go(to));
        return b;
      }),
    );
  }
}
