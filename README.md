# 롤모델 · ROLLMODEL

주차로봇·AGV 캐스터의 하중, 접촉압, 도막 손상, 발열을 연결해 판정하는 설계 스크리닝 도구입니다. 서버·외부 JavaScript·프레임워크 없이 실행됩니다. 글꼴을 불러오지 못해도 시스템 글꼴로 동작합니다.

**웹 실행:** [hljihun98.github.io/Roll-Model](https://hljihun98.github.io/Roll-Model/)

처음 방문하면 **시작 가이드**가 열립니다. 6단계의 설명과 비교 예시로 입력이 접촉압·발열·판정에 미치는 영향을 살펴볼 수 있습니다. **건너뛰기 / Esc**로 닫고 상단 **시작 가이드**에서 다시 볼 수 있습니다. 가이드의 예시는 현재 설계 입력을 변경하지 않습니다. 가이드 종료 여부만 브라우저에 저장하며, 저장 기능이 차단돼도 계산은 동작합니다.

**바로 실행:** [index.html](index.html)을 내려받아 브라우저에서 여십시오. GitHub 저장소의 파일 미리보기에서는 프로그램이 실행되지 않으므로, 웹에서 사용하려면 아래 GitHub Pages를 설정합니다.

## GitHub Pages로 실행

1. 이 폴더의 파일을 GitHub 저장소에 올립니다. `src/`, `tests/`, `scripts/`, `.github/`, `package-lock.json`, `index.html`을 포함합니다. `node_modules/`, `dist/`, `test-results/`는 올리지 않습니다.
2. 저장소의 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다.
3. **Actions → Verify and deploy Pages → Run workflow**에서 기본 브랜치를 실행합니다. 이후에는 기본 브랜치에 push할 때 자동으로 검증하고 배포합니다.
4. 성공한 작업의 `github-pages` 배포 링크 또는 Settings → Pages의 주소를 엽니다. 일반 프로젝트 저장소 주소는 `https://<계정>.github.io/<저장소>/`입니다.

Windows·Linux 물리 검증과 브라우저 검증을 모두 통과해야 배포합니다. Pull Request에서는 검증만 실행합니다. 배포에는 GitHub가 제공하는 작업 토큰을 사용하며 별도 개인 토큰은 필요하지 않습니다. 최초 실행에서 Pages가 아직 설정되지 않아 배포가 실패했다면 2단계 설정 후 작업을 다시 실행합니다.

워크플로는 [GitHub 공식 Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)의 configure/upload/deploy 흐름을 사용합니다.

## 로컬 개발

Node.js 22 이상이 필요합니다. CI는 Node.js 24를 사용합니다. 앱을 실행하는 데 Node.js나 npm 패키지는 필요하지 않으며, 아래 도구는 개발·검증용입니다.

```sh
npm ci
npx playwright install chromium
npm run build
npm start
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 소스를 수정하면 `npm run build` 후 브라우저를 새로고침합니다. Windows PowerShell이 `npm.ps1` 실행을 차단하면 같은 명령에서 `npm.cmd`, `npx.cmd`를 사용합니다.

```sh
npm test             # 물리 검증 + 추가 회귀 + 빌드/서버 검사
npm run test:ui      # 브라우저 상호작용·파일 왕복·반응형
npm run build:check  # index.html과 src/가 동일한지 검사
npm run check        # 전체 검증
```

Linux에서 브라우저 실행 라이브러리가 필요하면 `npx playwright install --with-deps chromium`을 실행합니다. 모든 검증 실패는 종료코드 1을 반환합니다.

## 파일 구조

```text
index.html                   브라우저·GitHub Pages 진입점, 빌드 생성 후 커밋
src/
  10_style.html              스타일
  20_state.js                기본값·시나리오
  25_validation.js           입력·설정 파일 검증
  30_engine.js               순수 물리 함수
  31_compute.js              판정·개선안·열 보정
  40_body.html               마크업
  50_ui.js                   입력·도면·표·저장
  60_guide.js                첫 사용자 안내·독립 비교 예시
scripts/
  build.cjs                  Node 내장 기능으로 HTML 결합
  serve.cjs                  로컬 미리보기 서버
tests/                       물리·회귀·UI·반응형 검사
docs/
  DEVELOPMENT.md             개발 규약
  MODEL-NOTES.md             모델 변경 이유와 적용 범위
  archive/report.html        이전 개발 보고서, 현재 사양 아님
.github/workflows/
  verify-and-deploy.yml      검증 후 Pages 배포
dist/                        배포 생성물, Git 제외
test-results/                반응형 스크린샷, Git 제외
```

`npm run build`는 루트 `index.html`과 `dist/index.html`, `dist/standalone.html`, `dist/artifact.html`을 생성합니다. 앞의 세 HTML은 동일한 단독 실행 파일이며, `artifact.html`은 아티팩트 뷰어용 본문입니다. `src/`와 생성된 루트 `index.html`을 함께 커밋하십시오. CI가 불일치를 탐지합니다. Pages에는 `dist/`만 배포하므로 소스·테스트·과거 보고서가 사이트에 포함되지 않습니다.

## 판정과 모델 범위

- **가능:** 구현된 모든 검사에서 허용 범위 이내.
- **주의:** 근사·적용 한계 또는 허용치 근처/초과 경고 구간. 별도 확인 필요.
- **불가:** 허용치 초과, 하중 지지 불성립 또는 모델 적용 불가.

휠 들림과 지지 불가능한 편심은 종합 불가입니다. 잘못된 안전율·치수·설정 형식은 계산 전에 거부합니다. 주변온도가 재료 허용온도를 넘으면 정지 중에도 불가입니다.

층상체에는 출처 불명 강성 보간을 적용하지 않습니다. 도막·기재 균질체 비교로 면압을 스크리닝하며 실제 층상해의 상한은 보장하지 않습니다. 크라운의 타원 Hertz 접촉압에는 바닥 곡률을 반영하지만, 후속 전단·인장·기재 전달·열의 3D 모델은 미구현이므로 종합 통과를 내리지 않습니다.

이 도구는 반복 피로·정차 크리프·베어링 수명을 포함하지 않으며 FEM이나 인증 계산서를 대체하지 않습니다. 상세 근거와 변경 내용은 [모델 설명](docs/MODEL-NOTES.md), 수정 규약은 [개발 지침](docs/DEVELOPMENT.md)에 있습니다.
