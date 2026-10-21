已完成多選與批次操作，包含群組三態、選取修剪、工作集、確認後逐項停止／封存及結果摘要。Pop-out 保留操作；未建立 commit。

修改 9 個指定檔案：

- `MissionControl.tsx`、`MissionControlRow.tsx`、`MissionControlGroupHeader.tsx`、新增 `MissionControlBulkBar.tsx`
- `MissionControlRow.test.tsx`、新增 `MissionControl.bulk.test.tsx`
- `design-system.css`（僅 `.mission-*`）、`en.ts`、`i18n-additions.json`

驗證：type-check、ESLint、`git diff --check` 全數通過；supervision 共 **12 個測試檔、108 個測試通過**，含新增 22 個測試。

Mutation probe：移除 `if (!confirmed) return` 後，`cancel does nothing for Stop 2 running` 與 `cancel does nothing for Archive` 均如預期失敗；已還原並重跑通過。

已知限制：停止結果依既有 abort 標記判定；尚未執行原生 Electron／真實 runtime E2E。

