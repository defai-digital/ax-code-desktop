由 `SessionChangesView` 顯示代理改過的檔案，與 git 狀態無關。

## 變更檔案

- `desktop/packages/ui/src/components/views/DiffView.tsx`：範圍選項與路由。
- `desktop/packages/ui/src/components/views/SessionChangesView.tsx`（新）：載入、錯誤與重試、空狀態、檔案列、唯讀 diff。
- `desktop/packages/ui/src/components/views/SessionChangesView.test.tsx`（新）。
- `desktop/packages/ui/src/components/views/ReviewFileRail.tsx`：接受帶 `signature` 與狀態字母的一般列。
- `desktop/packages/ui/src/stores/useReviewProgressStore.ts`：`reviewContentSignature`（FNV-1a 32-bit，雜湊 `after` 與 `status`）。
- `desktop/packages/ui/src/stores/useReviewProgressStore.test.ts`。
- `desktop/packages/ui/src/styles/design-system.css`：附加 `/* Session changes */`。
- `desktop/packages/ui/src/lib/i18n/messages/en.ts` 與工作樹根目錄 `i18n-additions.json`。

未提交。

## 驗證

- `pnpm --dir desktop/packages/ui run type-check`：通過。
- Vitest 4 個檔案、19 個測試：通過。涵蓋 `SessionChangesView.test.tsx`、`useReviewProgressStore.test.ts`、`ReviewFileRail.test.tsx`、`DiffView.headerLayout.source.test.ts`。
- `eslint`（上述 TypeScript 檔）：通過。

測試涵蓋：沒有工作階段時不顯示新範圍；整個工作階段不帶 `messageID`；最後一輪使用最新使用者訊息（含 `info.role`）；空狀態、錯誤與 Retry；`[`、`]`、`v`；寬度與兩側皆非空才並排；行數相同但 `after` 改寫時已讀標記會清掉。

## 變異探測

暫時讓 `reviewContentSignature` 只雜湊 `status`、略過 `after`，然後還原。失敗的測試：

- `a rewrite with the same line counts changes the content signature`（兩次雜湊都是 `73eebb44`）。
- `viewed resets when after changes and the line counts stay the same`（核取方塊仍保持勾選）。

還原後這兩個測試再次通過。

## 已知限制

- 新範圍沿用現有選擇器條件：審查窗、未釘選 `diffScope`、有目錄，且 `isGitRepo !== false`。非 git 目錄與已釘選 staged/working 的情境不會出現這兩個選項。
- 這兩個範圍沒有 stage、revert、在編輯器開啟，也沒有堆疊模式。二進位與圖片仍以文字 diff 呈現。
- `session_diff` 只當重新抓取的訊號。鍵已存在（含空陣列）時，轉為 idle 不會再抓。鍵不存在時，只在 `busy` 或 `retry` 轉成 `idle` 時再抓。第一次看到狀態不會多抓一次；掛載時一定抓一次。
- 沒有使用者訊息時，「Last turn」顯示空狀態，且不會呼叫 API。
- 並排條件是兩側都有內容。偏好為 `dynamic` 時還要窗格至少 1100px。新設定檔預設是 `inline`，所以要使用者改成 `dynamic` 或 `side-by-side` 才會並排。任一侧為空時隱藏版面切換，並以單欄顯示。
- 已讀進度鍵是 `session` 與 `turn:<messageID>`。
- 以 Vitest 與 jsdom 驗證，沒有啟動桌面應用程式。
