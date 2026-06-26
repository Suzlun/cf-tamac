# 00 — shadcn/ui Full Registry Copy and CSS Reset Contract

> このファイルは `redesign-management-client-ui` の最初の実装成果物を定義する。
> 手作業で「使いそうな shadcn component だけ」を列挙するのは禁止する。公式 shadcn/ui registry、公式 docs components、Blocks、Charts を機械取得し、公式 shadcn/ui 配布物を丸ごとローカルへコピーしてから画面実装へ進む。

## 1. 原則

- すべての official shadcn/ui registry item は local source として repository にコピーする。使用有無で除外してはならない。
- すべての visible UI primitive は copied shadcn/ui local component、またはそれらだけを合成する domain component で実装する。
- Domain component は business data と composition だけを担当し、border / radius / shadow / gradient / color token / typography を独自 class で再定義しない。
- shadcn/ui は `components.json` の `style: new-york`、`baseColor: neutral`、`cssVariables: true` を正とする。
- 画面の見た目は shadcn/ui default の simple neutral design を基本とする。Control-room 独自 palette、radial gradient、paper/coal/signal/cyan token、装飾 serif font、glow shadow は使用しない。
- `app/globals.css` は Tailwind directives と shadcn/ui default CSS variables / base layer だけに縮小する。画面固有 class、legacy hero class、独自 table class、独自 state class は置かない。

## 2. 必須 copy 成果物

実装は最初に shadcn/ui full copy を実行する MUST。copy 後に manifest を生成し、manifest は少なくとも次の列を持つ JSON または Markdown table とする。

| Field                  | Meaning                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `source`               | `official-core`, `docs-component`, `official-block`, `official-chart`, `registry-directory` のいずれか。                  |
| `namespace`            | `@shadcn` または registry directory namespace。                                                                           |
| `name`                 | registry item / docs component / block / chart / external registry の名前。                                               |
| `type`                 | `registry:ui`, `registry:block`, `registry:component`, `registry:example`, `registry:chart`, `registry`, `docs-only` 等。 |
| `sourceUrl`            | 取得元 URL。                                                                                                              |
| `files`                | item が提供する file paths。取得できない場合は `[]`。                                                                     |
| `dependencies`         | item が要求する package dependencies。                                                                                    |
| `registryDependencies` | shadcn registry dependency。                                                                                              |
| `localPath`            | repository 内にコピーされた file path。複数 file は配列。                                                                 |
| `copyStatus`           | `copied`, `generated-wrapper`, `copy-blocked` のいずれか。                                                                |
| `blocker`              | `copy-blocked` の理由。通常は空。                                                                                         |

Manifest は repository に残し、reviewer が全量コピーを確認できるようにする。推奨 path は `packages/client/src/components/ui/shadcn-registry-copy.generated.json` とする。

`copyStatus: copy-blocked` は、公式 shadcn/ui item が取得不能、ライセンス/依存関係/実行時境界の確認が必要、または Cloudflare Workers / Next.js App Router 境界に明確に反する場合だけ許可する。単に「この画面で使わない」は `copy-blocked` 理由にならない。

## 3. 取得対象

以下を全量取得対象にする。

| Source                   | URL / API                                                                                                        | 現時点で確認した規模                   | 扱い                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Official core registry   | `https://ui.shadcn.com/r/index.json`                                                                             | 56 items                               | local `components/ui/**` の primary source。                                                                                |
| Official docs components | `https://ui.shadcn.com/docs/components`                                                                          | core に加えて docs-only recipes を含む | `data-table`, `date-picker`, `toast`, `typography` など registry item と別扱いの docs entry を拾う。                        |
| Official Blocks          | `https://ui.shadcn.com/blocks/**` and item URLs such as `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json` | page / block item 群                   | Shell / dashboard / sidebar / auth など relevant block を local source としてコピーし、必要な composition を抽出する。      |
| Official Charts          | `https://ui.shadcn.com/charts/**` and item URLs under `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json`   | chart item 群                          | observability / run metrics 表示で使う候補として local source としてコピーする。                                            |
| Registry Directory       | `https://ui.shadcn.com/r/registries.json`                                                                        | 224 registries を確認                  | official shadcn/ui ではなく third-party directory。コピー対象外だが、別承認が必要な外部候補として manifest に分離記録する。 |

`official-block`、`official-chart` は数が変わるため、この Markdown に手で全件を貼り付けない。実装時に生成 manifest を更新し、`count by source`、`copied by source`、`copy-blocked by source` を reviewer に提示する。official shadcn/ui source の `copy-blocked` はゼロを目標とし、ゼロでない場合は blocker を解消するまで画面実装に進まない。

## 4. Official core registry items

2026-06-26 時点で `https://ui.shadcn.com/r/index.json` から確認した official core `registry:ui` item は以下 56 件である。

| #   | Name            | Copy requirement |
| --- | --------------- | ---------------- |
| 1   | accordion       | copy             |
| 2   | alert           | copy             |
| 3   | alert-dialog    | copy             |
| 4   | aspect-ratio    | copy             |
| 5   | avatar          | copy             |
| 6   | badge           | copy             |
| 7   | breadcrumb      | copy             |
| 8   | button          | copy             |
| 9   | button-group    | copy             |
| 10  | calendar        | copy             |
| 11  | card            | copy             |
| 12  | carousel        | copy             |
| 13  | chart           | copy             |
| 14  | checkbox        | copy             |
| 15  | collapsible     | copy             |
| 16  | combobox        | copy             |
| 17  | command         | copy             |
| 18  | context-menu    | copy             |
| 19  | dialog          | copy             |
| 20  | direction       | copy             |
| 21  | drawer          | copy             |
| 22  | dropdown-menu   | copy             |
| 23  | empty           | copy             |
| 24  | field           | copy             |
| 25  | form            | copy             |
| 26  | hover-card      | copy             |
| 27  | input           | copy             |
| 28  | input-group     | copy             |
| 29  | input-otp       | copy             |
| 30  | item            | copy             |
| 31  | kbd             | copy             |
| 32  | label           | copy             |
| 33  | menubar         | copy             |
| 34  | native-select   | copy             |
| 35  | navigation-menu | copy             |
| 36  | pagination      | copy             |
| 37  | popover         | copy             |
| 38  | progress        | copy             |
| 39  | radio-group     | copy             |
| 40  | resizable       | copy             |
| 41  | scroll-area     | copy             |
| 42  | select          | copy             |
| 43  | separator       | copy             |
| 44  | sheet           | copy             |
| 45  | sidebar         | copy             |
| 46  | skeleton        | copy             |
| 47  | slider          | copy             |
| 48  | sonner          | copy             |
| 49  | spinner         | copy             |
| 50  | switch          | copy             |
| 51  | table           | copy             |
| 52  | tabs            | copy             |
| 53  | textarea        | copy             |
| 54  | toggle          | copy             |
| 55  | toggle-group    | copy             |
| 56  | tooltip         | copy             |

## 5. Docs-only shadcn components / recipes

公式 docs に存在するが `https://ui.shadcn.com/r/index.json` の direct item としては扱いが異なる entries は、manifest で `docs-only` として扱い、必要な local file / wrapper / recipe をコピーまたは生成する。

| Name        | Required handling                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| data-table  | shadcn `Table` + relevant composition recipe を local recipe としてコピー/生成する。独自 `.data-table` CSS は禁止。   |
| date-picker | `Calendar` + `Popover` / form composition の local recipe をコピー/生成する。                                         |
| toast       | 現行 docs entry と `sonner` の関係を manifest で明記し、toast/toaster を独自実装しない。                              |
| typography  | prose / text hierarchy の recipe を local convention としてコピー/生成し、custom serif typography system を作らない。 |

## 6. Copy policy

- Official core `registry:ui` items はすべて local component として追加する。
- Official Blocks / Charts はすべて local source としてコピーする。画面で使うかどうかに関係なく、copy manifest と repository 差分に残す。
- Blocks / Charts の app route example は、そのまま public route にしてはならない。source は `packages/client/src/components/shadcn-blocks/**` や `packages/client/src/components/shadcn-charts/**` のような non-route local source に置き、Management Client routes から必要な composition を import する。
- Registry Directory の third-party registries は official shadcn/ui ではないため、full-copy 対象外とする。各 registry は `external-review-required` として manifest に分離記録し、dependency / supply-chain / license / security review なしに追加してはならない。
- 新 dependency が必要な shadcn item（例: chart, calendar, carousel, command, drawer, sonner）は AGENTS.md の supply-chain rule に従い ask-first とし、`minimumReleaseAge` を下げない。

## 7. Screen mapping after full copy

Screen-specific component mapping は copied source と generated manifest を参照して確定する。最低限、以下を満たす。

| Screen / area           | Required shadcn families                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Root shell / topbar     | sidebar or sheet, button, scroll-area, separator, avatar, dropdown-menu, breadcrumb, tooltip, skeleton, alert              |
| Sidebar navigation      | sidebar, button, scroll-area, separator, tooltip, badge                                                                    |
| Agents list             | card, badge, button, input, dropdown-menu, avatar, empty, skeleton, alert, pagination when needed                          |
| Agent registration      | dialog or sheet, form, field, input, textarea, select/native-select, checkbox, progress, alert, button                     |
| Global Settings         | card, badge, switch, select/native-select, separator, alert, tooltip                                                       |
| Overview                | card, badge, button, alert, skeleton, accordion/collapsible, chart when metrics are rendered                               |
| Threads / Events / Runs | card, badge, tabs, accordion/collapsible, table/data-table recipe, sheet/drawer, skeleton, alert, pagination               |
| Schedules               | card, badge, form, select/native-select, input, calendar/date-picker when date input exists, alert-dialog, progress, alert |
| Integrations            | card, badge, tabs, dialog, form, textarea, checkbox, alert-dialog, alert                                                   |
| Agent Settings          | card, form, input, textarea, select/native-select, switch, alert-dialog, tooltip, alert                                    |

## 8. CSS deletion contract

Implementation MUST delete or replace the following custom styling surfaces:

- `app/globals.css` の `.app-shell`, `.control-room`, `.topline`, `.signal`, `.hero-grid`, `.kicker`, `.eyebrow`, `.lead`, `.action-row`, `.section-nav`, `.nav-link`, `.primary-action`, `.instrument-panel`, `.readout`, `.route-card`, `.page-band`, `.route-grid`, `.agent-token`, `.state-*`, `.storage-meter`, `.data-table`。
- `app/globals.css` の custom keyframes（例: `skeleton-pulse`）と glow / gradient / bespoke background。
- `tailwind.config.ts` の custom color aliases `coal`, `cyan`, `panel`, `paper`, `signal` と、それらへ shadcn semantic slot を map する設定。
- `fontFamily` の独自 serif / mono visual direction。必要な monospace は `font-mono` 程度に留め、shadcn default typography を上書きしない。
- `ControlRoomFrame` と `SectionNav` の visual chrome。必要な構造 helper は shadcn `Card` / `Separator` / `Tabs` / `Breadcrumb` / `Sidebar` 合成へ置換する。

## 9. Verification contract

- Automated tests MUST validate that generated shadcn copy manifest exists and includes official core, docs-only entries, and official Blocks/Charts entries discovered by the generator; separated third-party registry metadata MUST include all registry directory entries.
- Automated tests MUST report `count by source`, `copied`, `generated-wrapper`, `copy-blocked`, and `external-review-required` counts.
- Automated tests MUST fail when any official shadcn/ui core, block, chart, or docs-only copy target is only listed and not copied or generated locally.
- Automated tests MUST statically confirm that redesigned route/component source imports copied shadcn/ui source instead of relying on custom visual classes.
- Automated tests MUST fail if `control-room`, `hero-grid`, `instrument-panel`, `route-card`, `data-table`, `--paper`, `--coal`, `--signal`, `--cyan`, or custom radial/linear gradient backgrounds remain in browser-visible Client UI source.
- Tests MUST target copied-source design-system usage and CSS simplification, not the absence of old demo routes or legacy product behavior.
