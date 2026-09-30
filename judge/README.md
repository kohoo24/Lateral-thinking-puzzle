# 판정 서버와 판정 테스트 (M0)

Answer in Light의 AI 판정(Jev)을 담당합니다. 플레이어의 질문, 서약, 최종 제출을 Claude API로 판정하고, 게임 규칙에 따라 배의 불빛과 오염 점수로 바꿉니다. 게임 클라이언트는 이 서버만 호출하며, API 키는 서버에만 둡니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `scripts/extract-content.ts` | `docs/02`(사실 목록)와 `docs/03`(검증 질문 세트)의 표를 `content/*.json`으로 옮깁니다. 문서가 원본입니다 |
| `src/prompt.ts` | 판정 프롬프트. 사실 목록, 판정 원칙, 수칙 4 규칙, 제출 인정 기준 |
| `src/schema.ts` | 판정 결과 형식(질문, 서약, 제출) |
| `src/judge.ts` | Claude API 호출. 구조화된 출력, 프롬프트 캐싱, 거절 시 대체 모델(fallbacks) |
| `src/light.ts` | 판정 결과를 불빛(예·아니오·상관없음·다시 보내라·신호가 닿지 않음)과 오염 점수로 바꾸는 게임 규칙 |
| `src/run-tests.ts` | 검증 질문 세트를 실제로 돌려 합격 기준 보고서를 만듭니다 |
| `src/server.ts` | 게임이 호출하는 HTTP 서버 |
| `test/` | 규칙과 데이터 자동 테스트(API 호출 없음) |

## 준비

```bash
cd judge
npm install
export ANTHROPIC_API_KEY=...   # 판정 테스트와 서버 실행에만 필요
```

## 명령

```bash
npm test                          # 규칙·데이터 테스트 (API 없이)
npm run typecheck                 # 타입 검사
npm run extract                   # 문서를 고친 뒤 content/*.json 다시 생성

npm run judge:test -- --mock      # API 없이 채점 로직만 확인 (100%가 나와야 정상)
npm run judge:test                # 전체 191회 판정 (영어+한국어)
npm run judge:test -- --lang en --only A,C,H   # 일부만
npm run judge:test -- --effort medium          # 추론 강도 바꿔 비교
npm run judge:test -- --model claude-haiku-4-5 # 다른 모델과 비교

npm run serve                     # 판정 서버 (기본 포트 8787)
```

보고서는 `judge/reports/`에 Markdown으로 저장됩니다. 합격 기준 6가지, 구간별 일치율, 지연 시간(p50·p95, 6초 초과 비율), 판정 1회와 플레이어 1명 예상 비용, 어긋난 항목 목록이 들어 있습니다.

## 판정 설정

- 기본 모델은 `claude-opus-5-5`, 추론 강도(effort)는 `low`입니다. 환경 변수 `JUDGE_MODEL`, `JUDGE_EFFORT`나 테스트 옵션 `--model`, `--effort`로 바꿀 수 있습니다.
- 사실 목록이 든 시스템 프롬프트는 프롬프트 캐싱을 씁니다. 보고서의 "캐시 읽기 비중"으로 확인합니다.
- 안전 분류기가 요청을 거절하면 대체 모델로 자동 재시도하도록 `fallbacks: "default"`를 켜 두었습니다. 그래도 판정을 못 내면 게임에서는 "신호가 닿지 않음"(등유 반환, 오염 없음)으로 처리합니다.
- 서버는 5.5초 안에 판정하지 못하면 포기합니다(게임은 6초에 끊음). 세션당 호출은 60회로 제한합니다. 스팀 인증은 M4에서 붙입니다.

## 테스트를 정직하게 유지하기

프롬프트의 예시 문장은 검증 질문 세트와 **겹치지 않게** 썼습니다. 테스트 문장을 프롬프트에 그대로 넣으면 점수가 부풀려져 실제 플레이어 질문에서의 품질을 알 수 없게 됩니다. 기준 미달 항목을 고칠 때도 테스트 문장을 프롬프트에 복사하지 말고, 원칙이나 다른 예시로 보완하세요.

## 기준 미달일 때

docs/03의 방침대로, 먼저 사실 목록의 문장과 판정 원칙(docs/02)을 고치고 `npm run extract`로 다시 생성한 뒤 재테스트합니다. 프롬프트 표현만 바꿔 해결되는 경우는 `src/prompt.ts`를 고칩니다.
