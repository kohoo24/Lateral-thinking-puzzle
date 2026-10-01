// 아트 파일(docs/08)과 클릭 위치. 파일은 app/public/art/에 넣으면 자동으로 쓰이고,
// 없으면 임시 화면을 그대로 쓴다. 클릭 위치는 그림 기준 백분율 [x, y, 너비, 높이]다.
import type { Hotspot, RoomId } from "../ui/rooms";
import type { DocId } from "./texts";

export type Box = [number, number, number, number];

export const ROOM_ART: Partial<Record<RoomId, { file: string; hotspots: Partial<Record<Hotspot, Box>> }>> = {
  watch: {
    file: "room-watch.png",
    // 확정 그림 기준: 일지(책상 위 가죽 장정), 펜(기록 쓰기), 액자, 벽시계. 일지 맨 뒷장은 일지 안에서 넘긴다
    hotspots: { journal: [11, 72, 27, 12], record: [20, 84, 12, 5], frame: [31, 23, 14, 21], clock: [63, 18, 10, 14] },
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

// 파일이 실제 이미지로 있으면 주소를, 없으면 null을 돌려준다.
// 확장자는 상관없다: 같은 이름의 .webp, .png, .jpg 중 있는 것을 쓴다(ChatGPT 다운로드 형식이 제각각이라서).
const EXTENSIONS = ["webp", "png", "jpg", "jpeg"];

async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

export function artUrl(file: string): Promise<string | null> {
  if (!cache.has(file)) {
    const base = `${import.meta.env.BASE_URL}art/${file.replace(/\.[a-z]+$/i, "")}`;
    cache.set(
      file,
      (async () => {
        for (const ext of EXTENSIONS) if (await probe(`${base}.${ext}`)) return `${base}.${ext}`;
        return null;
      })(),
    );
  }
  return cache.get(file)!;
}
