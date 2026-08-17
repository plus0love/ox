# 경찰 오답노트

2026-09-05 경찰공무원 필기시험 대비 오답 반복학습 웹앱. 서버 없이 브라우저에만 저장됩니다.

## 실행

```bash
npm install
npm run dev -- --host     # 같은 와이파이의 아이폰에서 접속 가능
npm run build             # dist/ 생성
```

`npm run dev` 실행 후 터미널에 찍히는 `Network: http://192.168.x.x:5173` 주소를 아이폰 사파리에 입력하면 됩니다.
사파리 공유 → **홈 화면에 추가** 하면 앱처럼 전체화면으로 쓸 수 있습니다.

## GitHub Pages 배포

`vite.config.js`의 `base: './'` 덕분에 하위 경로에서도 동작합니다.

```bash
npm run build
# dist/ 폴더 내용을 gh-pages 브랜치(또는 docs/)에 올리고 Pages 설정
```

## 기기 간 동기화

어느 기기에서 열어도 이어서 풀 수 있도록, 비공개 GitHub 저장소(`ox-data`)에 데이터를 보관합니다.
**설정 절차는 [SETUP.md](SETUP.md)** 를 보세요.

```
ox       (public)  앱 코드 · GitHub Pages로 배포
ox-data  (private) data.json + images/  ← 실제 오답 데이터
```

- **로컬 우선**: 화면은 항상 localStorage를 보고 그립니다. 인터넷이 없어도 앱이 돌아갑니다.
- **덮어쓰지 않음**: 올리기 전에 항상 원격을 읽어 병합합니다. 브랜치 이동은 force 없이 하므로,
  다른 기기가 먼저 올렸으면 GitHub이 거부하고(409) 다시 합쳐서 재시도합니다.
- **병합 규칙**
  | 대상 | 방식 |
  |---|---|
  | 문제 내용 | `updatedAt`이 최신인 쪽 채택 |
  | 삭제 | tombstone(`deleted`)이 문제의 `updatedAt`보다 나중이면 삭제 확정 |
  | 풀이 통계 | 합쳐진 `logs`에서 **재계산** — 양쪽 풀이가 합산됨 |
  | 과목 목록 | `subjectsUpdatedAt`이 최신인 쪽 채택 |

  통계를 문제 객체째로 덮어쓰지 않고 로그에서 다시 계산하는 게 핵심입니다.
  그러지 않으면 폰과 PC에서 각각 푼 기록 중 한쪽이 사라집니다.

- **토큰**은 `ox-wrongnote-github-v1` 키에 따로 저장합니다. 앱 데이터와 분리되어 있어
  **JSON 백업이나 원격 `data.json`에 절대 포함되지 않습니다.**

## 데이터 저장 위치

| 데이터 | 저장소 | 키 |
|---|---|---|
| 문제·통계·학습로그 | localStorage | `ox-wrongnote-v1` |
| 진행 중 퀴즈 세션 | localStorage | `ox-wrongnote-session-v1` |
| 동기화 설정(토큰) | localStorage | `ox-wrongnote-github-v1` |
| 동기화 상태 | localStorage | `ox-wrongnote-syncmeta-v1` |
| 첨부 이미지 | IndexedDB | `ox-wrongnote` / `images` |
| 원격 사본 | GitHub `ox-data` | `data.json`, `images/*.jpg` |

이미지는 localStorage 용량(약 5MB)을 지키기 위해 IndexedDB에 따로 저장하고,
저장 전에 최대 1280px · JPEG 품질 0.72로 자동 압축합니다.

> **중요**: 동기화를 켜도 JSON 백업은 계속 쓰세요.
> 동기화는 실수로 지운 것까지 같이 퍼뜨립니다. 홈 화면의 백업 알림이 안전망입니다.

## 출제 가중치 규칙

| 상황 | 가중치 |
|---|---|
| 한 번도 정답 못 냄 | 14 이상 (최우선) |
| 미시도 | 8 |
| 정답률 r | `1 + (1-r)×9` |
| 연속 정답 2 / 3 / 4회 | ×0.4 / ×0.25 / ×0.12 |
| 직전 오답 (1일 내 / 3일 / 7일) | ×2.0 / ×1.6 / ×1.3 |

한 세션 안에서는 같은 문제가 중복 출제되지 않습니다(비복원 추출).
'최근 등록순' 범위만 가중치를 쓰지 않고 등록 역순 그대로 출제합니다.

## 폴더 구조

```
src/
  App.jsx              상태·저장·동기화·백업 등 모든 액션의 단일 소유자
  lib/
    store.js           localStorage 읽기/쓰기, 스키마 보정, 병합, 세션
    quiz.js            가중치 계산 · 출제 목록 생성
    imagedb.js         IndexedDB 이미지 저장소
    github.js          GitHub Git Data API 래퍼 (원자적 다중 파일 커밋)
    sync.js            읽기 → 병합 → 올리기 · 충돌 재시도 · 이미지 동기화
    util.js            id·날짜·이미지 압축 유틸
  components/
    ui.jsx             버튼/카드/칩/모달 등 공통 UI
    ProblemForm.jsx    등록·수정 공용 폼
    ProblemImage.jsx   이미지 로딩 + 확대 보기
    SyncPanel.jsx      동기화 설정 화면
  tabs/
    HomeTab.jsx        D-day · 통계 · 취약 문제
    QuizTab.jsx        설정 → 풀이 → 결과
    AddTab.jsx         오답 등록
    ManageTab.jsx      목록·검색·수정·삭제·백업·과목 편집
```
