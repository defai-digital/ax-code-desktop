�條件，我先把較晚的工具與使用者訊息排進去，再做一次突變檢查。Mission Control 的每一列現在會在標題下方顯示一行最近活動，讓監督者不用打開工作階段就能判斷代理正在做什麼。

進行中的待辦優先，顯示為「Working on: …」。沒有待辦時，若該工作階段的訊息已經載入，就取最新一則助理的 `text` 片段：第一個非空白行、空白折成一格、最多 140 字（含省略號）。工具輸出、推理、檔案片段，以及看起來像憑證的字串都不會出現。訊息或片段還沒載入時，這一列是 `null`。

這行只在 Comfortable 密度、而且該列沒有目標或錯誤說明時顯示。完整文字放在 `title`。「Open — …」、「Details — …」、「Select …」這些無障礙名稱沒有改。串流若沒有改變預覽文字，列陣列保持同一個參考。

## 變更的檔案

- `desktop/packages/ui/src/lib/supervision/activityPreview.ts` 與 `activityPreview.test.ts`
- `desktop/packages/ui/src/lib/supervision/rows.ts`
- `desktop/packages/ui/src/hooks/useSupervisionRows.ts`
- `desktop/packages/ui/src/hooks/useSupervisionRows.test.tsx`（既有 mock 補上 `useChildStoreManager`，否則發佈端的新訂閱會讓原測試無法掛載）
- `desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx` 與其測試
- `desktop/packages/ui/src/styles/design-system.css`（只加了 `.mission-activity`）
- `desktop/packages/ui/src/lib/i18n/messages/en.ts`
- `i18n-additions.json`

## 驗證

- `pnpm --dir desktop/packages/ui run type-check` 通過。
- Vitest 三個檔案共 44 項通過：`activityPreview.test.ts`、`useSupervisionRows.test.tsx`、`MissionControlRow.test.tsx`。調整助理文字案例後，該檔 6 項再次通過。
- `eslint` 對上述原始檔通過。

## 突變檢查

拿掉「只接受 `type === "text"`」這個條件後，`uses only the latest assistant text part` 失敗，預覽變成 `entire file contents`。條件已放回，該測試再次通過。

## 限制

- 預覽只看根工作階段。子代理的待辦或最後一句話不會出現在根列上。
- 待辦可以在目錄 store 裡就顯示。助理文字要等該工作階段的訊息與片段載入，通常是曾經打開過的工作階段。
- 140 字上限只套在助理文字。待辦全文放在 `title`，畫面上由 CSS 截成一行。
- 憑證判斷是常見金鑰格式，不是完整的秘密掃描。
