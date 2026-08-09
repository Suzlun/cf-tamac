import type { Plugin } from '@opencode-ai/plugin';

const APPLIER_AGENT = 'openspec/applier';

const APPLIER_COMPACTION_CONTEXT = `
This is an openspec/applier session. Preserve the latest "## Agent Delegation Timeline" block in the compaction summary with its exact Revision, Change, CLI State, execution lines, task order, agents, states, dependencies, evidence, facilitator cycle, verdict, and fix owners.

Keep completed, active, blocked, and planned delegations distinct. Preserve retained facilitator finding identifiers and their assigned fix owners. If the latest value cannot be established from the conversation, write UNKNOWN instead of inferring progress. The compacted session must be able to resume by updating this timeline before the next delegation.
`.trim();

/**
 * Applierとして開始されたことを現在の実行中に確認できたセッションを保持します。
 *
 * セッション履歴の取得に一時的に失敗しても、同じ実行中に受信したメッセージから
 * Applierを識別できるようにするための補助情報です。永続的な正本にはせず、圧縮時には
 * 必要に応じてOpenCodeのセッション履歴も確認します。
 */
const activeApplierSessions = new Set<string>();

/**
 * Applierの圧縮要約に委任タイムラインの引き継ぎ指示を追加します。
 *
 * @returns OpenCodeが読み込むチャット受信フックと圧縮前フック。
 * @example
 * OpenCodeはこのファイルをプロジェクトプラグインとして自動的に読み込みます。
 */
const applierCompactionPlugin = (({ client }) =>
  Promise.resolve({
    'chat.message': ({ agent, sessionID }) => {
      // 新しいApplierメッセージを受信した時点で、現在のセッションを即座に識別します。
      if (agent === APPLIER_AGENT) activeApplierSessions.add(sessionID);
      return Promise.resolve();
    },
    'experimental.session.compacting': async ({ sessionID }, output) => {
      // 実行中の記録がない場合は、再起動後も判定できるよう永続化済み履歴を確認します。
      if (!activeApplierSessions.has(sessionID)) {
        try {
          const response = await client.session.messages({ path: { id: sessionID } });
          const isApplierSession = response.data?.some(
            ({ info }) => info.role === 'user' && info.agent === APPLIER_AGENT
          );
          if (isApplierSession !== true) return;
          activeApplierSessions.add(sessionID);
        } catch {
          // 判定不能なセッションへApplier専用指示を誤適用せず、既定の圧縮を継続します。
          return;
        }
      }
      // 既定要約を置換せず、Applier固有の継続状態だけを追加します。
      output.context.push(APPLIER_COMPACTION_CONTEXT);
    },
  })) satisfies Plugin;

export default applierCompactionPlugin;
