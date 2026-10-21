找到 4 個問題；全程唯讀。

1. **P2 — 被逐出項目可繞過退避，造成重試與計時器累積。**  
   [remoteActivityCache.ts:67](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:67)、[verificationEvidenceCache.ts:92](desktop/packages/ui/src/lib/supervision/verificationEvidenceCache.ts:92)  
   回執只保存 revision。失敗項目被逐出後，較新的 revision 會通過回執檢查，而快取已無 `fetchedAt` 可限制重試。已重現：305 列全部失敗，時鐘維持不動，四次整批 revision 更新令請求及 release timer 從 305 增至 1,220。**修正：**以 session＋directory 保存獨立於快取淘汰的 `retryAfter`，並為每個鍵維持單一 release timer。

2. **P2 — Activity 面板關閉後遺失鍵盤焦點。**  
   [ActivityButton.tsx:25](desktop/packages/ui/src/components/supervision/ActivityButton.tsx:25)  
   開啟時未將焦點移入 dialog，關閉時也未恢復。已用 DOM 重現：聚焦 feed 內按鈕後按 Escape，面板消失，焦點落到 `BODY`，鍵盤使用者失去操作位置。**修正：**保存 trigger ref，開啟時聚焦面板或第一個控制項，關閉時恢復 trigger；可採用既有具焦點管理的 Popover。

3. **P2 — 長預覽會把 stale 標記一起截掉。**  
   [MissionControlRow.tsx:182](desktop/packages/ui/src/components/supervision/missionControl/MissionControlRow.tsx:182)  
   標記附加在文字尾端，但 `.mission-activity` 使用 `overflow:hidden`、`white-space:nowrap` 與 ellipsis。長文字或窄視窗會隱藏整個標記；tooltip 亦只包含原預覽，使用者無法看出讀取已失敗。**修正：**讓文字在獨立元素內截斷，標記作為不收縮的同層元素，並將過期狀態加入 tooltip。

4. **P3 — 卸載後才完成的失敗請求仍建立計時器。**  
   [remoteActivityCache.ts:158](desktop/packages/ui/src/lib/supervision/remoteActivityCache.ts:158)、[verificationEvidenceCache.ts:162](desktop/packages/ui/src/lib/supervision/verificationEvidenceCache.ts:162)  
   `dispose()` 清除現有 timers，但尚在進行的請求稍後失敗，仍無條件新增 release timer。兩個快取均已重現卸載後殘留一個 timer，直到退避結束。**修正：**無 consumer 時不排程；保留退避期限供重新掛載時使用。
## Disposition (Claude)

1. P2, fixed: backoff deadlines are kept per session and directory apart from the bounded cache (bounded at 1,000), so an evicted
   failure cannot be re-read before its deadline even when its revision grows; the per-failure release timers are gone. Test
   reproduces the 305-row, four-revision case (stays at 305 reads).
2. P2, fixed: the Activity popover takes focus when it opens and returns it to the button when it closes. Test added.
3. P2, fixed: the "(may be outdated)" marker comes first, so truncation cannot hide it, and the tooltip includes it. Test added.
4. P3, fixed with 1: no timer is scheduled for a failure after unmount; only the single retry timer exists, and only while mounted.
   Test asserts no timers remain.
