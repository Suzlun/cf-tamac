import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';

/** サニタイズ済みのマークアップを描画するコンポーネントのプロパティ。 */
interface SafeHTMLProps {
  /** サニタイズするマークアップ文字列。 */
  html: string;
  /** 追加のクラス名 */
  className?: string;
  /** カスタムサニタイズ設定（オプション） */
  sanitizeOptions?: DOMPurifyConfig;
}

/**
 * DOMPurifyでサニタイズしたマークアップを安全にレンダリングするコンポーネント。
 *
 * @example
 * ```tsx
 * // マークダウンから生成したマークアップ
 * <SafeHTML html={marked.parse(markdown)} />
 *
 * // 外部サービスから取得したコンテンツ
 * <SafeHTML html={apiContent} />
 *
 * // カスタムサニタイズ設定
 * <SafeHTML
 *   html={richText}
 *   sanitizeOptions={{ ALLOWED_TAGS: ['p', 'strong', 'em'] }}
 * />
 * ```
 */
function SafeHTML({ html, className, sanitizeOptions }: SafeHTMLProps) {
  const defaultConfig: DOMPurifyConfig = {
    // 標準設定: 一般的なHTMLタグを許可
    ALLOWED_TAGS: [
      // テキスト構造
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'pre',
      'code',
      // テキスト装飾
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'ins',
      'mark',
      'small',
      'sub',
      'sup',
      // リスト
      'ul',
      'ol',
      'li',
      // リンク
      'a',
      // テーブル
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      // ボタン
      'button',
      // 画像
      'img',
      // その他
      'hr',
      'span',
      'div',
    ],
    ALLOWED_ATTR: [
      // 一般的な属性
      'class',
      'id',
      // リンク
      'href',
      'title',
      'target',
      'rel',
      // 画像
      'src',
      'alt',
      'width',
      'height',
      // テーブル
      'colspan',
      'rowspan',
      // コード（構文ハイライト用）
      'data-language',
    ],
    // リンクのプロトコル制限
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    // data属性は禁止（セキュリティリスク）
    ALLOW_DATA_ATTR: false,
    // 安全でないスキームを削除
    SANITIZE_DOM: true,
    // HTMLコメントを削除
    ALLOW_UNKNOWN_PROTOCOLS: false,
  };

  const config: DOMPurifyConfig = sanitizeOptions ?? defaultConfig;
  const sanitized: unknown = DOMPurify.sanitize(html, config);
  const sanitizedHTML = typeof sanitized === 'string' ? sanitized : String(sanitized);

  // data: URI を含む画像をサニタイズ後に除去（DOMPurifyのプロトコル制限に加え、念のため）
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitizedHTML, 'text/html');
  for (const img of doc.querySelectorAll('img')) {
    const srcAttr = img.getAttribute('src');
    if (typeof srcAttr === 'string') {
      const normalizedSrc = srcAttr.trim().toLowerCase();
      if (normalizedSrc.startsWith('data:')) {
        img.remove();
      }
    }
  }
  const finalHTML = doc.body.innerHTML;

  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger -- DOMPurify でサニタイズ済み
      dangerouslySetInnerHTML={{ __html: finalHTML }}
    />
  );
}

export type { SafeHTMLProps };
export { SafeHTML };
