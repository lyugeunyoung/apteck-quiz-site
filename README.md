# 오늘의 앱테크 — 앱테크 퀴즈 정답 사이트

토스, 카카오뱅크, 카카오페이, 신한 SOL, KB Pay·스타뱅킹, 하나원큐, NH올원뱅크, 케이뱅크, 나만의닥터,
닥터나우, monimo, H.Point, 비트버니, 기후행동 기회소득 등 **21개** 앱테크 퀴즈의 오늘의 문제·정답·해설을
한 곳에 모아 보여주는 모바일 우선 정적 사이트입니다.

- **퍼블릭 사이트**: 순수 정적 HTML/CSS/JS (빌드 도구, 서버, DB 없음) → GitHub Pages로 무료 호스팅
- **관리자 페이지(`admin.html`)**: 오늘의 문제를 입력하면 GitHub API로 `data/quizzes.json` +
  해당 퀴즈 페이지 + 홈 화면(`index.html`) + `sitemap.xml` + `feed.xml`을 한 번에 커밋 → 별도 서버/DB 없이
  콘텐츠가 즉시 갱신됩니다.
- **검색 최적화**: Google·네이버 상위 노출을 겨냥한 구조화 데이터, RSS 피드, 사이트맵, 지난 정답 아카이브 내장
- **재방문 기능**: 공유하기(Web Share/밴드/링크복사), 즐겨찾기(★), 홈 화면 설치(PWA) 지원

---

## 1. GitHub 저장소 만들고 배포하기

1. [github.com](https://github.com) 에서 새 저장소를 만듭니다. (Public, 이름 예: `apteck-quiz-site`)
2. 이 폴더 전체를 그 저장소에 올립니다. 터미널이 편하다면:

   ```bash
   cd apteck-quiz-site
   git init
   git add .
   git commit -m "초기 사이트 커밋"
   git branch -M main
   git remote add origin https://github.com/사용자명/저장소명.git
   git push -u origin main
   ```

   (터미널이 불편하면 GitHub 웹사이트의 "Add file → Upload files"로 폴더 내용을 그대로 드래그 앤 드롭해도 됩니다.)
3. 저장소 **Settings → Pages** 로 이동해 **Source: Deploy from a branch**, **Branch: main / (root)** 선택 후 저장합니다.
4. 몇 분 뒤 `https://사용자명.github.io/저장소명/` 에서 사이트가 열립니다.

### baseUrl 설정 (필수)

`data/quizzes.json` 맨 위 `"baseUrl"` 값을 실제 주소로 바꾸고, 아래 명령으로 모든 페이지를 다시 빌드해 함께 커밋하세요.
(관리자 페이지에서 저장할 때마다 이 값 기준으로 SEO 태그·sitemap·OG 이미지 주소가 생성됩니다.)

```bash
node scripts/build.js
```

`robots.txt`의 `Sitemap:` 줄도 같은 주소로 바꿔주세요.

---

## 2. 관리자 페이지 사용하기 (`admin.html`)

배포된 사이트의 `/admin.html`로 접속하세요. (예: `https://사용자명.github.io/저장소명/admin.html`)
이 페이지는 `robots.txt`에서 검색엔진 색인을 막아뒀지만, URL을 아는 사람은 누구나 열 수 있는 페이지이므로
**URL을 공개하지 말고**, 필요하면 나중에 별도 로그인 보호를 추가하는 것을 권장합니다.

1. **GitHub Personal Access Token 만들기**
   GitHub → 우측 상단 프로필 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: 이 저장소만 선택
   - Permissions → **Contents: Read and write** 로 설정
   - 생성된 토큰(`github_pat_...`)을 복사해두세요. (다시 볼 수 없으니 안전한 곳에 보관)
2. `admin.html`에서 사용자명 / 저장소명 / 브랜치(main) / 토큰을 입력하고 **불러오기**.
3. 앱 목록(21개, 검색창으로 빠르게 찾기 가능)에서 오늘 갱신할 앱을 탭 → 문제/이미지/보기/정답/해설을 입력 →
   하단 미리보기로 실제 페이지 확인 → **GitHub에 저장 & 게시** 클릭.
4. 약 30초~1분 뒤 실제 사이트에 반영됩니다.
5. **새 퀴즈 앱 추가**로 22번째 이후 앱도 계속 추가할 수 있습니다. 앱 ID는 영문 소문자와 하이픈만 사용하세요.
   카테고리는 기존에 쓰던 값이 자동완성 목록으로 뜨니, 오타로 새 카테고리가 갈라지지 않도록 그 목록에서 고르세요.

> 토큰은 서버로 전송되지 않고 이 브라우저에서 GitHub API로 직접 호출하는 데만 쓰입니다.
> "이 기기에 저장"을 체크하면 브라우저 `localStorage`에 남으니 공용 PC에서는 체크하지 마세요.

### 어제 정답은 사라지지 않아요 — 지난 정답 모음

같은 앱을 새 날짜로 저장하면, 직전 `오늘의 정답`이 자동으로 그 페이지의 **"📚 지난 정답 모음"**
아코디언에 쌓입니다(최근 14회차 보관). 검색엔진에는 실제 HTML 텍스트로 노출되므로 "9월 2일 토스
행운퀴즈 정답"처럼 날짜가 포함된 롱테일 검색에도 같은 페이지가 걸릴 수 있습니다.

---

## 3. 문제 이미지 — 구글 드라이브 링크 검토 결과

관리자 페이지의 **문제 이미지 URL** 칸에 구글 드라이브 공유 링크를 붙여넣고 **[변환]**을 누르면
`https://drive.google.com/file/d/파일ID/view?usp=sharing` 같은 형태를 브라우저에서 바로 이미지로
표시 가능한 `https://lh3.googleusercontent.com/d/파일ID=w1200` 형태로 자동 변환합니다. `open?id=`,
`uc?id=` 형태도 인식합니다. 저장 시 이 변환된 값이 그대로 `data/quizzes.json`에 기록됩니다.

**사용 전 꼭 확인하세요 — 구글 드라이브 이미지 링크의 실제 제약:**

- 드라이브 파일의 공유 설정이 **"링크가 있는 모든 사용자 – 뷰어"** 로 되어 있어야 합니다. "제한됨"이면
  방문자에게는 깨진 이미지로 보입니다.
- 구글 드라이브는 정식 이미지 CDN이 아닙니다. 트래픽이 순간적으로 몰리거나 구글이 어뷰징으로 판단하면
  "다운로드 한도 초과" 안내와 함께 이미지가 일시적으로 안 뜰 수 있습니다. 검색엔진(구글 이미지, 네이버)이
  이미지를 정기적으로 재크롤링할 때도 같은 문제가 생길 수 있어, **이미지 자체가 SEO 자산이 되어야 하는
  페이지에는 권장하지 않습니다.**
- 파일을 삭제·이동하거나 공유 설정을 바꾸면 이미 올라간 모든 페이지의 이미지가 한 번에 깨집니다.
- 그래서 페이지에는 `referrerpolicy="no-referrer"`와 `loading="lazy"`를 기본 적용해 두었고, 드라이브
  링크일 때는 이미지 아래에 안내 문구가 자동으로 붙습니다.

**더 안정적인 대안**: 이미지를 `assets/img/quiz/` 같은 폴더에 넣어 저장소에 직접 커밋하고,
관리자 페이지의 이미지 URL 칸에 `../assets/img/quiz/파일명.jpg` 처럼 저장소 내 상대 경로를 입력하세요.
GitHub Pages가 자체 CDN으로 서빙하므로 속도·안정성·SEO 모두 드라이브보다 유리합니다. 소량이고 빠르게
시작하고 싶을 때만 드라이브 링크를 임시로 쓰는 것을 권장합니다.

---

## 4. 검색 상위 노출 — 구글·네이버 정책 검토 및 반영 사항

### 이미 반영된 것

| 항목 | 내용 |
|---|---|
| 모바일 최적화 | 반응형 + 모바일 우선 레이아웃 (구글 모바일 우선 색인 대응) |
| 고유 메타 | 앱·날짜별로 다른 `<title>`/`description`/canonical 자동 생성 |
| 구조화 데이터 | `Article`(datePublished/dateModified로 최신성 신호), `BreadcrumbList`, `FAQPage`를 페이지마다 삽입 |
| 소셜 미리보기 | `og:image`/`twitter:card` — 문제 이미지가 있으면 그 이미지를, 없으면 기본 OG 이미지를 사용 |
| 사이트맵 | `sitemap.xml` 자동 생성·갱신 |
| RSS 피드 | `feed.xml` 자동 생성 — 새 글이 빠르게 수집되도록 최신 갱신순으로 정렬 |
| 롱테일 콘텐츠 | "지난 정답 모음"으로 과거 날짜 검색어까지 같은 URL이 커버 |
| 크롤러 제어 | `robots.txt`에서 `admin.html`만 비공개, 나머지는 전체 허용 |

### 직접 등록해야 하는 것 (둘 다 무료, 소유자 인증 필요)

**Google Search Console**
1. https://search.google.com/search-console 접속 → "URL 접두어"로 사이트 등록
2. 소유권 확인은 "HTML 태그" 방식 추천 → 발급받은 `content="..."` 값을
   `data/quizzes.json`의 `"site.googleSiteVerification"`에 붙여넣고 `node scripts/build.js` 후 재배포
3. 등록 후 `sitemap.xml` 제출 (예: `https://사용자명.github.io/저장소명/sitemap.xml`)

**네이버 서치어드바이저** (한국 검색 트래픽에 중요 — 구글 인증과 별개로 반드시 진행)
1. https://searchadvisor.naver.com 접속 → 사이트 등록
2. 소유 확인은 "HTML 태그" 방식 → 발급 코드값을 `data/quizzes.json`의
   `"site.naverSiteVerification"`에 붙여넣고 재빌드·재배포
3. 등록 후 **사이트맵 제출**(`sitemap.xml`)과 **RSS 제출**(`feed.xml`) 둘 다 등록하세요. 네이버는 RSS를
   통한 신규 콘텐츠 수집이 빨라, 매일 바뀌는 이 사이트 특성상 특히 중요합니다.
4. "웹마스터 도구 > 요청 > 수집 요청"으로 오늘 갱신한 페이지 URL을 직접 넣으면 더 빠르게 반영됩니다.

두 값 모두 채운 뒤에는 아래를 실행해 전체 페이지에 인증 메타 태그를 반영하세요.

```bash
node scripts/build.js
```

---

## 5. 재방문 유도 기능

- **공유하기**: 모바일에서는 OS 공유 시트(카카오톡·문자 등 포함)를 여는 `navigator.share`를 우선 사용하고,
  지원하지 않는 브라우저에서는 자동으로 숨겨지고 "밴드로 공유"·"링크 복사" 버튼만 남습니다.
- **즐겨찾기(★)**: 브라우저가 더 이상 페이지에서 실제 북마크를 추가하도록 허용하지 않기 때문에(보안상
  모든 최신 브라우저가 막음), 대신 방문자별 `localStorage`에 저장되는 사이트 내 즐겨찾기를 구현했습니다.
  각 카드/상세 페이지의 별 아이콘을 누르면 홈 화면의 **⭐ 즐겨찾기** 칩으로 필터링해서 볼 수 있습니다.
- **홈 화면에 추가 (PWA)**: `manifest.json` + `sw.js`(서비스워커)를 갖춰 설치 가능한 앱으로 동작합니다.
  Chrome/삼성인터넷/엣지에서는 자체 "추가하기" 배너가 뜨고, iOS Safari는 자동 배너가 불가능한 정책이라
  "공유 버튼 → 홈 화면에 추가" 안내 문구를 대신 보여줍니다. 서비스워커는 CSS/JS/아이콘 같은 정적 자원만
  캐시하고, 퀴즈 HTML은 항상 네트워크에서 새로 받아오도록 만들어 **오늘의 정답이 캐시로 인해 오래된
  내용으로 보이는 일이 없습니다.**
- **앱 아이콘**: `assets/img/icon-*.png`, `og-default.png`는 코인 모티프로 자동 생성해 뒀습니다.
  브랜드를 바꾸고 싶으면 같은 파일명·크기(192/512/512 maskable/180)로 교체하세요.

---

## 6. 실제 광고(Google AdSense) 연결하기 — 중요 제약사항

⚠️ 애드센스 승인·연동은 사이트 소유자 본인 계정으로만 진행할 수 있습니다. 순서는 다음과 같습니다.

1. 사이트가 GitHub Pages에 실제로 공개된 뒤, 콘텐츠(각 퀴즈 페이지)가 최소 여러 개 이상 쌓이고 방문 트래픽이 생기면
   [Google AdSense](https://adsense.google.com)에 본인 계정으로 가입 신청합니다.
2. 승인 심사 중 사이트 소유권 확인을 요구하면, AdSense가 안내하는 메타태그 또는 `ads.txt` 방식으로 인증합니다.
3. 승인되면 발급받는 **게시자 ID**(`pub-XXXXXXXXXXXXXXXX`)를 두 곳에 반영하세요.
   - `ads.txt` 파일의 `pub-0000000000000000` 부분을 교체
   - `data/quizzes.json`의 `"site.adsensePubId"` 값에 입력 후 `node scripts/build.js` 재실행 → 커밋
     (이 값이 채워지면 모든 페이지 `<head>`에 애드센스 로더 스크립트가 자동으로 들어갑니다.)
4. 각 페이지의 `<div class="ad-slot">` 자리에 애드센스에서 발급한 `<ins class="adsbygoogle">` 광고 유닛 코드를 넣고
   싶다면 `assets/js/template.js`의 `adSlot()` 함수를 수정하세요. (현재는 광고 자리 표시자만 있습니다.)

**Claude 아티팩트로 미리 본 데모 링크는 애드센스 광고가 뜨지 않습니다.** Claude의 웹페이지 미리보기는
보안 정책상 외부 광고 스크립트 로딩을 차단하기 때문입니다. 실제 수익화는 반드시 이 저장소를 GitHub Pages(또는
Netlify/Vercel 등)에 올린 뒤에만 가능합니다.

---

## 7. 파일 구조

```
apteck-quiz-site/
├── index.html                 # 홈 (앱 목록) — admin.html 저장 시 자동 재생성
├── admin.html                  # 관리자 페이지
├── privacy.html                 # 개인정보처리방침 (애드센스 심사에 필요)
├── manifest.json                # PWA 매니페스트 (홈 화면 추가)
├── sw.js                         # 서비스워커 (정적 자원 캐시)
├── ads.txt                       # 애드센스 게시자 인증 파일
├── robots.txt / sitemap.xml / feed.xml   # 검색엔진·RSS용 — admin.html 저장 시 자동 재생성
├── data/quizzes.json              # 전체 콘텐츠 원본 데이터 (source of truth, 21개 앱 + 지난 정답 이력)
├── pages/*.html                   # 앱별 퀴즈 상세 페이지(21개) — admin.html 저장 시 자동 재생성
├── assets/css/style.css           # 디자인 시스템
├── assets/img/                    # 아이콘, 기본 OG 이미지, (선택) 직접 올린 문제 이미지
├── assets/js/template.js          # 페이지 HTML을 만드는 공용 렌더러 (Node·브라우저 겸용)
├── assets/js/admin.js             # 관리자 페이지 로직 (GitHub API 연동, 드라이브 링크 변환 등)
├── assets/js/site.js              # 홈 화면 카테고리 필터 + 검색 + 즐겨찾기 필터
├── assets/js/quiz.js              # 정답 펼치기, 공유 버튼, 목차 스크롤 스파이
├── assets/js/favorites.js         # 즐겨찾기(★) localStorage 로직 — 홈/상세 공통
├── assets/js/pwa.js               # 홈 화면 추가 배너, 서비스워커 등록
└── scripts/build.js               # data/quizzes.json → 전체 HTML/사이트맵/RSS 재생성 (수동 실행용)
```

`data/quizzes.json`을 직접 텍스트 편집기로 고쳐도 되며, 이 경우 `node scripts/build.js`를 실행해
`index.html`, `pages/*.html`, `sitemap.xml`, `feed.xml`을 다시 만든 뒤 커밋하면 됩니다. (Node.js 설치 필요)

### 새 퀴즈 앱을 계속 추가하려면

구조상 앱 개수 제한은 없습니다 — `data/quizzes.json`의 `apps` 배열에 항목을 추가하고 빌드하면 몇 개든
늘어납니다. 가장 쉬운 방법은 관리자 페이지의 **"+ 새 퀴즈 앱 추가"**를 쓰는 것이고, 대량으로 미리
등록하고 싶다면 `data/quizzes.json`에 기존 항목을 복사해 `id`/`page`/`name` 등을 바꾼 뒤
`node scripts/build.js`를 실행하세요.

---

## 8. 콘텐츠 관련 안내

최초 배포 시 각 앱 페이지에는 "예시 문제입니다" 형태의 자리표시자 콘텐츠가 들어 있습니다.
실제 방문자에게 정확한 정보를 제공하려면 반드시 관리자 페이지에서 그날 각 앱에 실제로 출제된
문제·정답·해설로 갱신한 뒤 공개하세요. (각 앱의 퀴즈 문제는 저작권/약관상 앱 화면을 참고해 직접
확인하고 요약·해설을 작성하는 것을 권장합니다.)
