## ADDED Requirements

### Requirement: Run-driven ToolInvocation waiting and resume

Run-driven ToolInvocation は waiting と resume を stale-safe に扱う MUST。

**Customer Context**

Agent は model decision から Tool を呼び出せる必要があるが、承認や Provider 実行待ちの間に Agent 全体の Run slot を占有し続けると他の work が止まる。Tool result が戻った時には、stale result を安全に捨てながら再開できる必要がある。

**Requirement**

`invoke_tool` decision は ToolDefinition、Installation 状態、authorization、budget、Tool catalog generation を検証して ToolInvocation を作成 SHALL。ToolInvocation は Run ID、decision ID、Thread ID、Tool ID、Installation ID、idempotency key、input digest、approval status、provider operation identity、attempt、causation Event を保持 MUST。

Approval-required ToolInvocation は `pending_approval` として保存され、Run を `waiting` へ遷移させる MUST。Provider call が asynchronous または結果待ちの場合、Run は active slot を解放 MUST。Tool result、approval result、rejection、timeout、cancel は deterministic に waiting Run resume または follow-up Event creation へ分類 MUST。

Tool result commit は invocation identity、Run generation、Tool catalog generation、Installation status、idempotency key を検証 MUST。Late result、duplicate result、revoked Tool、uninstalled Integration の result は duplicate side effect を作らず stale または rejected として記録 MUST。

#### Scenario: invoke_tool decision が ToolInvocation と waiting Run を作る (AGENT-TOOL-S009)

- **GIVEN** Run が approval-required Tool `calendar.create_event` を呼ぶ valid `invoke_tool` decision を持つ
- **WHEN** commit layer が ToolDefinition、authorization、budget を検証する
- **THEN** ToolInvocation は `pending_approval` として作成される
- **AND** Run は `waiting` に遷移して active Run slot を解放する

#### Scenario: Tool result が waiting Run を stale guard 付きで resume する (AGENT-TOOL-S010)

- **GIVEN** ToolInvocation `inv-1` に紐づく Run `run-1` が `waiting` である
- **WHEN** Provider が署名済み Tool result を publish する
- **THEN** result は invocation identity と generation を検証され、同じ Thread に Tool result Event を追加する
- **AND** `run-1` の resume または follow-up Run は one active Run slot を取得してから進む
- **AND** duplicate または stale result は追加 side effect なしで記録される
