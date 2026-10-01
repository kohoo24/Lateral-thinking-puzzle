# Answer in Light 플레이 테스트 서버: 판정 서버(Jev)가 게임 파일까지 함께 내보낸다(같은 주소, CORS 불필요).
# 필요한 환경 변수: TYPESAFE_API_KEY. 나머지는 DEPLOY.md 참고.
FROM node:22-slim

WORKDIR /srv

# 의존성 먼저(소스가 바뀌어도 이 단계는 캐시된다)
COPY judge/package.json judge/package-lock.json judge/
RUN npm ci --prefix judge
COPY app/package.json app/package-lock.json app/
RUN npm ci --prefix app

# 소스와 판정용 데이터. 게임 빌드는 판정 규칙(judge/src)과 사실 목록(content)도 가져다 쓴다
COPY content content
COPY judge judge
COPY app app
RUN npm run build --prefix app

ENV NODE_ENV=production \
    PORT=8787 \
    STATIC_DIR=/srv/app/dist \
    JUDGE_LOG_DIR=/srv/logs
EXPOSE 8787
CMD ["npm", "run", "serve", "--prefix", "judge"]
