# 플레이 테스트 서버 배포

다른 사람이 계정 없이 링크만으로 플레이할 수 있게, 판정 서버(Jev)와 게임을 한 주소로 인터넷에 올리는 방법입니다. 판정 비용은 `TYPESAFE_API_KEY` 주인에게 청구됩니다.

## 구성

- 판정 서버(`judge/src/server.ts`)가 게임 파일(`app/dist`)까지 함께 내보냅니다. 게임과 판정 API가 같은 주소라 CORS 설정이 필요 없습니다.
- 저장소 맨 위의 `Dockerfile`이 게임을 빌드하고 서버를 띄웁니다. Docker를 지원하는 곳이면 어디든 올릴 수 있습니다(Render, Railway, Fly.io 등).
- `render.yaml`은 Render용 설정입니다. 아래 순서는 Render 기준입니다.

## Render로 올리기

1. [render.com](https://render.com)에 GitHub 계정으로 가입하고 이 저장소 접근을 허용합니다.
2. 대시보드에서 **New → Blueprint**를 누르고 이 저장소를 고릅니다. `render.yaml`을 읽어 `answer-in-light` 웹 서비스를 만듭니다.
3. 값을 물어보면 `TYPESAFE_API_KEY`에 Jev 키를 넣습니다. `LOG_ACCESS_TOKEN`은 자동으로 만들어집니다.
4. 배포가 끝나면 `https://answer-in-light-xxxx.onrender.com` 같은 주소가 나옵니다. 이 주소가 플레이 링크입니다.
5. 주소 뒤에 `/healthz`를 붙여 열면 `{"ok":true, ...}`와 오늘 사용량이 보입니다.
6. 같은 응답의 `client`가 플레이어 주소를 어디서 읽는지 알려줍니다(주소 값은 보이지 않음). `source`가 `header:cf-connecting-ip`이고 `matches`가 모두 `true`면 정상입니다. `false`가 있으면 IP당 제한이 플레이어가 아닌 앞단 주소에 걸리고 있다는 뜻입니다.

이후 이 브랜치에 푸시하면 Render가 자동으로 다시 배포합니다.

**플랜:** `render.yaml`은 유료 Starter 플랜으로 되어 있습니다. 무료 플랜은 15분 동안 접속이 없으면 잠들고, 깨어나는 동안(약 1분) 보낸 첫 질문은 게임의 6초 제한에 걸려 "신호가 닿지 않음"이 됩니다(등유는 돌려받음). 잠깐 써보는 것이면 무료로 바꿔도 됩니다.

## 환경 변수

| 이름 | 기본값 | 뜻 |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | (필수) | Jev 키 |
| `JUDGE_DAILY_CALL_LIMIT` | 2000 | 하루(UTC 기준) 전체 판정 횟수 상한. 넘으면 그날은 모든 판정이 "신호가 닿지 않음"이 됩니다. 비용 상한입니다 |
| `SESSIONS_PER_IP_PER_HOUR` | 6 | 한 주소에서 한 시간에 새로 시작할 수 있는 게임 수 |
| `SESSION_CALL_LIMIT` | 60 | 게임 한 판에서 쓸 수 있는 판정 횟수(신호 24회 + 재시도·서약·제출 여유) |
| `TRUSTED_PROXY_HOPS` | 1 | 서버 앞의 프록시 수. 플레이어 주소를 `x-forwarded-for` 끝에서 이만큼 센 칸으로 읽습니다(앞 칸은 플레이어가 위조할 수 있음). 프록시 없이 직접 띄우면 0 |
| `CLIENT_IP_HEADER` | (없음) | 앞단이 실제 접속 주소를 넣어 주는 헤더. 정하면 `x-forwarded-for`보다 먼저 씁니다. Render는 앞에 Cloudflare가 있어 `cf-connecting-ip`로 둡니다(render.yaml). 플레이어가 위조할 수 없는, 앞단이 덮어쓰는 헤더만 적으세요 |
| `LOG_ACCESS_TOKEN` | (없음) | 플레이 기록 내려받기용 토큰. 16자 이상일 때만 기록 내려받기가 켜집니다 |
| `JUDGE_LOG_DIR` | `/srv/logs` | 플레이 기록 폴더 |
| `TYPESAFE_DEFAULT_MODEL` | `jev-latest` | Jev 모델 버전 |

판정 횟수 기준: 한 판은 보통 질문 20~30회와 서약 1회, 제출 1회입니다. 기본값 2000이면 하루 약 60~90판입니다. 판정 테스트에서 질문 한 번은 입력과 출력을 합쳐 약 3,000토큰이었습니다(Jev 요금은 TypeSafe 요금표로 계산하세요).

**사용량 횟수는 메모리에만 있습니다.** 서버가 다시 켜지면(재배포 등) 그날 사용량도 0부터 다시 셉니다. 하루에 여러 번 재배포하면 그만큼 하루 상한이 사실상 늘어납니다(플레이 기록 파일은 디스크에 남음).

## 플레이 기록 받기

판정 한 번마다 `plays-YYYY-MM-DD.jsonl` 파일에 한 줄씩 남습니다(시각, 세션, 종류, 플레이어가 입력한 문장, 판정 결과, 걸린 시간). IP 주소는 남기지 않습니다. 서약 판정 기록에는 플레이어가 적은 이름이 들어갑니다.

```bash
# 토큰은 Render 대시보드의 Environment에서 LOG_ACCESS_TOKEN 값을 복사
curl -H "Authorization: Bearer $TOKEN" https://주소/v1/logs                        # 파일 목록
curl -H "Authorization: Bearer $TOKEN" https://주소/v1/logs/plays-2026-10-01.jsonl -o plays.jsonl
```

토큰이 없거나 틀리면 404가 나옵니다.

**기록 디스크:** `render.yaml`이 1GB 디스크(`play-logs`)를 `/srv/logs`에 붙여, 재배포해도 기록이 남습니다. `/healthz`의 `logs.mounted`가 `true`면 디스크가 붙은 것이고, `logs.files`는 기록 파일 수입니다.

- 유료 플랜에서만 붙일 수 있고, 디스크 요금이 따로 붙습니다(1GB, Render 요금표 참고).
- 디스크가 있으면 무중단 배포가 꺼져, 푸시할 때마다 1분 안팎 서버가 내려갑니다. 그 사이 질문은 "신호가 닿지 않음"이 됩니다(등유는 돌려받음). 플레이 테스트 중에는 푸시를 몰아서 하세요.
- 디스크를 떼거나 서비스를 지우면 기록도 사라집니다. 테스트가 끝나면 내려받아 두세요.
- Docker로 직접 띄울 때는 `-v 내폴더:/srv/logs`로 같은 효과를 냅니다.

모은 질문은 검증 질문 세트(docs/03)를 넓히는 데 씁니다(docs/03 "다음 단계"). 별도 검증 세트(docs/09)에 넣을 문장은 판정 규칙을 고치는 데 쓰지 마세요.

## 내 컴퓨터에서 먼저 확인하기

```bash
docker build -t answer-in-light .
docker run --rm -p 8787:8787 -e TYPESAFE_API_KEY=키 -e TRUSTED_PROXY_HOPS=0 answer-in-light
# http://localhost:8787 을 열어 플레이
```

Docker 없이:

```bash
npm ci --prefix judge && npm ci --prefix app && npm run build --prefix app
STATIC_DIR=app/dist TRUSTED_PROXY_HOPS=0 TYPESAFE_API_KEY=키 npm run serve --prefix judge
```
