# management-client-wireframes Specification

## Purpose

Management Client の非同期操作結果を、Browser-safe data boundary と keyboard/screen-reader 操作の両方に適合させる UI 契約を定義する。

## Requirements

### Requirement: 非同期操作結果のアクセシブルなフォーカス通知

Management Client は非同期操作の完了を結果見出しへの programmatic focus と通知領域の意味属性で伝える SHALL。

**Customer Context**

Management Client の keyboard・screen reader 利用者は、非同期操作が完了したときに結果の開始位置を直ちに把握し、成功または安全な失敗内容を見出しから読み進める必要がある。通知領域と focus target の意味が一致することで、完了後の現在位置と次の操作を予測できる。

**Requirement**

Management Client は非同期操作の完了時に、表示された結果見出しへ programmatic focus を移す SHALL。

結果見出しは heading semantics と `tabIndex={-1}` を持つ programmatic focus 専用targetとして動作し、通常のTab操作は次のinteractive elementへ進む SHALL。

結果見出しを含む通知領域は、成功時の status semantics または失敗時の alert semantics を提供し、完了内容を支援技術へ通知する SHALL。

#### Scenario: 非同期操作の完了時に結果見出しへフォーカスする (MANAGEMENT-CLIENT-WIREFRAMES-S001)

- **GIVEN** 管理者が Management Client で非同期の Agent 操作を実行している
- **WHEN** 操作が成功または安全な失敗結果で完了する
- **THEN** programmatic focus は `tabIndex={-1}` を持つ表示済みの結果見出しへ移る
- **AND** 結果見出しを含む通知領域は結果に対応する status semantics または alert semantics を提供する
