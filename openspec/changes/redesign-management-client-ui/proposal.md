## 理由

Management Client の現行 UI は、Agent を本番運用する管理者が状況把握・登録・選択・監督を迷わず行える情報設計になっていない。本番投入できる管理体験にするには、実装前に左サイドバー中心のナビゲーション、選択中 Agent の文脈、カードと要約を主体にした画面構成、状態設計、アクセシビリティを明確にしたワイヤーフレームとプロダクト契約が必要である。

この変更は、GitHub Issue #7 の「本番品質の Management Client UI へ再設計する」要求を、実装可能な UI/UX 提案と OpenSpec 契約に落とし込む。現状は shadcn/ui の標準コンポーネント体系へ十分に寄っておらず、独自 CSS と control-room テーマが UI 品質と保守性を損ねている。参考デザインは方向性の着想ではなく、shadcn/ui 標準のシンプルな neutral デザインへ収束させるための入力として扱う。

## 変更内容

- Management Client のナビゲーションを、全体領域と選択中 Agent 領域に分離する。
- 全体領域は `Agents` と `Global Settings` だけを表示し、Agent 横断 UI はこの 2 画面に限定する。
- 選択中 Agent 領域は、選択中 Agent に対する `Overview`、`Threads`、`Events`、`Runs`、`Schedules`、`Integrations`、`Settings` を左サイドバーで表示する。
- Agent 未選択時は Agent 選択ガイダンスを表示する。
- Agent 登録は `Agents` 画面内の操作として扱う。
- Tool と Compaction は Runs、Events、Threads、Overview、Settings など Agent 文脈の詳細またはメタデータとして扱う。
- デスクトップとモバイルのレスポンシブなシェル、空・読み込み・エラー・権限状態、キーボードとフォーカスの挙動、秘匿情報を漏らさないエラー文言を UI 契約に含める。
- 公式 shadcn/ui の core、docs-only entries、Blocks、Charts を丸ごとローカルソースへコピーし、すべての可視 UI プリミティブをコピー済み shadcn ソースまたはその合成コンポーネントで実装する。
- 余計な独自 CSS、control-room パレット、グラデーション、発光表現、独自タイポグラフィ、独自視覚クラスを削除し、`components.json` の `new-york` / `neutral` / CSS variables に基づく shadcn/ui 標準のシンプルなデザインを利用する。
- Management Client のサーバー・ブラウザ境界、Client 所有 D1、サーバー側限定 Agent RPC、Agent API proxy を置かない境界、Protobuf RPC のみの Agent surface は維持する。

## 仕様単位

### 新規仕様単位

なし。

### 変更する仕様単位

- `management-client-shell`: Management Client の route shell、ナビゲーション情報設計、ブラウザ秘匿境界、Agent API proxy を置かない境界、全体領域と選択中 Agent 領域のサイドバー挙動、コピー済み shadcn/ui シェルソースの利用、独自 CSS の削除を更新する。旧 surface 不在を目的にした demo-free requirement は archive sync で削除する。セキュリティ上、ブラウザ bundle に Agent credential、直接 Agent RPC 呼び出し、Agent proxy route を入れない。
- `agent-management-ui`: Agent 一覧・登録・選択、Agent 文脈の Overview/Threads/Events/Runs/Schedules/Integrations/Settings の UX 契約、公式 shadcn/ui 全コピー、標準 shadcn 表現、状態・アクセシビリティ・テスト範囲を更新する。セキュリティ上、Agent domain snapshots は Client D1 に保存せず、必要な Agent-owned data はサーバー側 Agent RPC から取得する。

## 命名

Scenario ID prefix は次の通りとする。

- `management-client-shell` は `MANAGEMENT-CLIENT-SHELL-S###` を使う。
- `agent-management-ui` は `AGENT-MANAGEMENT-UI-S###` を使う。

関連する責務は分離したままにする。`management-client-shell` はシェル、ナビゲーション、route/public 境界、ブラウザ秘匿を扱う。`agent-management-ui` は管理ワークフローと Agent 文脈の画面挙動を扱う。

## 影響

- 承認後に影響する package: `packages/client/**` の Management Client route shell、Server Components、Server Actions、サーバー側限定 Client D1 repository、サーバー側限定の生成済み Agent RPC 利用。
- OpenSpec 契約への影響: `management-client-shell` と `agent-management-ui` の delta spec、実装可能な tasks、wireframe/design artifact を更新する。
- デザインシステムへの影響: 公式 shadcn/ui 全コピーと CSS 削除契約を実装受け入れ条件にする。画面作業前に、公式 core / docs / block / chart のコピー件数とコピー阻害理由を確認できるようにする。
- Agent API への影響: REST/OpenAPI/Orval の Agent surface は導入しない。Agent Worker は Protobuf RPC のみを維持する。
- データへの影響: Client D1 は managed Agent records、credential references、安全な Client-owned UI metadata に限定する。Agent domain snapshots は Agent 所有のままにする。
- セキュリティへの影響: ブラウザ秘匿、直接 Agent RPC 呼び出し禁止、Client の Agent proxy route 禁止、秘匿情報を漏らさない UI 文言を明示的な受け入れ条件にする。
- UX への影響: デスクトップ・モバイル layout、shadcn/ui 標準のシンプルデザイン、空・読み込み・エラー・無効状態、Agent 選択状態、アクセシビリティを実装前に規定する。
