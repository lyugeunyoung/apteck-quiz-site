# QA-REPORT — Phase 6 검증 결과

`PROMPT.md` §4의 검증 프로토콜(자동 검증 10개 항목 + 시나리오 5회 반복)을 실행한 결과다. 자동화할 수
없는 항목(실제 GitHub 저장소·실제 트래픽에 의존)은 "어떻게 재현했는지"를 각 시나리오마다 명시했다 —
가짜로 PASS를 만들지 않고, 재현 가능한 방식으로 실제 코드를 실행한 결과만 기록한다.

## 1. 자동 검증 (`scripts/verify.js`, `npm test`)

| # | 항목 | 결과 |
|---|---|---|
| 1 | 정답이 정적 텍스트로 존재(JS 불필요) | ✅ PASS |
| 2 | title/description/canonical/OG 6종/소유확인 메타 | ⏭️ SKIP (naver·google 인증 코드가 아직 미발급 — §3 "사용자가 직접 해야 할 일" 참고. 값이 채워지면 같은 스크립트가 그 즉시 실제로 검증한다) |
| 3 | JSON-LD 유효성·필수필드·본문 일치 | ✅ PASS |
| 4 | h1 1개 + heading 위계 건너뜀 없음 | ✅ PASS |
| 5 | 모든 img에 alt·width·height | ✅ PASS |
| 6 | sitemap/feed URL 실재 + lastmod/pubDate 유효 | ✅ PASS |
| 7 | 내부 링크 깨짐 0건 + baseUrl 하드코딩 잔재 0건 | ✅ PASS |
| 8 | 광고 슬롯 ≤4개 + min-height 지정 | ✅ PASS |
| 9 | 고정 서술 콘텐츠 800자 이상 | ✅ PASS (최소 1,794자 · 평균 1,888자 — Phase 5 실측치) |
| 10 | admin.html이 robots.txt+메타 양쪽에서 차단 | ✅ PASS |

**9/10 PASS, 0 FAIL, 1 SKIP.** 실패 0건이 될 때까지 실제로 수정한 항목(아래 "검증 중 발견·수정한 문제"
참고)을 반영한 뒤의 최종 결과다.

## 2. 시나리오 시뮬레이션 (각 5회 반복)

| # | 시나리오 | 재현 방법 | 결과 |
|---|---|---|---|
| S1 | 시트에 오늘 행 입력 → 동기화 실행 | `scripts/sync-sheet.js`를 임시 작업 디렉터리에 복사, `global.fetch`를 모의해 매번 다른 앱·값의 CSV를 반환하고 실제 스크립트를 실행 | ✅ 5/5 PASS — 대상 앱만 갱신, 나머지 20개 앱 무변경 |
| S2 | 관리자 원클릭 전체 게시 | 실제 `admin.html`+`admin.js`를 브라우저에서 로드, GitHub Contents/Git Data API를 모의(blob→tree→commit→ref)해 21개 앱 전체 시트 데이터로 일괄 게시 실행 | ✅ PASS — diff 21개 앱 정상 표시, 커밋 정확히 1회, 약 1초 소요(기준 30~60초 이내). 3개 앱만 섞은 5회 추가 반복도 전부 PASS |
| S3 | 회차 앱(카카오뱅크 AI 이모지 퀴즈) 3회차 순차 입력 | `sync-sheet.js`로 08:00→12:00→20:00 회차를 한 회차씩 순차 실행 | ✅ 5/5 PASS — 미입력 회차는 `renderRoundBlock`에서 "아직 등록된 문제가 없습니다" 표기, 이미 입력된 회차는 다음 실행에서도 보존 |
| S4 | 잘못된 시트 데이터(날짜 오류·app_id 오타·정답 공백·round_time 오류/불일치) | 5가지 서로 다른 오류 케이스를 각각 담은 CSV로 `sync-sheet.js` 실행 | ✅ 5/5 PASS — 전부 exit 1 + `data/quizzes.json` 완전 무변경. **1건은 최초 실행에서 FAIL → 실제 버그를 발견해 수정**(아래 참고) |
| S5 | 드라이브 이미지 링크 입력 | `scripts/fetch-images.js`를 sharp로 생성한 합성 이미지(4가지 가로폭)로 실행 + 1회는 네트워크 실패 주입 | ✅ 5/5 PASS — 1200px 초과 이미지는 정확히 1200px로 리사이즈, 이하는 원본 유지, 실패 시 원본 URL 폴백 + `::warning::` 로그 |
| S6 | JS 비활성 브라우저로 페이지 열기 | 실제 빌드 산출물에서 `<script>` 태그를 전부 제거한 뒤, 문제·정답·해설 원문이 여전히 남아있는지 5개 앱 페이지에서 확인 | ✅ 5/5 PASS |
| S7 | 어제 정답 → 오늘 정답 갱신 | 어제 날짜로 저장된 상태에서 `sync-sheet.js`로 오늘 값 동기화, 5개 서로 다른 앱으로 반복 | ✅ 5/5 PASS — 어제 정답이 `history[0]`으로 이동, 유실 없음 |
| S8 | 모바일 360px / 데스크톱 1440px | 브라우저에서 실제 뷰포트를 360px·1440px로 전환해 홈/단일회차 앱/다중회차 앱 페이지의 가로 스크롤 여부와 터치 타깃(버튼·링크) 크기를 측정 | ✅ 가로 스크롤 0건. **터치 타깃 44px 미만 23개 발견 → 실제 CSS 버그로 확인 후 수정**(아래 참고), 재측정 결과 0건 |
| S9 | 원클릭 롤백 | 개별 저장 1회 후 롤백 버튼 클릭, 5개 서로 다른 앱으로 반복 | ✅ 5/5 PASS. **최초 실행에서는 직전 상태로 정확히 복구되지 않음(FAIL) → 실제 설계 결함을 발견해 수정**(아래 참고) |
| S10 | 두 PC 동시 작업(회사 push 후 재택 pull) | 실제 git으로 bare 저장소 + office/home 두 워킹카피를 만들고, office push → 봇(`[skip ci]`) push → home `pull --rebase` → home push → office pull까지 5회 반복 | ✅ 5/5 PASS — 매번 충돌 없이 이어받음 |

**리치 결과 검증**: 홈페이지의 `WebSite`/`Organization`/`ItemList`와 앱 페이지의 `FAQPage`/`Article`
(+ `SpeakableSpecification`)/`BreadcrumbList` 6종 모두 `scripts/verify.js` #3에서 JSON 파싱·필수 필드·
본문 텍스트 일치까지 확인됨(자체 파서 기준). 실제 배포 후 사람이 눈으로 재확인할 URL:

- https://search.google.com/test/rich-results 에 `pages/hana-onecue-soccer.html`(현재 실데이터가 있는
  유일한 앱) 실제 배포 URL을 넣어 FAQPage/Article/BreadcrumbList가 리치 결과로 인식되는지 확인
- 홈페이지(`/`) URL로 같은 테스트를 돌려 WebSite/Organization/ItemList 인식 여부 확인

## 3. 검증 중 발견·수정한 문제 (실패 → 원인 → 수정)

QA를 형식적으로 통과시키기 위해 검증 로직을 느슨하게 만든 것이 아니라, 실패가 나올 때마다 실제 코드의
버그를 찾아 고쳤다. 세 건 모두 이 세션에서 실제로 재현·수정·재검증했다.

1. **S4 날짜 검증 누락** — `scripts/sync-sheet.js`의 `validateRows()`가 `/^\d{4}-\d{2}-\d{2}$/` 정규식만
   썼는데, 이건 "2026-13-99"(13월, 99일) 같은 존재하지 않는 날짜도 자릿수만 맞으면 통과시켰다.
   `isValidCalendarDate()`를 추가해 `Date` 객체로 왕복 검증(연/월/일이 실제로 그 값으로 저장되는지 확인)
   하도록 수정. round_time 형식(`timeRe`)은 애초에 시/분 범위를 정확히 검사해 이 문제가 없었다.
2. **S8 터치 타깃 미달** — `.chip`(카테고리 필터, 38.9px), `.fav-star`(즐겨찾기, 34px),
   `.btn--small`(38.1px), `.app-link-pill`(전체 앱 그리드 링크, 32.5px) 4개 클래스가 44px 기준에
   미달했다. 각각 `min-height: 44px`(또는 `.fav-star`는 width/height 44px)를 추가해 시각적 크기는
   거의 그대로 유지하면서 클릭 가능 영역만 넓혔다.
3. **S9 롤백이 저장을 온전히 취소하지 못함** — 개별 "저장"(`admin.js` `btn-save`)이 `data/quizzes.json`
   + 페이지 + index/sitemap/feed를 **5번의 개별 커밋**(Contents API PUT 5회)으로 만들고 있어서, 롤백
   버튼(직전 "커밋" 1개만 되돌림)을 한 번 눌러도 5개 중 마지막 1개만 취소되고 나머지 4개 파일은 새
   상태로 남아 불일치가 생겼다. Phase 3에서 일괄 게시·사이트 설정 저장에 이미 쓰던 원자적 커밋 경로
   (`commitFilesAtomically`, Git Data API blob→tree→commit→ref)를 개별 저장에도 적용해 **모든 저장
   경로가 항상 파일 개수와 무관하게 커밋 1개**가 되도록 통일했다. 이제 롤백 1클릭 = 저장 1클릭이 정확히
   대칭이다.

## 4. 사용자가 직접 해야 할 일 (Definition of Done 체크리스트)

1. **Google Search Console** 등록 → "HTML 태그" 방식 소유확인 코드 발급 → `admin.html` "4. 사이트 전역
   설정"에 입력 → `sitemap.xml` 제출
2. **네이버 서치어드바이저** 등록 → 소유확인 코드 발급 → 같은 "사이트 전역 설정"에 입력 → `sitemap.xml`
   + `feed.xml` 제출 (자세한 운영 체크리스트는 [`docs/NAVER-CHECKLIST.md`](NAVER-CHECKLIST.md))
3. **애드센스 승인 후 실제 값 반영** — `data/quizzes.json`의 `site.adsense.pubId`와 `slots.top` /
   `slots.inArticle` / `slots.bottom`(4번째 `slots.middle`은 예비 슬롯) 값을 실제 발급받은 ID로 채우면
   `adSlot()`이 자동으로 실제 `<ins class="adsbygoogle">` 태그를 삽입한다. `ads.txt`의
   `pub-0000000000000000`도 실제 게시자 ID로 교체.
4. **구글 시트 자동 동기화 사용 시**: 실제 시트를 만들고 `admin.html`의 "🔁 자동 동기화 켜기"로 URL 등록
5. **문의 이메일**을 공개해도 된다면 `admin.html` "4. 사이트 전역 설정"에 입력(비워두면 푸터에 문의 줄
   자체가 나타나지 않음)
6. (선택) 커스텀 도메인 사용 여부는 [`docs/DECISIONS.md`](DECISIONS.md) #1에 따라 보류 중 — 트래픽·매출이
   쌓이면 재검토
