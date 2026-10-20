已完成實作，未建立 commit。

- **變更**：MissionControl、Header／Row／Peek、新增 GroupHeader 與 missionGroups、store、`.mission-*` CSS、相關測試；新增 5 個英文鍵及 `i18n-additions.json`。
- **驗證**：type-check、ESLint、source-text ratchet 通過；7 個測試檔共 **64 項通過**。
- **Mutation probe**：暫時移除排除已收合群組的條件，收合後選取回退測試確實失敗；已還原並重測通過。
- **限制**：Testing Library 目前使用本機套件，整合仍需補相依宣告。Electron 啟動 SIGABRT，尚未取得 600px 實際渲染的溢位驗證。

