# 설정 안내 (직접 하셔야 하는 3단계)

토큰 발급과 저장소 생성은 GitHub 로그인이 필요해서 제가 대신 할 수 없습니다.
아래 3단계만 하시면 됩니다. 약 5~10분 걸립니다.

---

## 1단계 — 저장소 두 개 만들기

GitHub 우측 상단 `+` → **New repository**

**① 앱 저장소**

| 항목 | 값 |
|---|---|
| Repository name | `ox` |
| 공개 여부 | **Public** (무료 계정에서 Pages를 쓰려면 필수) |
| Add a README file | 체크 안 함 |

**② 데이터 저장소**

| 항목 | 값 |
|---|---|
| Repository name | `ox-data` |
| 공개 여부 | **Private** ← 반드시 |
| Add a README file | **체크** (비어 있으면 첫 커밋이 없어서 초기화가 번거롭습니다) |

---

## 2단계 — 액세스 토큰 발급

토큰은 `ox-data` **하나에만**, **Contents 권한만** 주는 게 핵심입니다.
유출되더라도 다른 저장소나 계정 설정은 건드릴 수 없습니다.

1. https://github.com/settings/personal-access-tokens/new 접속
   (경로: Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token)
2. 아래대로 설정합니다.

| 항목 | 값 |
|---|---|
| Token name | `ox-wrongnote` |
| Expiration | **시험일 이후로** — 1년(Custom: 2027-08-17) 권장 |
| Repository access | **Only select repositories** → `ox-data` 만 선택 |
| Permissions → Repository permissions → **Contents** | **Read and write** |

> Contents 외에는 아무것도 건드리지 마세요. Metadata는 자동으로 Read-only가 붙는데 정상입니다.

3. **Generate token** → 화면에 뜬 `github_pat_...` 문자열을 복사합니다.
   **이 화면을 벗어나면 다시 볼 수 없습니다.** 잠시 메모장에 붙여두세요.

> ⚠️ 이 토큰을 코드 파일이나 커밋에 절대 넣지 마세요. 앱 화면에서만 입력합니다.
> 실수로 커밋하면 GitHub이 자동으로 무효화하고 메일을 보냅니다. 그때는 폐기하고 재발급하면 됩니다.

---

## 3단계 — 앱 올리기

`ox` 폴더에서 PowerShell을 열고:

```powershell
git init -b main
git add .
git commit -m "경찰 오답노트 웹앱"
git remote add origin https://github.com/<사용자명>/ox.git
git push -u origin main
```

처음 push할 때 브라우저 로그인 창이 뜹니다. 승인해 주세요.

그다음 GitHub에서 **`ox` 저장소 → Settings → Pages → Source를 `GitHub Actions`로 변경**합니다.
Actions 탭에서 초록불이 뜨면 완료입니다.

주소: `https://<사용자명>.github.io/ox/`

---

## 마지막 — 앱에서 동기화 연결

각 기기(PC, 아이폰)에서 위 주소를 열고:

1. 하단 **관리** 탭 → **☁️ 동기화**
2. 입력:
   - GitHub 사용자명: `<사용자명>`
   - 데이터 저장소 이름: `ox-data`
   - 액세스 토큰: 2단계에서 복사한 `github_pat_...`
3. **연결하고 동기화 시작**

"연결되었습니다. (비공개 저장소 확인됨)" 이 뜨면 성공입니다.
`ox-data` 저장소에 `data.json`이 생긴 걸로도 확인할 수 있습니다.

아이폰에서는 사파리 공유 → **홈 화면에 추가** 까지 하면 앱처럼 씁니다.

---

## 자주 막히는 곳

| 증상 | 원인과 해결 |
|---|---|
| "저장소를 찾을 수 없습니다" | 토큰의 Repository access에 `ox-data`가 선택됐는지 확인. 사용자명 철자도 확인. |
| "이 저장소에 쓸 권한이 없습니다" | 토큰 권한이 Contents **Read and write**가 아니라 Read-only입니다. 재발급하세요. |
| "토큰이 올바르지 않거나 만료되었습니다" | 복사할 때 앞뒤 공백이 섞였거나 만료됐습니다. |
| 연결은 됐는데 "이 저장소는 공개 상태입니다" 경고 | `ox-data`를 Private으로 안 만드셨습니다. Settings → General → 맨 아래 Change visibility. |
| Actions가 빨간불 | `package-lock.json`이 커밋됐는지 확인하세요. `npm ci`가 이 파일을 요구합니다. |

---

## 알아두실 것

- **동기화 시점**: 등록·수정 후 약 6초 뒤, 앱을 벗어날 때, 앱을 켤 때, 인터넷이 돌아왔을 때 자동으로 올라갑니다. 관리 탭에서 수동 실행도 됩니다.
- **오프라인**: 인터넷이 없어도 앱은 그대로 동작합니다. 로컬에 쌓아뒀다가 연결되면 자동으로 맞춥니다.
- **충돌**: 두 기기에서 동시에 작업해도 조용히 덮어쓰이지 않습니다. 문제 내용은 나중에 고친 쪽이 이기고, **풀이 기록은 양쪽이 합산**됩니다.
- **복구**: `ox-data` 저장소의 커밋 목록에서 예전 `data.json`을 열어 내용을 복사한 뒤, 앱의 관리 → 백업 → 붙여넣기 가져오기로 되돌릴 수 있습니다.
- **JSON 백업은 계속 쓰세요.** 동기화는 실수로 지운 것까지 같이 퍼뜨립니다. 홈 화면의 백업 알림이 그 안전망입니다.
