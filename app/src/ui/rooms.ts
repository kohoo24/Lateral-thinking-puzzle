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

const HOTSPOTS: Record<RoomId, Hotspot[]> = {
  lamp: [],
  watch: ["journal", "journalBack", "frame", "clock", "record"],
  stairs: ["door13"],
  storeroom: ["oathBox", "letter", "blankOath"],
  entrance: ["register", "frontDoor"],
};

export class Rooms {
  current: RoomId = "lamp";
  private overlay = el("div", "room");
  private nav = el("nav", "roomnav");

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

  async go(room: RoomId) {
    if (!(await this.opts.canEnter(room))) return;
    document.body.classList.add("moving");
    await new Promise((r) => setTimeout(r, 450));
    this.current = room;
    this.render();
    this.opts.onEnter(room);
    document.body.classList.remove("moving");
  }

  // 그림이 있으면 배경으로 깔고 소품 버튼을 그림 위 제자리에 놓는다
  private async applyArt(room: RoomId, spots: HTMLElement, buttons: [Hotspot, HTMLButtonElement][]) {
    const art = ROOM_ART[room];
    const url = art && (await artUrl(art.file));
    if (!art || !url || this.current !== room) return;
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

  render() {
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
      void this.applyArt(room, spots, buttons);
    }
    this.nav.replaceChildren(
      ...LINKS[room].map((to) => {
        const b = el("button", "", `${t.go}: ${t[`room_${to}`]}`);
        b.type = "button";
        b.addEventListener("click", () => void this.go(to));
        return b;
      }),
    );
  }
}
