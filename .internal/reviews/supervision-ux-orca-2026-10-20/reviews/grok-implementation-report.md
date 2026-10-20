我先看現有的 Review changes 實作和測試寫法，再依規格補上檔案欄、檢視進度與快捷鍵。規格已經對上現有的 diff 畫面。接下來會加檢視進度、檔案欄，以及還沒有註解時也能看到的送出提示。Review changes 現在在夠寬的窗格旁邊有檔案欄，並會記住每個檔案的檢視進度。

## 變更

- 新增 `useReviewProgressStore`：檢視標記只在簽名 `${insertions}:${deletions}:${status code}` 仍相同時算已看過，檔案再被改過會自動變回未看。
- 新增 `ReviewFileRail`：窗格寬度至少 640px 且不是手機時，單一檔與堆疊模式都會顯示（約 15rem，自己捲動）。內容是「已看過幾份」、進度條、路徑篩選、狀態字母、檔名與上層目錄、增刪行數，以及 Viewed 勾選。較窄時仍用原本的下拉選單。
- 審查標題列加上 Previous file / Next file。焦點在審查窗格、且不在文字欄位時：`]` 下一檔、`[` 上一檔、`v` 切換已看並跳到下一個未看的檔。超過結尾就停住。
- 目錄列改為短路徑，`title` 與 `data-review-directory` 仍是完整路徑，並維持單行截斷。
- 沒有註解草稿時，`DiffCommentSummaryBar` 顯示一行提示。有草稿時維持送出與捨棄，並在審查窗格內用 Cmd/Ctrl+Enter 送出。

## 驗證

- `pnpm --dir desktop/packages/ui run type-check`：通過。
- `pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx src/stores/useReviewProgressStore.test.ts`：6 項通過。既有的 `DiffView.headerLayout.source.test.ts` 2 項也通過。
- `eslint` 上述 TypeScript 檔案：通過。`design-system.css` 不在這個 eslint 設定的範圍內。

## 突變探針

暫時拿掉 `isViewed` 的簽名相等檢查，改成只要有標記就算已看。`useReviewProgressStore.test.ts` 的「a changed signature clears viewed」失敗：第 34 行預期 `false`，實際得到 `true`（插入行數從 2 變成 9 之後仍被當成已看）。檢查已還原，6 項測試再次通過。

## 限制

- 沒有在桌面視窗裡重跑 WebMCP。640px 欄寬與目錄截斷是靠元件測試確認的。
- `supervision-workspace-webmcp.mjs` 用目錄列的文字比對絕對路徑。目錄在 home 底下時，畫面上是短路徑；屬性值仍是完整路徑。
- 其他語系檔沒有改。新字串在工作區根目錄的 `i18n-additions.json`。合併進各語系之前，`check:locales` 會失敗。
- `@testing-library/react` 不是套件相依。這次測試是靠 `desktop/packages/ui/node_modules/@testing-library` 裡的複本解析的；重新 `pnpm install` 可能會清掉它。
- Cmd/Ctrl+Enter 送出沒有自動化測試。Context panel 的單檔 diff 仍傳 `hideStackedFileSidebar`，所以那裡不顯示檔案欄；上一檔、下一檔與鍵盤快捷鍵仍作用在同一個審查畫面。
