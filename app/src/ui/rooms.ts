// 등대 안 다섯 곳(docs/07). 등실은 PixiJS 장면이고, 나머지는 아트가 들어오기 전까지 임시 화면으로 그린다.
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

  render() {
    const t = this.t();
    const room = this.current;
    document.body.dataset.room = room;
    this.overlay.hidden = room === "lamp";
    this.overlay.replaceChildren();
    if (room !== "lamp") {
      this.overlay.append(el("h2", "room-title", t[`room_${room}`]));
      const spots = el("div", "hotspots");
      for (const h of HOTSPOTS[room]) {
        if (!this.opts.hotspotVisible(h)) continue;
        const b = el("button", `hotspot hs-${h}`, t[`hs_${h}`]);
        b.type = "button";
        b.addEventListener("click", () => this.opts.onHotspot(h));
        spots.append(b);
      }
      this.overlay.append(spots);
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
