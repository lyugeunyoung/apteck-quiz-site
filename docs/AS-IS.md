# AS-IS — 현행 구조 스냅샷 (Phase 0)

작성 시점: 2026-09-10 (커밋 `f973d69` 기준). `PROMPT.md` Phase 1 이후 작업의 출발선.

## 1. 아키텍처

```
data/quizzes.json   ← 유일한 데이터 원본 (site 설정 + apps[21])
        │
        ▼  require (Node) / <script> (브라우저) — 동일 코드
assets/js/template.js   ← escapeHtml, formatDateMD, convertDriveLink,
                           parseCsv/csvToObjects, renderIndexPage,
                           renderAppPage, renderSitemap, renderFeed
        │
        ├─ scripts/build.js       → index.html, pages/*.html(21), sitemap.xml, feed.xml
        ├─ assets/js/admin.js     → admin.html에서 브라우저 내 실행, GitHub Contents API로 직접 커밋
        └─ scripts/sync-sheet.js → .github/workflows/sync-sheet.yml(cron */20분)가 실행,
                                     data.site.sheetUrl의 CSV를 읽어 data/quizzes.json 갱신 후 build.js 재실행
```

- 서버·DB·빌드 프레임워크 없음. GitHub Pages가 정적 파일을 그대로 서빙.
- 라인 수: `template.js` 642 / `admin.js` 653 / `style.css` 823 / `data/quizzes.json` 328.

## 2. 데이터 스키마 (`data/quizzes.json`)

```jsonc
{
  "site": {
    "name": "오늘의 앱테크", "tagline": "...", "baseUrl": "https://lyugeunyoung.github.io/apteck-quiz-site",
    "adsensePubId": "",              // 비어있음 — 광고 미연동 상태
    "googleSiteVerification": "", "naverSiteVerification": "",  // 둘 다 비어있음 — 서치콘솔/서치어드바이저 미등록
    "ogImage": "assets/img/og-default.png",
    "privacyPath": "/privacy.html",
    "sheetUrl": ""                   // 비어있음 — 자동 동기화 아직 미가동
  },
  "apps": [
    {
      "id": "toss-luck", "page": "toss-luck.html", "name": "...", "emoji": "💸",
      "category": "은행·페이", "schedule": "...", "rewardHint": "...",
      "participatePath": "...", "appDeeplink": "...", "updatedAt": "YYYY-MM-DD",
      "today": { "date": "YYYY-MM-DD", "imageUrl": "", "question": "", "choices": [], "answer": "", "explanation": "" },
      "history": [ { "date": "...", "question": "...", "answer": "...", "explanation": "..." } ]  // 최근 14개
    },
    // 다회차 앱(카카오뱅크 AI 이모지 퀴즈)만 다른 모양:
    {
      "id": "kakaobank-ai-emoji", "roundSchedule": [{"time":"08:00","label":"오전 8시"}, ...],
      "today": { "date": "...", "rounds": [ {time,label,question,choices,imageUrl,answer,explanation}, ... ] },
      "history": [ { "date": "...", "rounds": [...] } ]
    }
  ]
}
```

- 21개 앱 중 다회차는 `kakaobank-ai-emoji` 1개뿐(오전 8시/오후 12시/오후 8시).
- 이미지는 `imageUrl`에 원본 URL(대개 구글드라이브 `thumbnail?id=...` 또는 `file/d/.../view` 형태)을 그대로 저장 —
  `convertDriveLink()`가 `lh3.googleusercontent.com/d/{id}=w1200` 형태로 렌더 시점에 변환할 뿐, 저장소로
  다운로드·재호스팅하지 않음.

## 3. 퀴즈 상세 페이지(`pages/*.html`) 현재 정보구조

`<head>`(title/description/keywords/canonical/OG 6종/naver·google 인증 메타/manifest/theme-color) →
헤더(브랜드+오늘 날짜, PWA 설치 배너) → 히어로(아이콘, 즐겨찾기 별, 카테고리, H1 `{앱}정답(M월D일)`,
갱신 상태 텍스트, 공유 버튼 3종) → TOC → **광고A** → `01 문제`(이미지+본문+보기) → `02 정답`
(클릭해야 펼쳐지는 `reveal` 버튼, DOM에는 항상 존재해 JS 없이도 텍스트 자체는 있지만 화면상 클릭 전엔
`display:none`) → `03 해설`(정답 펼침과 한 블록) → **광고B** → `04 참여 방법` → `05 관련 퀴즈` +
지난 정답 아코디언(`<details>`, 최근 14개) → **광고C**(전부 placeholder `<div class="ad-slot">`, 실제
`adsbygoogle` 태그 없음) → 면책 문구 → 푸터.

JSON-LD 3종: `FAQPage`(문항 1개, 다회차는 회차 수만큼), `Article`(datePublished/dateModified), `BreadcrumbList`.

## 4. 관리자 페이지(`admin.html`) 현재 동선

1. GitHub 저장소 연결(사용자명/저장소/브랜치/PAT, "이 기기에 저장" 체크 시 **`localStorage`에 토큰 평문 저장**)
2. 구글 시트 연동 — 수동 "시트 불러오기"(앱 1개 선택 시 오늘 행 배너로 미리 채움, **`round_time` 미지원**)
   + "자동 동기화 켜기"(site.sheetUrl을 커밋해 Actions가 읽게 함)
3. 앱 목록(21개, 검색 가능) — **앱을 한 번에 하나씩 선택**해서 폼을 채우고 저장하는 구조. 21개를 오늘치로
   채우려면 21번 반복.
4. 폼 저장 → GitHub Contents API로 `data/quizzes.json` + 해당 `pages/*.html` + `index.html` + `sitemap.xml`
   + `feed.xml` 5개 파일을 순차 PUT. 저장 전 `template.js`로 실시간 미리보기(iframe) 제공.
5. 오류는 `ghError()`가 401/403/404/409만 한국어로 다듬고, 그 외는 GitHub API 원문 메시지를 그대로 노출.
6. 롤백 기능 없음 — 잘못 저장하면 git 자체를 다뤄야 복구 가능.

## 5. 자동화(`sync-sheet.js` + `sync-sheet.yml`)

- `cron: "7,27,47 * * * *"` (UTC 기준 20분마다, KST 오픈시간 가중치 없음), `workflow_dispatch` 수동 실행 가능.
- `concurrency` 그룹 미설정 — 두 실행이 겹치면 레이스 가능.
- 봇 커밋에 `[skip ci]` 없음(다른 워크플로가 없어 현재는 무한루프 위험은 없지만 관례상 누락).
- **매 실행마다 `build.js`를 무조건 재실행** → 헤더의 "오늘 날짜" 텍스트와 각 앱의 `업데이트 대기`/`오늘 업데이트`
  배지가 `todayKST()` 기준으로 다시 계산돼, **실제 콘텐츠 변화가 없어도 날짜가 바뀐 날엔 22개 파일이 diff**
  나서 `chore: 구글 시트 자동 동기화` 커밋이 생성됨. 최근 로그 확인 결과 9/4~9/10 사이 최소 5회 발생, 전부
  콘텐츠 변경 없이 날짜 텍스트만 바뀐 커밋.
- `data.site.sheetUrl`이 비어 있으면 `sync-sheet.js`는 조기 종료(fetch 자체를 안 함) — 위 날짜-only 커밋은
  이 분기 이후 `build.js` 단계에서 발생하는 것이라 sheetUrl 유무와 무관하게 매일 재발함.
- 시트 스키마 검증(오타 app_id, 날짜 형식, 정답 공백 등) 없음 — 잘못된 행도 그대로 반영 시도.
- 이미지 재호스팅(WebP 변환) 없음 — 시트의 이미지 URL을 그대로 `convertDriveLink()`만 거쳐 저장.

## 6. 이미 되어 있는 것 (Phase 1-7에서 다시 만들 필요 없는 것)

- 완전 정적 HTML — 문제/정답/해설 텍스트는 이미 서버 렌더 시점에 DOM에 박혀 있음(JS 끄고 봐도 다 보임).
  단, "클릭해야 정답이 시각적으로 드러나는 UX"는 원칙 위반이 아니라 **Phase 1의 "3초 결론" 요구사항 미충족**
  문제로 분류(§8-1 참고).
- `robots.txt`가 `admin.html`만 차단하고 나머지 전체 허용(Yeti 포함, User-agent 전체 허용이라 이미 통과하지만
  명시적 `User-agent: Yeti` 줄은 없음).
- `sitemap.xml`/`feed.xml` 자동 생성, `feed.xml`은 `updatedAt` 내림차순 정렬 + 문제 텍스트 포함.
- 다회차(회차별 문제/정답/해설) 데이터 모델과 렌더링은 이미 구현됨(카카오뱅크 AI 이모지 퀴즈 1개 앱에 한함).
- PWA(manifest.json, sw.js, 홈 화면 추가 배너), 즐겨찾기(localStorage), 공유(Web Share/밴드/링크복사).
- `naverSiteVerification`/`googleSiteVerification` 메타 주입 로직은 이미 있음(값만 비어 있어 렌더 안 됨).

## 7. 데이터 원본 신뢰도 이슈

`data/quizzes.json`의 21개 앱 중 실제 오늘자 콘텐츠가 채워진 것은 **`hana-onecue-soccer`(9월 4일자, 수동
확인 후 입력) 1건뿐**이고, 나머지 20개는 여전히 최초 배포 시의 "예시 문제입니다" 자리표시자 상태다
(`updatedAt: "2000-01-01"`). 구글 시트 자동 동기화도 아직 실제 시트에 연결되지 않았다(`site.sheetUrl` 공란).

## 8. 알려진 문제 10가지

1. **"3초 안에 정답" UX 미충족** — 정답이 문제 아래 `reveal` 버튼을 눌러야 보이는 구조. Phase 1이 요구하는
   "정답 요약 카드가 최상단에 결론부터" 배치와 정면으로 다름. (텍스트는 DOM에 있으니 크롤러 관점 문제는
   아니고, 순수 방문자 UX·체류시간·이탈률 문제.)
2. **애드센스 완전 미연동** — `site.adsensePubId` 공란, 광고 슬롯 4곳 전부 `<div class="ad-slot">`
   placeholder. `adsbygoogle` 스크립트 자체가 안 실림.
3. **관리자 "21번 반복 입력" 구조** — 앱을 하나씩 선택→입력→저장해야 해서, 오늘치 21개를 다 채우려면 실제로
   21번의 개별 저장(=21번의 커밋)이 발생. Phase 3가 요구하는 "원클릭 전체 게시" 없음.
4. **PAT 기본 저장소가 `localStorage`(평문, 영구)** — "이 기기에 저장" 체크가 옵트인이긴 하나, 기본값을
   세션 한정으로 바꾸라는 Phase 3 보안 요구 미반영. 만료일 안내도 없음.
5. **날짜만 바뀌어도 매일 커밋 발생** — §5 참고. "콘텐츠 변화 없으면 커밋 안 함" 원칙이 아직 적용 안 됨.
6. **이미지가 구글드라이브 핫링크 의존** — WebP 변환·저장소 자산화 파이프라인 없음. 드라이브 권한/트래픽
   문제 한 방에 과거 페이지 이미지가 전부 깨질 수 있는 구조 그대로.
7. **JSON-LD 스키마 커버리지 부족** — `FAQPage`/`Article`/`BreadcrumbList`만 있고, `ItemList`(홈의 앱 목록),
   `WebSite`+`Organization`(사이트 단위, 현재 `WebSite`만 홈에 있고 `Organization` 없음),
   `SpeakableSpecification` 없음.
8. **필수 정적 페이지 부재** — `llms.txt`, `terms.html`, `about.html` 없음. `privacy.html`만 있음.
9. **고정 서술 콘텐츠 분량 미검증** — 각 앱 페이지의 "참여 방법" 블록이 대개 CTA 버튼 + 한 줄짜리
   `path-steps` 텍스트뿐이라, 매일 바뀌는 문제/정답을 빼면 페이지당 순수 고정 텍스트가 800자에 크게
   못 미칠 가능성이 높음(정확한 글자수는 Phase 6에서 §4.1 검증기로 측정 필요) — 21개 앱이 거의 동일한
   템플릿 문구를 공유해 "기계적 자동생성"으로 보일 리스크.
10. **검증·의사결정 인프라 전무** — `scripts/verify.js`, `docs/DECISIONS.md`, `docs/QA-REPORT.md`,
    `docs/NAVER-CHECKLIST.md`, `CHANGELOG.md` 중 어느 것도 존재하지 않았음(본 커밋에서 `docs/AS-IS.md`만
    신규 생성). 자동 롤백, 시트 스키마 검증, 링크 헬스체크도 없음.

## 9. 참고 — 티스토리 운영본과의 관계

`bookshelf-journey.tistory.com`의 "앱테크 포인트 모으기" 카테고리는 이번 사이트의 문체·목차 구조·회차
처리 방식을 참고한 원출처다. 지금까지 실제로 그 블로그의 개별 글에서 문제·정답·해설·이미지를 그대로
가져와 반영한 사례는 `hana-onecue-soccer`(9/4) 1건이며, 콘텐츠를 그대로 복제한 것이 아니라 해설을
재구성해 입력했다. 티스토리와 신규 사이트의 역할 분리 원칙은 아직 미수립 — §7(PROMPT.md 5번 항목)에서
사용자 확인 필요.
