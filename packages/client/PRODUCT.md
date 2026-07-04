# Product

## Register

product

## Users

Management Client の利用者は、Cloudflare Workers 上で運用される AI Agent を管理する運用者、開発者、セキュリティレビュー担当者である。Browser から Agent registry、Agent detail、Thread、Event、Run、Schedule、Tool approval、Integration、Settings を確認し、CLI や直接 RPC を知らなくても管理作業を開始できる必要がある。

## Product Purpose

Management Client は、Client-owned D1 ledger と server-side Agent RPC 呼び出しを通じて、管理対象 Agent の登録、選択、監査、設定、外部連携操作を安全に実行するための UI である。成功条件は、どの操作が global scope で、どの操作が selected-Agent scope なのかが即座に分かり、Agent credential、Provider secret、direct Agent RPC invocation が Browser に露出しないことである。

## Brand Personality

信頼できる、明瞭、運用者向け。UI は華美な装飾ではなく、状態、権限境界、次に取るべき操作を正確に伝える。Copy は短く具体的で、管理者が状況判断を誤らないことを優先する。

## Anti-references

Agent 管理 UI は demo app、汎用 SaaS dashboard、過剰な marketing hero、table だけに依存した監査しにくい画面、global scope と Agent scope が混在する navigation、Shadcn default token から逸脱する ad-hoc palette や route 固有 CSS shim になってはならない。Browser bundle に Agent credential、direct Agent RPC client、Agent runtime import、public Agent API proxy route が混入する設計は明確に避ける。

## Design Principles

1. Scope first: global navigation と selected-Agent navigation を分離し、現在見ている対象を常に明確にする。
2. Secrets stay server-side: credential、Provider secret、Agent RPC invocation は server-side boundary に閉じ、Browser には secret-free view model だけを届ける。
3. Operational clarity over decoration: visual hierarchy は運用判断、状態確認、明示 action の安全性を支えるために使う。
4. Local primitives, shared grammar: Shadcn UI の local source と default token を使い、同じ control や layout pattern を重複実装しない。
5. Contextual detail: Tool、Compaction、Memory などは standalone menu ではなく、Runs、Threads、Overview など実際の判断文脈内で確認できるようにする。

## Accessibility & Inclusion

Navigation、forms、dialogs、detail surfaces は keyboard 操作、focus management、accessible label、validation error association を備える。Sidebar は desktop で persistent、narrow viewport で Shadcn Sheet として動作し、skip link で main content に移動できる。Motion や視覚的強調は情報理解を妨げず、contrast は Shadcn default token に基づき十分に保つ。
