發現 3 項缺陷；前兩項已用記憶體內探針重現。未修改任何檔案。

1. **P2 — 讀取失敗後，舊結果仍被視為目前結果，且不再重試。**  
   [verificationEvidenceCache.ts:134](desktop/packages/ui/src/lib/supervision/verificationEvidenceCache.ts:134)  
   情境：先取得 passed，session 更新後 risk 請求失敗。程式保留舊 counts，卻把 `updatedAt` 推進至新 revision；後續 `pump()` 因 revision 已處理而跳過，重新掛載也不會重試。chip 繼續顯示綠色 passed，沒有 stale／unavailable 標示，違反 RS-02。  
   **修正：**分開記錄成功 revision 與嘗試時間，保留明確 freshness 狀態，失敗後安排有退避的重試；舊資料不得以目前結果參與顯示或 facet。

2. **P2 — 20 秒逾時沒有取消請求，實際並行數超過 2。**  
   [verificationEvidenceCache.ts:130](desktop/packages/ui/src/lib/supervision/verificationEvidenceCache.ts:130)  
   情境：多個 risk 請求停滯。`Promise.race` 逾時後刪除 pending 並啟動下一筆，但原請求仍執行；SDK 的底層期限是 120 秒。探針確認六個請求可同時尚未完成，宣稱的兩個並行上限不成立。  
   **修正：**將 `AbortSignal` 傳入 `session.risk`，逾時／取消時中止底層請求，確認結束後才釋放並行名額。

3. **P2 — chip 的完整狀態沒有可靠的無障礙語意。**  
   [MissionControlChecks.tsx:28](desktop/packages/ui/src/components/supervision/missionControl/MissionControlChecks.tsx:28)  
   情境：failed 與 pending 都可能只呈現 `Checks 0/1`；完整說明放在普通 `<span>` 的 `aria-label`／`title`。`span` 的隱含 generic role 禁止命名，不能依賴輔助科技讀出該 label；tooltip 也無法由鍵盤聚焦。參見 [WAI-ARIA generic](https://www.w3.org/TR/wai-aria-1.2/#generic)。  
   **修正：**提供實際可讀的完整狀態文字，例如 `sr-only` 文字並隱藏重複短標籤，或採用支援命名的適當 role；驗證 accessibility tree，而非只測 attribute 存在。
## Disposition (Claude)

1. P2, fixed: a failed read keeps the older result marked `stale`, does not advance its revision, and is read again after a
   30-second backoff. A stale result is shown dashed and muted with "(may be outdated: the latest read failed)" and is excluded from
   the "Checks failing" facet (RS-02). Regression test in `verificationEvidenceCache.test.ts`.
2. P2, fixed: reads pass an `AbortSignal` to `session.risk` and abort at the timeout; the slot is released only after the read has
   settled. Test asserts no more than two requests are ever outstanding; mutation probe (no abort) fails it. The same abort was
   added to the activity-preview reads (`session.messages`), which had the same pattern.
3. P2, fixed: the chip's full status is `sr-only` text and the short label is `aria-hidden`; the `aria-label` on the generic span
   was removed.
