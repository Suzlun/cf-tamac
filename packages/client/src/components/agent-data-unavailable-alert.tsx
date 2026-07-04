import { ErrorAlert } from './error-alert';

interface AgentDataUnavailableAlertProps {
  readonly screenName: string;
}

/**
 * Agent RPC 由来の画面データが取得できない場合に表示する安全な通知。
 *
 * @remarks
 * Agent credential の未設定、Agent RPC origin の停止、権限不足など、server-side 境界で発生した
 * 例外の詳細を Browser に露出しないために使用する。画面名だけを受け取り、原因文字列や内部追跡情報は
 * props として受け取らない。これにより secret material や internal implementation detail の漏えいを防ぐ。
 *
 * @param props - 表示対象画面を表す入力値。
 * @param props.screenName - 通知 title に使う画面名。例: `Threads`、`Runs`。
 * @returns Secret-free な ErrorAlert 表示。
 *
 * @example
 * ```tsx
 * <AgentDataUnavailableAlert screenName="Threads" />
 * ```
 */
export function AgentDataUnavailableAlert({ screenName }: AgentDataUnavailableAlertProps) {
  return (
    // Browser には原因詳細を渡さず、運用者が取るべき安全な状態だけを伝える。
    <ErrorAlert
      title={`${screenName} data unavailable`}
      message="Agent RPC data is temporarily unavailable. Safe metadata only is shown."
    />
  );
}
