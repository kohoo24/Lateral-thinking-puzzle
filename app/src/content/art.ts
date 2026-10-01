// 아트 파일(docs/08)과 클릭 위치. 파일은 app/public/art/에 넣으면 자동으로 쓰이고,
// 없으면 임시 화면을 그대로 쓴다. 클릭 위치는 그림 기준 백분율 [x, y, 너비, 높이]다.
import type { Hotspot, RoomId } from "../ui/rooms";
import type { DocId } from "./texts";

export type Box = [number, number, number, number];

export const ROOM_ART: Partial<Record<RoomId, { file: string; hotspots: Partial<Record<Hotspot, Box>> }>> = {
  watch: {
    file: "room-watch.png",
    hotspots: { journal: [10, 60, 22, 14], journalBack: [10, 75, 22, 7], record: [10, 83, 22, 7], frame: [42, 28, 16, 20], clock: [72, 10, 12, 16] },
  },
  stairs: { file: "room-stairs.png", hotspots: { door13: [40, 55, 20, 30] } },
  storeroom: { file: "room-storeroom.png", hotspots: { oathBox: [38, 45, 24, 30], letter: [56, 40, 12, 12], blankOath: [22, 72, 18, 14] } },
  entrance: { file: "room-entrance.png", hotspots: { register: [8, 35, 22, 20], frontDoor: [60, 15, 26, 70] } },
};

export const PAPER: Record<DocId, string> = {
  rules: "paper-log.png",
  memo: "paper-log.png",
  newspaper: "paper-news.png",
  register: "paper-register.png",
  letter: "paper-letter.png",
  oaths: "paper-oath.png",
};

export const TITLE_ART = "style-anchor.png";
export const DECK_ART = "deck.png";

const cache = new Map<string, Promise<string | null>>();

// 파일이 실제 이미지로 있으면 주소를, 없으면 null을 돌려준다
export function artUrl(file: string): Promise<string | null> {
  if (!cache.has(file)) {
    const url = `${import.meta.env.BASE_URL}art/${file}`;
    cache.set(
      file,
      fetch(url, { method: "HEAD" })
        .then((r) => (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/") ? url : null))
        .catch(() => null),
    );
  }
  return cache.get(file)!;
}
