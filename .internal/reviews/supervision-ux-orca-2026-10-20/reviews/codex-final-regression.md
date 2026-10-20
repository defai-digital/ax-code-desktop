發現兩項問題，依嚴重程度排序：

1. **P1 — WebMCP 等待期間的撤銷失效。**  
   [desktop-webmcp-browser.js:397](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:397) 在等待面板掛載結束後才記錄 `revision`。等待期間若發生 `disconnect` 或 `runtimeChanged()`，舊的啟用請求仍會繼續註冊 provider，重新開啟 agent 存取。使用現有測試 fixture 做記憶體內重現，兩種情況均得到 `enabled: true`。應在第一次等待前建立取消識別，並在等待及註冊過程中驗證。

2. **P2 — 新內容可能沿用舊的「已檢視」標記。**  
   [useReviewProgressStore.ts:27](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useReviewProgressStore.ts:27) 的簽章僅包含增刪行數與 Git 狀態；[ReviewFileRail.tsx:48](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/ReviewFileRail.tsx:48) 直接據此顯示已檢視。例如先檢視一行修改，agent 再將該行改成不同內容，兩次皆為 `+1/-1`、狀態 `M`，勾選與完成進度便不會失效。同一路徑後續的新變更也可能碰撞。應使用內容／diff 指紋，或可靠的內容版本來使標記失效。

全程唯讀；完成原始碼追查及上述局部重現，未執行完整桌面 E2E。

