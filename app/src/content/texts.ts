// 플레이어가 읽는 글(docs/04)과 엔딩 문안(docs/06). 단서 속 글은 영어 원문을 그대로 두고,
// 한국어로 플레이하면 번역을 자막처럼 붙인다(필체 단서는 번역하지 않는다).
import type { Lang } from "../core/rules";

export type Hand = "owen" | "brooks" | "hale" | "haleWet" | "crane" | "tanner" | "player" | "print";

export type DocContext = { lang: Lang; stage: number; playerName: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function line(ctx: DocContext, en: string, ko: string, hand: Hand, extra = "") {
  const sub = ctx.lang === "ko" && ko ? `<span class="sub">${esc(ko)}</span>` : "";
  return `<p class="hand-${hand} ${extra}">${esc(en)}${sub}</p>`;
}

export type DocId = "rules" | "memo" | "newspaper" | "register" | "letter" | "oaths";

export const DOC_TITLES: Record<DocId, Record<Lang, string>> = {
  rules: { en: "Keeper's log — night rules", ko: "근무 일지 — 야간 수칙" },
  memo: { en: "Keeper's log — inside back cover", ko: "근무 일지 — 맨 뒷장" },
  newspaper: { en: "Newspaper clipping", ko: "신문 조각" },
  register: { en: "Keeper's register", ko: "등대지기 명부" },
  letter: { en: "Letter in the oath box", ko: "서약서 상자 속 편지" },
  oaths: { en: "Keepers' oaths", ko: "역대 서약서" },
};

const RULES: [string, string, Hand, string][] = [
  ["After sundown, never let the lamp go out.", "해가 진 뒤에는 절대 등불을 꺼뜨리지 마시오.", "owen", "Nov 1953"],
  ["When the ship signals, you must answer.", "배가 신호를 보내면 반드시 대답하시오.", "haleWet", "Nov 15, 1983"],
  ["Do not answer three flashes.", "세 번 깜빡이는 신호에는 대답하지 마시오.", "owen", "Nov 1953"],
  ["Never ask the ship its name.", "배에게 이름을 묻지 마시오.", "owen", "Nov 1953"],
  ["Do not open the door beneath the thirteenth stair.", "계단 열세 번째 칸 아래의 문은 열지 마시오.", "owen", "Nov 1953"],
  ["If the keeper before you returns, do not let him in.", "전임자가 돌아와도 등대 안에 들이지 마시오.", "brooks", "Nov 1976"],
];

export function renderDoc(id: DocId, ctx: DocContext): string {
  switch (id) {
    case "rules": {
      const rows = RULES.map(([en, ko, hand, date], i) => {
        // 오염 1단계부터 일지를 다시 펼치면 오웬의 필체 일부가 번진 잉크로 바뀌어 있다(docs/05)
        let text = esc(en);
        if (ctx.stage >= 1 && i === 2) text = text.replace("three flashes", '<span class="hand-haleWet">three flashes</span>');
        const scratched = i === 1 ? " scratched" : "";
        const sub = ctx.lang === "ko" ? `<span class="sub">${esc(ko)}</span>` : "";
        return `<li class="hand-${hand}${scratched}"><span class="num">${i + 1}.</span> ${text}<span class="date">${date}</span>${sub}</li>`;
      }).join("");
      const answers = ctx.stage >= 1 ? `<div class="answers">${Array.from({ length: ctx.stage * 3 }, () => '<p class="hand-haleWet">answer</p>').join("")}</div>` : "";
      return `<h3 class="print">KEEPER'S NIGHT RULES${ctx.lang === "ko" ? '<span class="sub">등대지기 야간 수칙</span>' : ""}</h3><ol class="rules">${rows}</ol>${answers}`;
    }
    case "memo":
      return [
        line(ctx, "They shine differently only when they speak of themselves.", "그들은 자기 얘기를 할 때만 다르게 빛난다.", "owen"),
        line(ctx, "Do not answer. Do not ask. Keep the lamp.", "대답하지 마라. 묻지도 마라. 등불을 지켜라.", "owen"),
        line(ctx, "Dawn comes. It always has.", "새벽은 온다. 언제나 그랬다.", "owen"),
        line(ctx, "Eighteen Novembers, and I never answered once.", "열여덟 번의 11월, 나는 한 번도 대답하지 않았다.", "owen"),
        line(ctx, "— M.O.", "", "owen", "sign"),
      ].join("");
    case "newspaper":
      return `<div class="paper">
        <p class="masthead">THE COASTAL HERALD — November 16, 1951</p>
        <h3 class="headline">32 LOST AS MARGARET RAYNE STRIKES BLACKTEETH REEF</h3>
        ${line(ctx, "The passenger steamer Margaret Rayne, bound for the mainland, went down off Belmore Isle on the night of November 14 during a violent storm. All 32 souls aboard are presumed lost.", "본토로 향하던 여객선 마거릿 레인호가 11월 14일 밤 거센 폭풍 속에 벨모어 섬 앞바다에서 침몰했다. 탑승자 32명은 전원 사망한 것으로 추정된다.", "print")}
        ${line(ctx, "The Lighthouse Board has stated that a faulty wick caused the Belmore lamp to fail shortly after dusk. Keeper Elias Crane reported that he worked through the night to restore the light.", "등대위원회는 불량 심지 때문에 벨모어 등대의 등불이 해 질 무렵 꺼졌다고 밝혔다. 등대지기 일라이어스 크레인은 밤새 불을 되살리려 애썼다고 진술했다.", "print")}
        ${line(ctx, "An inquiry is not expected.", "조사는 열리지 않을 것으로 보인다.", "print")}
        <div class="corner">
          <h4>FISHERMAN: "THAT LIGHT NEVER CAME ON"</h4>
          ${line(ctx, 'A local fisherman, who asked not to be named, insists the Belmore lamp was dark "from dusk to dawn." "I saw no light on that tower all night," he said. "Only lanterns, down at North Cove." The Board has dismissed the account.', '이름을 밝히지 않은 한 지역 어부는 벨모어 등대가 "해 질 녘부터 새벽까지" 어두웠다고 주장했다. "그 탑에서는 밤새 불빛 하나 못 봤다. 북쪽 만 아래쪽에 등불 몇 개가 보였을 뿐이다." 위원회는 이 증언을 일축했다.', "print")}
        </div>
        <div class="margin">
          ${line(ctx, "Dark from dusk? Then it never failed. It was never lit.", "해 질 녘부터 어두웠다고? 그럼 고장 난 게 아니다. 처음부터 안 켰다.", "hale")}
          ${line(ctx, "Who was at North Cove?", "북쪽 만에는 누가 있었지?", "hale")}
        </div>
      </div>`;
    case "register": {
      const rows: [string, string, string, Hand][] = [
        ["Elias Crane", "March 1946", "November 14, 1952", "crane"],
        ["Martin Owen", "January 1953", "Retired, October 1971", "owen"],
        ["Will Tanner", "February 1972", "November 14, 1975", "tanner"],
        ["Helen Brooks", "March 1976", "Retired, September 1982", "brooks"],
        ["Thomas Hale", "April 1983", "November 14, 1983", "hale"],
        [ctx.playerName, "November 14, 1984", "", "player"],
      ];
      const head = ctx.lang === "ko" ? "<tr><th>Keeper / 등대지기</th><th>Arrived / 부임</th><th>Final entry / 마지막 기록</th></tr>" : "<tr><th>Keeper</th><th>Arrived</th><th>Final entry</th></tr>";
      return `<h3 class="print">BELMORE LIGHT — KEEPER'S REGISTER</h3><table class="register">${head}${rows
        .map(([n, a, f, hand]) => `<tr class="hand-${hand}"><td>${esc(n)}</td><td>${a}</td><td>${f}</td></tr>`)
        .join("")}</table>`;
    }
    case "letter":
      return [
        line(ctx, "November 14, 1952", "1952년 11월 14일", "crane"),
        line(ctx, "To whoever keeps this light after me,", "나 다음으로 이 등불을 지킬 누군가에게,", "crane"),
        line(ctx, "The lamp did not fail. I put it out. Men from North Cove paid me forty pounds to keep the coast dark for one night. I did not know the Rayne was out there. I have told myself that every day for a year.", "등불은 고장 나지 않았다. 내가 껐다. 북쪽 만의 사내들이 하룻밤만 해안을 어둡게 해달라며 40파운드를 줬다. 레인호가 거기 있는 줄은 몰랐다. 1년 동안 매일 그렇게 스스로에게 말해왔다.", "crane"),
        line(ctx, "She came back tonight. She is signaling. I think she wants to hear me say it.", "오늘 밤 그 배가 돌아왔다. 신호를 보내고 있다. 내 입으로 그 말을 듣고 싶은 것 같다.", "crane"),
        line(ctx, "So I will answer her. I will answer her until she forgives me.", "그러니 대답하겠다. 그 배가 나를 용서할 때까지 대답하겠다.", "crane"),
        line(ctx, "If you are reading this, I did not come back. Do not do as I did.", "이걸 읽고 있다면 나는 돌아오지 못한 것이다. 나처럼 하지 마라.", "crane"),
        line(ctx, "— E. Crane", "", "crane", "sign"),
      ].join("");
    case "oaths": {
      const oaths: [string, number, Hand, "clear" | "blurred" | "blurring"][] = [
        ["Elias Crane", 1946, "crane", "blurred"],
        ["Martin Owen", 1953, "owen", "clear"],
        ["Will Tanner", 1972, "tanner", "blurred"],
        ["Helen Brooks", 1976, "brooks", "clear"],
        ["Thomas Hale", 1983, "hale", "blurring"],
      ];
      return oaths
        .map(
          ([name, year, hand, state]) => `<div class="oath">
          <p class="print">OATH OF THE KEEPER — ${year}</p>
          <p class="print small">I, <span class="hand-${hand} name ${state}">${esc(name)}</span>, do solemnly swear to keep the light of Belmore until I am relieved, and to let no darkness fall upon the water while this post is mine.</p>
          <p class="print small">Signed: <span class="hand-${hand} name ${state}">${esc(name)}</span></p>
        </div>`,
        )
        .join("");
    }
  }
}

export const OATH_FORM: Record<Lang, string> = {
  en: "I, ____________, do solemnly swear to keep the light of Belmore until I am relieved, and to let no darkness fall upon the water while this post is mine.",
  ko: "나 ____________ 은(는) 교대될 때까지 벨모어의 등불을 지키며, 이 자리가 내 것인 동안 바다 위에 어둠이 내리지 않게 할 것을 엄숙히 서약한다.",
};

// 수칙 6 이벤트: 문밖의 헤일(docs/05). 3번 대사는 오염 2단계 이상일 때만.
export const HALE_LINES: { en: string; ko: string; minStage: number }[] = [
  { en: "Hello? It's Tom. Tom Hale. I was the keeper here.", ko: "저기요? 톰이에요. 톰 헤일. 여기 등대지기였어요.", minStage: 0 },
  { en: "I got lost on the rocks. Please, it's freezing.", ko: "바위 쪽에서 길을 잃었어요. 제발요, 너무 추워요.", minStage: 0 },
  { en: "You answered them, didn't you? I can hear it on you.", ko: "그들한테 대답했죠? 당신한테서 들려요.", minStage: 2 },
  { en: "Just open the door. I'll keep the lamp with you.", ko: "문만 열어줘요. 등불은 같이 지킬게요.", minStage: 0 },
];

export const STAGE_NAMES: Record<Lang, string[]> = {
  en: ["Calm", "Seeping", "Name", "Erosion", "Last Words"],
  ko: ["평온", "스며듦", "이름", "침식", "마지막 말"],
};

export const ENDING_TEXT = {
  true: {
    title: "The Keeper",
    en: [
      "You close the shutter on the signal lamp.",
      "Out on the water, the ship flashes three times. Then three times again. You do not answer.",
      "The storm passes over Belmore. The lamp burns on.",
      "When the sky turns grey, the sea is empty.",
      "You open the register, and beneath your name you write: November 15, 1984.",
    ],
    ko: [
      "당신은 신호등의 덮개를 닫는다.",
      "바다 위에서 배가 세 번 깜빡인다. 그리고 다시 세 번. 당신은 대답하지 않는다.",
      "폭풍이 벨모어를 지나간다. 등불은 꺼지지 않는다.",
      "하늘이 잿빛으로 밝아올 때, 바다는 비어 있다.",
      "당신은 방명록을 펼치고, 자기 이름 아래에 적는다. 1984년 11월 15일.",
    ],
  },
  hidden: {
    title: "Eighteen Novembers",
    en: [
      "The ship signals. You do not answer.",
      "It signals all night. You keep the lamp.",
      "At dawn, beneath your name in the register, you write the date.",
      "Then, on the last page of the log, in your own hand:",
      "Do not answer. Do not ask. Keep the lamp.",
    ],
    ko: [
      "배가 신호를 보낸다. 당신은 대답하지 않는다.",
      "밤새 신호가 온다. 당신은 등불을 지킨다.",
      "새벽, 방명록의 이름 아래에 날짜를 적는다.",
      "그리고 일지 마지막 장에, 당신의 글씨로 적는다.",
      "대답하지 마라. 묻지도 마라. 등불을 지켜라.",
    ],
  },
  partial: {
    title: "The Blurred Name",
    en: [
      "The storm passes. You are still here.",
      "You open the register to write the date beneath your name.",
      "The ink of your name has run, as if it had been left out in the rain. You can still read some of it. Not all.",
      "You write the date anyway.",
      "Next November, you think, you might answer.",
    ],
    ko: [
      "폭풍이 지나간다. 당신은 아직 여기 있다.",
      "이름 아래에 날짜를 적으려고 방명록을 펼친다.",
      "당신의 이름이 비에 젖은 듯 번져 있다. 일부는 아직 읽을 수 있다. 전부는 아니다.",
      "그래도 날짜를 적는다.",
      "다음 11월에는, 어쩌면 대답할지도 모른다는 생각이 든다.",
    ],
  },
  bad: {
    title: "The Next Keeper",
    en: ["November 14, 1985", "The ship has a new name."],
    ko: ["1985년 11월 14일", "배에게 새 이름이 생겼다."],
  },
} as const;

export const TEASER: Record<Lang, string> = {
  en: "Eighteen Novembers, and I never answered once.",
  ko: "열여덟 번의 11월, 나는 한 번도 대답하지 않았다.",
};
