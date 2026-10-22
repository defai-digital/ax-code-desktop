모든 검증 공백이 해소되었습니다. `main.js`의 배선, 종료 게이팅, 확인된 수신 접수, 그리고 읽지 않았던 UI 라이브러리들이 모두 확인되었습니다. 범위 내의 어떤 파일도 읽지 않은 상태로 남아 있지 않습니다. 최종 감사 결과는 다음과 같습니다.

---

# WebMCP 감사 — HEAD 1442693e (읽기 전용)

**결론: P1 없음.** 하나의 P2와 두 개의 P3가 아래에 보고되었습니다.

## 커버리지

이번 감사에서는 작업 목록에 있는 모든 파일을 읽었습니다: `desktop-webmcp-browser.js`, `native-webmcp.js`, `webmcp-manual-outcome.js`(+`.cjs`), `webmcp-redaction.mjs`, `webmcp-catalog-projection.cjs`, `webmcp-digests.cjs`, `webmcp-view-key.mjs`, `browser-eviction.js`, `browser-shutdown.js`, `quit-coordinator.js` (거부 경로), `webmcp-page.js`, `main.js` (WebMCP 배선: 342-361, 1102-1105, 1168, 1239행), 모든 `webmcp-check*` 스크립트 포함 `webmcp-check-receipt.cjs`; UI 측면: 나열된 모든 `components/mcp/*`, `EmbeddedWebMcpBrowser.tsx`, `PermissionCard.tsx` (WebMCP 경로), `WebMcpApprovalToolInfo.tsx`, `ReviewLandingBrowserEvidence.tsx`, `SessionGrid.tsx` (WebMCP 경로), `sessionGridPopout.ts`, 그리고 나열된 모든 라이브러리/저장소/훅 (`toolHelpers`, `webMcpCalls/Diagnosis/Catalog/Summary/FailureSummary/PropertyDiff/ToolLint/ToolForm`, `revealToolPart`, `useWebMcpBrowserStore`, 모든 `useWebMcp*` 훅); `docs/webmcp-page-tools.md`.

## 이전 라운드의 수정 사항 — HEAD에서 확인됨

**보안(redaction):** 하나의 공유된 편집자(redactor); 읽은 모든 표시/로그/지속성 사이트가 이를 통과합니다 (`status`/`unloadedStatus`, close-confirm 제목, 도구 패널, 호출 스트립, 리캡, 승인 영수증, 저널, 체커 stdout+disk, `main.js:356`의 네이티브 대화 상자 — 제목은 `desktop-webmcp-browser.js:411`에서 사전 편집됨). 필터링이 잘림보다 우선되며; 키/값 및 `[name,value]` 쌍, 중첩/임베디드 JSON, 필드 경로 상속, 대괄호/따옴표로 묶인 이름, URL 자격 증명, 서명된 URL, OAuth `code`/`state`; 자리 표시자는 면제; 적대적인 입력은 안전하게 실패합니다(fail closed).

**ID:** 기본 발급 `invocationID` + 네이티브 `definitionDigest`가 카탈로그/등록/리캡/비교/만료/승인/스트립/저널에 걸쳐 적용됨; 자격 증명 모양의 이름에 대한 자리 표시자 레이블; 체커가 keyed HMAC receipts로 원본 ID를 비교함 (충돌 방지; 키는 절대 disk에 도달하지 않음); 수동 `tryTool`가 어댑터의 실제 정의에 대해 origin+generation+digest+identity를 재검증함.

**작업 손실:** 제거 프로브 기한이 있음 (250ms/1s); 끈적끈적한 `possibleUnsavedWork`; close 승인 및 `clearProject`에 팝업 포함; `beforeunload` 존중됨 (설치 후 포함); 풀이 가득 찬 상태에서 보유된 페이지 이름 지정; `closeAll`/quit/restart/update 모두 `requireBrowserClosure`에 의해 제한됨 — quit-coordinator.js:25-29에서 거부 시 quit이 취소되고, `beforeInstall` (main.js:1239)이 `quitAndInstall`을 차단함; all경로는 소유자 창 close 복구 (`ownerGone`→신뢰할 수 있는 생존자/새 창, main.js:343-350), 소유자-renderer 손실 후에도 페이지가 유지됨.

**잘못된 페이지/승인 없는 조치:** IPC는 로컬 렌더러의 메인 프레임 전용임 (main.js:1103); 모든 명령에 sender/owner 조회; 런타임 요청 ID (provider/epoch/project/session) 확인됨; 등록 중 인증된 런타임에서 세션이 확인됨; 에이전트 탐색이 generation/origin/frame에 바인딩됨; 기한이 있는 visible-to-act 및 sign-in-popup 대기; 데스크톱 제공자에 대해 "always"가 제공되지 않음; 확인 대화 상자가 기본적으로 Cancel로 설정됨.

**거짓 주장 없음:** 별개의 timeout/cancelled/uncertain 어휘가 패널+transcript에서 공유됨; stopped vs still-finishing 확인됨; 롤백 주장 없음; 전체 턴 리캡 (디스플레이 제한, 전체 복사, 원본 번호 매기기); 알 수 없는 연관성이 결코 "호출되지 않음"으로 이어지지 않음; 응답 후 영수증 유지됨; 입증된 사라짐에 대해서만 "응답되지 않음"; "활성화되었지만 부여 가능한 페이지 없음"은 "on"이라고 말하지 않음; MCP 서버 토글이 실패 시 오류를 표시함.

**프로세스/일시 중지:** 실제 프로세스 유지, 대기 중인 호출 대기열 재검토, 만료된 대기에 대한 고유한 이유 (`waiting-for-resume-timeout` / `waiting-for-visible-timeout` / `request-deadline-exceeded`), 500ms 확인 창 내에서 stop 승인; 대기열 재생은 확인이 필요한 목록에 없는 항목; 만료된 양식/거부된 정의는 실행되지 않고 명명됨.

## P2

**자격 증명 쿼리 URL 후 주소 표시줄이 비활성화됩니다.** `desktop-webmcp-browser.js:593`은 전체 URL 문자열을 반환하는데, 이는 쿼리/해시/경로 쌍이 민감한 이름 (예: `token`, `code`, `signature`)을 가질 때 `webMcpDisplayText`에 의해 `[redacted]`로 대체됩니다. `EmbeddedWebMcpBrowser.tsx:166-171`은 해당 문자열로 주소를 덮어쓰고, `:506`은 이를 마스킹합니다. 재현: `https://example.com/reset?token=abc`로 이동 → 표시줄에 `[redacted]` 표시 → Go가 이를 보냄 → `allowedUrl`이 이를 거부 → `ERR_INVALID_URL` 오류와 함께 표시됨. 영향: 페이지가 손상되지 않고 복구 가능하지만 (재입력 시), "인페이지 탐색 따르기" 문서화된 흐름이 깨지고 이것이 로드 실패처럼 보입니다. 수정: 표시에는 잘린 매개변수가 있는 URL의 편집된 *프로젝션*을 표시하되, Go/Reload를 위해 원시 URL을 상태로 유지합니다.

## P3

1. **민감한 이름의 enum 필드는 모든 옵션을 동일하게 `[redacted]`로 렌더링합니다** (`webMcpToolForm.ts:3-6`, `WebMcpToolPanel.tsx:375-380`). 위치로 선택하면 올바른 값이 제출됩니다; 사용성만 저하됩니다.
2. **브라우저 보기의 origin/browserId가 실행 중 변경되면 수동 Try-it 결과가 자동으로 삭제됩니다** (`WebMcpToolPanel.tsx:645-673`, `remember()` 조기 반환). 잘못된 내용이 표시되지 않지만, 실행된 실행이 저널에서 누락됩니다. "페이지 변경됨" 결과로 기록하는 것을 고려하세요.

감사의 목록에 있는 모든 파일이 읽혀졌습니다; 커버리지 공백은 남아 있지 않습니다. 정의상 완료 항목 3가지 충족: 이번 라운드에서 P1 발견이 없습니다.