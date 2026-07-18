import { redirect } from 'next/navigation';

/**
 * root entry。Management Client の開始点は `Agents` 一覧のため、`/agents` へ誘導する。
 * 旧 control-room hero は廃止し、左サイドバー shell 配下の Agents screen が開始点になる。
 */
export default function HomePage() {
  redirect('/agents');
}
