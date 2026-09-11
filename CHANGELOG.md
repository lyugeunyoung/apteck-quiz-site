# CHANGELOG

`PROMPT.md` 재설계 작업의 Phase별 변경 요약. 상세 근거는 `docs/DECISIONS.md`, 초기 상태는
`docs/AS-IS.md` 참고.

## Phase 7 이후 — 상세 페이지 목록 통일 + 날짜-only 커밋 잔여 버그 수정 (2026-09-12)

- **"오늘의 픽" 통일**: 상세 페이지마다 카테고리 기준으로 달라지던 추천 3개(`pickRelated`)를 모든
  페이지가 같은 목록을 보여주는 `pickFeatured`로 교체 — 참고 사이트(bookshelf-journey.tistory.com)의
  "오늘의 픽 / 전체 목록" 2단 구조를 반영. 현재 페이지 자신만 후보 풀에서 제외해 자기참조 링크를 피함.
- **앱별 특징 컬러 적용**: 홈 카드·오늘의 픽 카드·전체 앱 pill에 각 앱의 `brandColor`를 왼쪽 액센트
  보더 + 배지 소프트 틴트로 적용.
- **날짜-only 자동 커밋 잔여 버그 수정**: Phase 2에서 상태 배지는 클라이언트 계산으로 옮겼지만
  `headerBlock()`의 `<time id="header-date">` 초기 텍스트는 여전히 빌드 시점 날짜를 그대로 박아 넣고
  있어, 콘텐츠 변경이 전혀 없어도 매일 그 한 줄 때문에 `chore: 구글 시트 자동 동기화` 빈 커밋이 발생
  중이었음을 실제 커밋 이력에서 발견(2026-09-10, 2026-09-11 이틀 연속 확인). 날짜에 의존하지 않는
  고정 문구로 교체(실제 날짜는 `freshness.js`가 그대로 즉시 채움) — 이제 진짜 콘텐츠 변경이 없으면
  워크플로가 커밋을 만들지 않는다.

## Phase 7 — 운영 자동화 & 모니터링 (2026-09-10)

- **미갱신 감시**: `.github/workflows/check-freshness.yml`(매일 22시 KST) + `scripts/check-freshness.js` —
  그날 데이터가 없는(회차 앱은 모든 회차가 안 채워진) 앱을 찾아 GitHub Issue를 자동 생성. 이미 열려있는
  이슈가 있으면 내용만 갱신(중복 생성 없음), 전부 채워지면 다음 실행 때 자동으로 닫힘.
- **주간 링크 헬스체크**: `.github/workflows/check-links.yml`(매주 월요일 09시 KST) +
  `scripts/check-links.js` — 참여 딥링크와 아직 WebP로 자산화되지 않은 외부 이미지 URL의 응답 상태를
  확인해 문제가 있으면 이슈로 알림(저장소에 이미 커밋된 WebP는 확인 대상에서 제외 — 죽을 링크가 아니므로).
- **`scripts/gh-issue.js` 신설**: 두 체크 스크립트가 공유하는 "찾아서 갱신, 없으면 생성, 해소되면
  자동으로 닫기" 로직. GitHub Issues API 모의로 생성/갱신/닫기/재오픈/무동작 5가지 경로를 실제 실행해
  검증.
- **README 9번 섹션 정정**: Phase 2에서 이미 없앤 "날짜만 바뀌어도 매일 자동 커밋이 생길 수 있다"는
  낡은 안내 문구를 제거하고, `git pull --rebase`·`npm test` 사용을 권장하도록 갱신. 세 자동화
  워크플로(시트 동기화/미갱신 감시/링크 헬스체크)의 주기를 표로 정리.
- 최종 Definition of Done 체크리스트는 [`docs/QA-REPORT.md`](docs/QA-REPORT.md) 4번 항목 참고.

## Phase 6 — 애드센스 & 검증 (2026-09-10)

- **애드센스 구조 마련(실제 ID는 비워둠)**: `site.adsense = { pubId, slots: { top, inArticle, bottom, middle } }`
  구조를 신설하고 `adSlot()`이 값이 채워졌을 때만 실제 `<ins class="adsbygoogle">`를 삽입하도록 구현.
  PROMPT.md에 적힌 게시자ID/슬롯4개는 **사용자가 "아직 비워두세요"로 확답**해 실제 값은 반영하지 않음
  (애드센스 계정 정지 리스크 — 세션 중 재확인 완료). 자동광고는 기존 결정([DECISIONS.md](docs/DECISIONS.md)
  #5)대로 계속 미사용.
- **필수 정적 페이지 신설**: `terms.html`(이용약관), `about.html`(E-E-A-T용 사이트 소개). 푸터 링크를
  `site.baseUrl` 기준 절대경로로 통일하는 과정에서 **기존 개인정보처리방침 링크가 GitHub Pages
  서브패스를 무시하고 도메인 루트로 튀는 실제 버그(`/privacy.html`)를 발견해 함께 수정**.
- **`scripts/verify.js` 신설(`npm test`)**: PROMPT.md §4.1의 10개 항목을 실제 빌드 산출물에 대해
  자동 확인. 네이버/구글 인증 메타처럼 아직 값 자체가 없어 검증 불가능한 항목은 거짓 PASS 대신 SKIP으로
  투명하게 표시. 구현 과정에서 `<h1>`만 있고 `<h2>`가 전혀 없던 실제 정보구조 문제를 발견해
  `.section__label`을 `<div>`에서 `<h2>`로 전환(시각적 변화 없이 heading 위계 확보).
  **10/10 통과**(1개 SKIP 제외).
- **`docs/QA-REPORT.md` 신설**: PROMPT.md §4.2의 S1~S10 시나리오를 각 5회씩 실제 코드로 재현·기록.
  이 과정에서 발견해 수정한 실제 버그 3건: (1) `sync-sheet.js`의 날짜 검증이 "2026-13-99" 같은
  존재하지 않는 날짜를 자릿수만 보고 통과시키던 문제, (2) `.chip`/`.fav-star`/`.btn--small`/
  `.app-link-pill` 4개 UI 요소의 터치 타깃이 44px 미만이던 문제, (3) 개별 저장이 5개 커밋으로
  쪼개져 있어 롤백 1클릭이 저장 전체를 온전히 취소하지 못하던 구조적 문제 — Phase 3의 원자적 커밋
  경로(`commitFilesAtomically`)를 개별 저장에도 적용해 모든 저장이 항상 커밋 1개가 되도록 통일.
- **README 갱신**: 애드센스 연결 안내를 새 `site.adsense` 구조에 맞게, 파일 구조 목록을 Phase 2~6에서
  추가된 파일(WebP 자산 경로, `llms.txt`, `scripts/indexnow.js`, `scripts/verify.js`, `docs/*.md` 등)
  까지 반영하도록 갱신.

## Phase 5 — 네이버 대책 (2026-09-10)

- **사이트 전역 설정 UI**: `admin.html`에 "4. 사이트 전역 설정" 카드 신설 — 네이버 서치어드바이저/구글
  서치 콘솔 소유확인 코드, 문의 이메일을 여기서 입력·저장. 이 값들은 모든 페이지의 `<head>`에 들어가므로
  저장 시 `data/quizzes.json` + 전체 21개 `pages/*.html` + `index.html`/`sitemap.xml`/`feed.xml`을
  (Phase 3에서 만든 Git Data API 경로로) **한 커밋**으로 재생성해 일부 페이지만 옛 값으로 남는 상황을
  방지. README "직접 등록해야 하는 것" 절차를 이 UI를 쓰도록 갱신.
  실제 코드값은 사용자가 네이버/구글에 직접 사이트를 등록해야 발급되므로 이번 세션에서 채워 넣지 않음
  (계속 공란 — 등록은 사용자 몫).
- **`docs/NAVER-CHECKLIST.md` 신설**: 최초 1회/매일/매주로 나눈 네이버 노출 체크리스트. IndexNow가
  네이버에는 안 통하므로([`DECISIONS.md`](docs/DECISIONS.md) #7) 서치어드바이저 수집 요청이 네이버 쪽
  유일한 "빠른 반영" 수단임을 명시.
- **`robots.txt`에 `User-agent: Yeti` 명시 블록 추가**: 기존 `User-agent: *` 규칙과 동일하게
  `Allow: /` + `Disallow: /admin.html`을 네이버 크롤러(Yeti)에도 명시적으로 적용.
- **OG/트위터 카드 완전성 보강**: `twitter:title`/`twitter:description`/`twitter:image`를
  `headBlock`에 추가(기존엔 `twitter:card`만 있었음) — 공유 미리보기가 og: 태그를 못 읽는 일부
  크롤러에서도 동일하게 뜨도록.
- **고정 콘텐츠 분량 실측**: 생성된 21개 앱 페이지의 실제 표시 텍스트 길이를 스크립트로 측정 —
  최소 1,794자 · 최대 2,360자 · 평균 1,888자로 `PROMPT.md`가 우려한 "800자 미만 thin content" 기준을
  모든 페이지가 이미 여유 있게 충족(Phase 1의 FAQ·참여방법 표·아카이브·전체앱그리드 추가분이 실질적으로
  기여). 별도 코드 변경 불필요, 실측치만 기록.
- 티스토리와의 캐노니컬/역할분리 관련 작업은 [`DECISIONS.md`](docs/DECISIONS.md) #3 결정대로 계속 보류.

## Phase 4 — 구글·AI 검색 최적화 (2026-09-10)

- **JSON-LD 확충**: 홈페이지에 `Organization`(사이트 발행 주체)과 `ItemList`(전체 앱 목록)를
  `WebSite` 옆에 신설, 앱 상세 페이지의 `Article`에 `SpeakableSpecification`(정답 요약 카드
  `#summary`를 음성 답변 대상으로 지정) 추가. 정답 자체는 기존 결정(`DECISIONS.md` #2)대로 계속
  메타 영역에 노출하지 않음 — 이번에 추가한 스키마들은 모두 정답 텍스트를 담지 않는다.
  `renderIndexPage`가 이제 script 태그 3개(WebSite/Organization/ItemList)를 출력한다.
- **sitemap.xml `lastmod` 추가**: 지금까지 URL만 있고 `lastmod`가 아예 없던 것을, 각 앱의
  `updatedAt`(빌드 시점이 아니라 실제 콘텐츠가 바뀐 날짜)으로 채움 — 크롤러가 "최근에 진짜 바뀐" 페이지를
  구분할 수 있게 됨(AS-IS.md #7 일부 해소).
- **날짜별 아카이브 URL 미생성 결정**: `docs/DECISIONS.md` #6에 앱당 URL 1개 유지(허브 페이지 방식)
  결정과 근거를 기록. 회차별 별도 URL을 만들지 않기로 확정.
- **IndexNow 연동**: `scripts/indexnow.js` 신설 — Bing/Yandex에 sitemap.xml 변경을 알림(`site.indexNowKey`가
  비어 있으면 완전 no-op). 검증 키 파일을 저장소 루트에 커밋하고, `sync-sheet.yml`이 실제로 커밋을
  만들었을 때만 실행하도록 연결. **Google과 네이버는 IndexNow 미지원** — `docs/DECISIONS.md` #7에 명시,
  두 엔진은 계속 sitemap 크롤링(+ Naver는 Phase 5의 서치어드바이저 수동 절차)에 의존.
- **llms.txt 신설**: `scripts/build.js`가 `data/quizzes.json`으로부터 매번 재생성(사이트 소개 + 전체 앱
  정답 페이지 링크 목록) — 손으로 관리하는 정적 파일이 아니라 다른 산출물처럼 항상 최신 상태 보장.
- **AEO/개체명 재확인**: FAQ 답변(결론 먼저 후 단서), 메타 설명(`buildMetaDescription`), 정답 요약 카드가
  이미 Phase 1에서 "결론 우선" 구조로 만들어져 있음을 재확인 — 추가 변경 불필요. `app.name`(공식 앱/퀴즈
  이름)이 H1·메타·FAQ·JSON-LD 전 영역에서 일관되게 쓰이는 구조도 재확인.

## Phase 3 — 관리자 페이지(admin.html) 재설계 (2026-09-10)

- **오늘 시트 전체 불러오기 + 일괄 게시**: `admin.html`에 새 섹션 추가 — 시트에서 오늘 날짜 행 전체를
  앱별로 대조해 변경 diff(문제/정답 변경분, 회차 앱은 회차별)를 미리 보여주고, 항목을 선택해
  **한 번의 커밋**으로 한꺼번에 게시. 기존에는 앱마다 최대 5개 파일을 각각 별도 커밋으로 저장해야
  했던 것(`data/quizzes.json` 개별 저장 방식은 그대로 남겨둠 — 앱 1개만 손으로 고칠 때는 여전히 유효)을
  Git Data API(blob→tree→commit→ref 갱신)로 다건을 한 커밋에 묶어 히스토리를 깔끔하게 유지.
  시트 행 → `app.today` 변환 로직을 `assets/js/template.js`(`computeSingleRoundToday`/
  `computeMultiRoundToday` 등)로 뽑아내 `scripts/sync-sheet.js`(자동 동기화)와 이 화면이 완전히
  동일한 로직을 공유하도록 리팩터링.
- **오늘의 대시보드**: 등록 완료/대기 앱 수 카운터, "대기중만 보기" 필터 추가.
- **저장 시점 검증**: `template.js`의 `validateQuizContent()` 공용 함수로 빈 정답·이미지 주소 형식
  오류는 저장을 차단, 정답 해설 30자 미만·`<`/`>` 문자 포함은 경고 후 확인 대화상자로 계속 여부를
  선택(일괄 게시·개별 저장 양쪽에 동일 적용).
- **되돌리기 버튼**: 최근 커밋 메시지와 되돌아갈 이전 커밋 메시지를 보여주고, 확인 후 브랜치 ref를
  이전 커밋으로 이동(되돌리기 자체도 새 커밋 이동이라 필요하면 다시 앞으로 되돌릴 수 있음).
- **토큰 저장 기본값 변경**: 기본은 탭을 닫으면 사라지는 `sessionStorage`, "이 기기에 저장" 체크박스로
  명시적으로 선택했을 때만 `localStorage`에 90일 만료로 저장(만료 시 자동 무시·삭제).
- **검증 방식**: 실제 브라우저에서 GitHub REST API(Contents API + Git Data API)를 모사한 fetch 모의
  객체로 연결→시트 일괄 불러오기(정상/오류/경고 케이스 혼합)→일괄 게시(파일 6개가 커밋 1개로 묶이는지
  트리 내용으로 확인)→되돌리기(ref가 실제로 이전 커밋으로 이동하고 데이터가 되돌아가는지)→개별 저장
  검증(차단/경고-취소/경고-진행)까지 전체 플로우를 실행해 확인.

## Phase 2 — 데이터 파이프라인 & 이미지 자산화 (2026-09-10)

- **이미지 자산화**: `scripts/fetch-images.js` 신설 — 구글드라이브 등 외부 이미지 URL을 다운로드해
  WebP(최대 가로 1200px)로 변환, `assets/img/quiz/{app-id}/{날짜}.webp`로 저장소에 커밋하고
  `data/quizzes.json`의 `imageUrl`을 그 경로로, 실제 가로·세로 값을 `imageWidth`/`imageHeight`로
  기록. 다운로드/변환 실패 시 원본 외부 URL을 그대로 둬 폴백. 관리자 입력 동선은 그대로(드라이브
  링크 붙여넣기)이며, 어디서 입력됐든(시트 자동 동기화든 admin.html 수동 저장이든) 다음 실행 때
  자동으로 자산화된다. `sharp` npm 패키지를 이 스크립트에서만 사용(사이트 자체는 여전히 프레임워크
  없는 정적 HTML).
- **날짜-only 자동 커밋 문제 해결**: "오늘 갱신됨/갱신 대기" 배지와 헤더 날짜를 빌드 시점이 아니라
  방문자 브라우저에서 즉시 계산하도록 변경(`assets/js/freshness.js` 신설). 이제 콘텐츠가 실제로
  바뀌지 않으면 자동 동기화 워크플로가 커밋을 만들지 않는다(날짜만 바뀌어서 매일 빈 커밋이 생기던
  현상 해결). 문제·정답·해설 등 실제 콘텐츠는 계속 100% 정적 HTML로 유지(이 원칙은 그대로).
- **시트 스키마 검증**: `scripts/sync-sheet.js`에 `validateRows()` 추가 — app_id 미매칭, 날짜 형식
  오류, (오늘 날짜 행의) 정답 공백, round_time 형식·미스매치를 커밋 전에 모두 잡아 워크플로를
  실패시키고 행 번호와 이유를 명시. 하나라도 문제가 있으면 전체를 반영하지 않음(부분 반영 없음).
- **워크플로 스케줄 보강**: KST 08·10·12·20시 직후 30분은 5분 간격, 그 외 시간대는 약 2시간
  간격으로 변경. `concurrency` 그룹으로 동시 실행 방지, 봇 커밋에 `[skip ci]` 표기.
- **서비스워커 캐시 버전 상향**: 쉘 자산(CSS/JS)이 이번에 많이 바뀌어 `apteck-shell-v1` →
  `apteck-shell-v2`로 올림 — 재방문자가 예전 캐시를 계속 받는 것을 방지.

## Phase 1 — 퀴즈 상세 페이지 정보구조 재설계 (2026-09-10)

- 13블록 순서로 재구성, 핵심은 **정답 요약 카드** 신설(스크롤/클릭 없이 즉시 정답 노출, 회차 앱은
  회차별 병기).
- 정답/해설을 JS 의존 reveal-click에서 네이티브 `<details>`로 전환.
- FAQ 4~6문항 신설(앱별 실제 데이터로 문구가 자연히 다름), 표시 텍스트와 FAQPage JSON-LD 1:1 동기화.
- 참여 방법에 참여시간·리워드·소요시간 표 추가. 지난 정답 아카이브를 항상 렌더링(빈 상태 포함).
- 전체 앱 상호링크 그리드 추가. 앱별 브랜드 컬러(21종) 상단 스트라이프로 반영.
- `data/quizzes.json`: `site.exposeAnswerInMeta`(정답 메타 비노출 — DECISIONS.md #2),
  `site.contactEmail`, `app.brandColor` 추가.

## Phase 0 — 현황 파악 (2026-09-10)

- `PROMPT.md` 반영, `docs/AS-IS.md`(현행 구조·스키마·알려진 문제 10가지), `docs/DECISIONS.md`
  (도메인/정답노출/티스토리분리/이미지소스/자동광고 5개 결정) 작성.
