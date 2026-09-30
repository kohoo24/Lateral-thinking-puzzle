import type { Lang } from "./core/rules";

const STRINGS = {
  en: {
    subtitle: "Belmore Light — the night of November 14, 1984",
    register: "Sign the keeper's register.",
    namePlaceholder: "Your name",
    start: "Take the watch",
    placeholder: "Write your question to the ship…",
    lever: "Send signal",
    kerosene: "Kerosene",
    log: "Signal log",
    empty: "Write a question first.",
    reserve: "The last of the oil belongs to the lamp. Hold the lever to pull it anyway.",
    firstSignal: "Out on the water, a light is signaling.",
    nameSignal: "The ship signals, unasked:",
    badLamp: "The lamp goes out. In the dark, something touches the rocks.",
    badContamination: "You have no words left. The ship has a new name.",
    restart: "Take the watch again",
    judgeMock: "Development judge (mock)",
  },
  ko: {
    subtitle: "벨모어 등대 — 1984년 11월 14일 밤",
    register: "등대지기 명부에 이름을 적으세요.",
    namePlaceholder: "이름",
    start: "당직 시작",
    placeholder: "배에게 보낼 질문을 적으세요…",
    lever: "신호 보내기",
    kerosene: "등유",
    log: "교신 기록",
    empty: "먼저 질문을 적으세요.",
    reserve: "마지막 기름은 등불 몫이다. 그래도 당기려면 레버를 길게 누르세요.",
    firstSignal: "바다 위에서 불빛 하나가 신호를 보낸다.",
    nameSignal: "묻지도 않았는데 배가 신호를 보낸다:",
    badLamp: "등불이 꺼진다. 어둠 속에서 무언가가 바위에 닿는다.",
    badContamination: "남은 말이 없다. 배에게 새 이름이 생겼다.",
    restart: "다시 당직 서기",
    judgeMock: "개발용 판정(mock)",
  },
} satisfies Record<Lang, Record<string, string>>;

export type Strings = (typeof STRINGS)["en"];
export const strings = (lang: Lang): Strings => STRINGS[lang];

// 대답 규칙 카드는 게임 속 소품이라 영어 원문에 번역을 붙인다(docs/04 원칙)
export const RULE_CARD = {
  en: ["one flash — yes", "two — no", "long — no matter", "flicker — ask again"],
  ko: ["한 번 — 예", "두 번 — 아니오", "길게 — 상관없음", "떨림 — 다시 물어라"],
};

export const LIGHT_MARK: Record<string, string> = {
  yes: "·",
  no: "· ·",
  irrelevant: "—",
  send_again: "∿",
  no_reach: "✕",
};
