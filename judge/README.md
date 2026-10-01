# 판정 서버와 판정 테스트 (M0)

Answer in Light의 AI 판정을 담당합니다. 판정 AI는 **TypeSafe Jev**(System One 모델)입니다. Jev는 글을 생성하지 않고 이름 붙은 질문마다 확률이 붙은 타입 결과(예/아니오 확률, 선택지별 확률)를 돌려주므로, "AI는 판정만 한다"는 기획 의도와 맞습니다. 플레이어의 질문, 서약, 최종 제출을 판정하고 게임 규칙에 따라 배의 불빛과 오염 점수로 바꿉니다. 게임 클라이언트는 이 서버만 호출하며, API 키는 서버에만 둡니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `scripts/extract-content.ts` | `docs/02`(사실 목록)와 `docs/03`(검증 질문 세트)의 표를 `content/*.json`으로 옮깁니다. 문서가 원본입니다 |
| `src/prompt.ts` | 판정 규칙 문장. 사실 목록, 판정 원칙, 수칙 4 규칙, 제출 인정 기준(모든 백엔드 공용) |
| `src/jev-judge.ts` | **Jev 백엔드(기본)**. 판정을 System One 질문 5개(choice·noul)로 보내고, 확률을 구간(`THRESHOLDS`)으로 끊어 판정으로 바꿉니다 |
| `src/backends.ts` | 백엔드 선택: `jev`(기본), `claude`(비교용), `mock`(개발용) |
| `src/mock-judge.ts` | 개발용 가짜 판정(키 불필요) |
| `src/schema.ts` | 판정 결과 형식(질문, 서약, 제출) |
| `src/judge.ts` | 백엔드 인터페이스와 Claude 백엔드(비교용) |
| `src/light.ts` | 판정 결과를 불빛(예·아니오·상관없음·다시 보내라·신호가 닿지 않음)과 오염 점수로 바꾸는 게임 규칙 |
| `src/run-tests.ts` | 검증 질문 세트를 실제로 돌려 합격 기준 보고서를 만듭니다 |
| `src/server.ts` | 게임이 호출하는 HTTP 서버 |
| `test/` | 규칙과 데이터 자동 테스트(API 호출 없음) |

## 준비

```bash
cd judge
npm install
export TYPESAFE_API_KEY=...    # Jev 키. 판정 테스트와 서버 실행에만 필요
```

## 명령

```bash
npm test                          # 규칙·데이터 테스트 (API 없이)
npm run typecheck                 # 타입 검사
npm run extract                   # 문서를 고친 뒤 content/*.json 다시 생성

npm run judge:test -- --mock      # API 없이 채점 로직만 확인 (100%가 나와야 정상)
npm run judge:test                # 전체 191회 판정 (Jev, 영어+한국어)
npm run judge:test -- --lang en --only A,C,H   # 일부만
npm run judge:test -- --model jev-1.13         # Jev 모델 버전 지정
npm run judge:test -- --backend claude         # Claude와 비교(ANTHROPIC_API_KEY 필요)

npm run serve                     # 판정 서버, Jev (기본 포트 8787)
npm run serve:mock                # 판정 서버, 개발용 가짜 판정
```

보고서는 `judge/reports/`에 Markdown으로 저장됩니다. 합격 기준 6가지, 구간별 일치율, 지연 시간(p50·p95, 6초 초과 비율), 판정 1회와 플레이어 1명 예상 비용, 어긋난 항목 목록이 들어 있습니다.

## 판정 설정

- **Jev(기본):** 모델은 `jev-latest`이며 `TYPESAFE_DEFAULT_MODEL` 또는 `--model`로 바꿉니다. 질문 하나를 System One 질문 다섯 개로 판정합니다: 질문 종류(choice), 주어(choice), 배 자신 관련(noul), 명제의 참거짓(choice), 수칙 4 위반(noul).
- **확률을 구간으로 끊습니다(`THRESHOLDS`).** 명제 확률이 0.5 미만이면 "신호가 닿지 않음", 배 자신 관련은 0.5 이상, 수칙 4 위반은 오탐 0건 목표에 맞춰 0.75 이상일 때만 인정합니다(실측 3회: 비위반 최고 0.63, 실제 위반 최저 0.82). 판정 테스트 보고서의 원래 확률(`reports/*.json`)을 보고 조정합니다.
- 판정 규칙 문장(`prompt.ts`)은 Jev 질문의 설명으로 들어가며, Claude 백엔드도 같은 문장을 씁니다.
- 서버는 5.5초 안에 판정하지 못하면 포기합니다(게임은 6초에 끊음). 세션당 호출은 60회로 제한합니다. 스팀 인증은 M4에서 붙입니다.

## 테스트를 정직하게 유지하기

프롬프트의 예시 문장은 검증 질문 세트와 **겹치지 않게** 썼습니다. 테스트 문장을 프롬프트에 그대로 넣으면 점수가 부풀려져 실제 플레이어 질문에서의 품질을 알 수 없게 됩니다. 기준 미달 항목을 고칠 때도 테스트 문장을 프롬프트에 복사하지 말고, 원칙이나 다른 예시로 보완하세요.

## 기준 미달일 때

docs/03의 방침대로, 먼저 사실 목록의 문장과 판정 원칙(docs/02)을 고치고 `npm run extract`로 다시 생성한 뒤 재테스트합니다. 프롬프트 표현만 바꿔 해결되는 경우는 `src/prompt.ts`를 고칩니다.
