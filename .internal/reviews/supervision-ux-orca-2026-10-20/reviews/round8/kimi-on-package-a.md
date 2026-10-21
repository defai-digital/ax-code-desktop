## 程式碼審查結果（Round 8 package A，唯讀）

已對照 PRD Round 8 requirements、VERIFY-glm.md 邊界條件，完整讀過五個檔案、其測試，以及 `native-webmcp.js` 的 revoke/cancel 語意與 `projectResolution.ts`。

**先說結論：無 HIGH 級阻斷問題。** CS-25 的核心保證大多成立：pause 會 revoke provider、abort 輪詢、修訂號（revision）會讓進行中的 enrollment 失敗；resume 走完整 enable 驗證（visibility、capability、session、fresh POST）；持久化僅存消毒後的 http(s) 位址、按 `(normalizeProjectPath, sessionID)` 隔離、讀側重複驗證；監聽器/計時器/observer 均有 cleanup；Windows fixture（`C:\Users\dev\project`）確實存在於 store 測試。但有以下真實缺陷：

### Findings

**1. MEDIUM — 待執行的 enable 請求在 session 建立失敗後仍存活，之後會在無關 session 自動開啟權限**
`desktop/packages/ui/src/hooks/useWebMcpBrowser.ts:66-76` + `EmbeddedWebMcpBrowser.tsx:147-149, 281-295, 513-523`
情境：draft 中使用者點 Enable → `requestAgentMode({enable:true})` 先遞增計數，`ensureSessionForProjectBrowser` 失敗只 toast，請求不退役。之後使用者因任何理由在同專案建立第一個 session（draft→session 是唯一不退役的轉換），pane ready 後 150ms 計時器自動 `command("enable")`——在並非為此而建的 session 裡開啟 agent access，無需新的點擊。tab 列的 Enable CTA（:518）根本不啟動 session，同樣留下待發請求。這正是「pending at session switch executes later」。
修法：`started === false` 時呼叫 `consumeEnableRequest()` 退役；tab CTA 改用 `useOpenProjectBrowser({enable:true})`。

**2. MEDIUM — pause/cancel 後，進行中的 agent navigate 仍會載入頁面**
`desktop/packages/electron/src/desktop-webmcp-browser.js:210-246`
`serveNavigation` 只在 `reply` 時檢查 `signal.aborted`/`canceled`；`loadUrlWithTimeout`（:222）不帶 abort。pause 保留原生頁面，所以被暫停前派發的 navigate 會在暫停期間完成載入（reply 被丟棄，副作用已發生）；runtime 取消的 navigate 同理仍載入。違反 CS-25「nothing pending is executed」的精神。
修法：載入前檢查 `signal.aborted`/canceled；controller abort 時對 in-flight load 呼叫 `webContents.stop()`。

**3. MEDIUM — 被取代的載入留下的 ERR_ABORTED 會黏在健康頁面上**
`desktop-webmcp-browser.js:348-350, 533-535` + `EmbeddedWebMcpBrowser.tsx:86-109`
情境：agent navigate 插斷使用者的 Go（busy 只擋 renderer 指令，擋不了 agent 路徑）。被插斷的 load 觸發 main-frame `did-fail-load(ERR_ABORTED)` 或 navigate 的 catch，寫入 `entry.error`；勝出的載入成功後，applyStatus 對 falsy error 不清除（「poll 永不清除操作錯誤」），三個 surface 從此一致顯示「Page loading was interrupted」直到下個指令——句子一致但內容是假的（CS-26）。
修法：給每次 load 一個遞增編號，`did-fail-load`/catch 只在仍是最新 load 時寫 error；或在 `did-navigate` 時清除。

**4. LOW — enable/resume 失敗分類依賴最多 60 秒前的快取**
`EmbeddedWebMcpBrowser.tsx:244-249`
main 端重新驗證 capability 並拒絕時，renderer 用陳舊 `runtimeCompatible` 映射成 `enable-failed`（fix: "Check agent access"，點了再失敗循環）而非 `runtime-incompatible`。修法：main 回傳固定 reason code，renderer 據此映射。

**5. LOW — 交付物缺口**：報告引用 `i18n-additions-a8.json` 作為翻譯交接清單，但 repo 中 `**/i18n-additions-a8.json` 不存在；翻譯整合（目前 8 個 locale 測試失敗的預期前置）無從核對。

### 已確認無誤的重點

- 持久化不攜帶 grant/element reference/credentials/query/fragment，跨專案/跨 session 隔離正確；fresh module load 有測試。
- 每狀態單一 next action（含 error banner 優先、paused→Resume）成立。
- 失敗句子三 surface 共用 `describeWebMcpError`，tone 對 0-tool 頁為中性且文案已修正。
- listener/timer/observer/view 清理完整；concurrent create 已序列化。

建議優先修 Finding 1（權限時序）與 Finding 2（暫停語意），三者修完後重跑 focused Vitest 即可覆蓋。