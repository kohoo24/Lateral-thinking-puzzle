// 아트 파일(docs/08)과 소품 모양. 파일은 app/public/art/에 넣으면 자동으로 쓰이고,
// 없으면 임시 화면을 그대로 쓴다. 소품 모양은 그림 기준 백분율 좌표로, 물건의 윤곽을 따라
// 다각형(poly: [x, y] 꼭짓점들) 또는 타원(ellipse: [중심 x, 중심 y, 가로 반지름, 세로 반지름])으로 적는다.
// 이 모양대로 은은한 윤곽을 그리고, 모양 안쪽만 눌린다.
import type { Hotspot, RoomId } from "../ui/rooms";
import type { DocId } from "./texts";

export type Shape = { poly: [number, number][] } | { ellipse: [number, number, number, number] };

export const ROOM_ART: Partial<Record<RoomId, { file: string; hotspots: Partial<Record<Hotspot, Shape>> }>> = {
  watch: {
    file: "room-watch.png",
    // 확정 그림 기준: 일지(책상 위 가죽 장정), 펜(기록 쓰기), 액자, 벽시계. 일지 맨 뒷장은 일지 안에서 넘긴다
    hotspots: {
      journal: { poly: [[12, 76], [15, 74], [35, 72], [37, 74.5], [37, 79.5], [28, 83.8], [12, 81.5]] },
      record: { poly: [[20.5, 86.9], [30, 84.4], [30.6, 86.4], [21, 88.8]] },
      frame: { poly: [[32.5, 24], [44.8, 26], [43.5, 44], [30.8, 42]] },
      clock: { ellipse: [67.8, 24, 4.7, 7] },
    },
  },
  // 위가 둥근 나무 문
  stairs: {
    file: "room-stairs.png",
    hotspots: { door13: { poly: [[50.3, 70], [50.3, 39], [52, 36.2], [55, 34.8], [58.5, 34.8], [61.5, 36.3], [64, 39.5], [64.5, 44], [64, 64.5]] } },
  },
  // 봉투는 열린 상자 위에 놓여 있어 모양이 겹친다. 뒤에 그린 봉투가 위에 온다
  storeroom: {
    file: "room-storeroom.png",
    hotspots: {
      oathBox: { poly: [[36.3, 23.5], [73.5, 26.5], [72.5, 47], [70.5, 57], [69.5, 77], [66, 83.5], [32.5, 76], [31.5, 54.5], [37, 47], [36.5, 30]] },
      letter: { poly: [[59.8, 50.3], [66.8, 51.8], [65.8, 57.5], [59.2, 54.5]] },
      blankOath: { poly: [[14, 84.5], [26.5, 78.5], [32, 87.5], [19.5, 91.5]] },
    },
  },
  entrance: {
    file: "room-entrance.png",
    hotspots: {
      register: { poly: [[4.5, 45.5], [7, 44], [20, 44], [25.5, 46.5], [25.5, 48.5], [14, 52.5], [4.5, 50.5]] },
      frontDoor: { poly: [[61, 12.5], [85, 9.5], [85.5, 77], [61, 74]] },
    },
  },
};

// 모양을 감싸는 상자 [x, y, 너비, 높이]
export function shapeBox(s: Shape): [number, number, number, number] {
  if ("ellipse" in s) {
    const [cx, cy, rx, ry] = s.ellipse;
    return [cx - rx, cy - ry, rx * 2, ry * 2];
  }
  const xs = s.poly.map((p) => p[0]);
  const ys = s.poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

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
// 번개 칠 때 한 번 드러나는 부서진 여객선(투명 배경)
export const WRECK_ART = "wreck-silhouette.png";

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

// 그림을 미리 내려받아 디코딩해 둔다. 처음 열 때 글씨나 버튼이 먼저 보였다가 그림이 늦게 깔리지 않게 한다.
export function preloadArt(files: string[]) {
  for (const file of files) {
    void artUrl(file).then((url) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
      void img.decode().catch(() => undefined);
    });
  }
}
