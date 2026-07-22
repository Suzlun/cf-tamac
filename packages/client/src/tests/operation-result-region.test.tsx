import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OperationResultRegion } from '../components/operation-result-region';

import type { BrowserSafeAgentRpcResult } from '../components/schemas/browser-safe-result';

const componentPath = new URL('../components/operation-result-region.tsx', import.meta.url);

describe('OperationResultRegion accessibility contract', () => {
  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] runtime rendering keeps the prior failed result and confirmation action mounted while pending', () => {
    const result: BrowserSafeAgentRpcResult<{ readonly title: string; readonly message: string }> =
      {
        displayData: {
          message: '設定の適用状態を確認してください。',
          title: '適用状態を確認してください',
        },
        safeErrorCategory: 'unavailable',
        safeStatus: 'failed',
        correlationId: 'correlation-runtime-test',
      };

    const markup = renderToStaticMarkup(
      createElement(
        OperationResultRegion,
        {
          result,
          pending: true,
          pendingTitle: '適用状態を確認しています',
          pendingMessage: 'サーバー側の設定を照合しています…',
        },
        createElement('button', { type: 'button' }, '適用状態を確認')
      )
    );

    // pending の通知は status に切り替わる一方、直前結果の問い合わせ ID と確認 action は DOM 上に残る。
    expect(markup).toContain('role="status"');
    expect(markup).toContain('適用状態を確認しています');
    expect(markup).toContain('correlation-runtime-test');
    expect(markup).toContain('適用状態を確認');
    expect(markup).toContain('問い合わせID');
  });

  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] focuses success, safe failure, and reconciliation completion headings after commit', () => {
    const source = readFileSync(fileURLToPath(componentPath.href), 'utf8');

    // commit 後の frame/timeout と cleanup を使い、Chromium/Firefox/WebKit の描画 race で focus を取りこぼさない。
    expect(source).toContain('heading.focus({ preventScroll: true })');
    expect(source).toContain('globalThis.requestAnimationFrame');
    expect(source).toContain('cancelFrame(frameId)');
    expect(source).toContain('const completionKey = getCompletionKey(result, pending)');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('focus:ring-2 focus:ring-ring focus:ring-offset-2');

    // 同じ component path が success/failure/reconciliation の共通 result を受け、heading を programmatic target として再利用する。
    expect(source).toContain('result.displayData.title');
    expect(source).toContain("const failedResult = result?.safeStatus === 'failed'");
  });

  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] assigns one status/alert notification ancestor with matching live semantics', () => {
    const source = readFileSync(fileURLToPath(componentPath.href), 'utf8');

    expect(source).toContain("role={failed ? 'alert' : 'status'}");
    expect(source).toContain("aria-live={failed ? undefined : 'polite'}");
    expect(source).toContain('aria-atomic="true"');
  });

  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] keeps the result heading out of normal Tab order before the next safe action', () => {
    const source = readFileSync(fileURLToPath(componentPath.href), 'utf8');

    // heading は tabIndex=-1 の programmatic target、次の keyboard action は support copy/follow-up button の DOM 順に置かれる。
    const headingIndex = source.indexOf('<h3');
    const supportActionIndex = source.indexOf('問い合わせIDをコピー', headingIndex);
    const childrenIndex = source.indexOf('{children}', headingIndex);
    expect(headingIndex).toBeGreaterThan(-1);
    expect(supportActionIndex).toBeGreaterThan(headingIndex);
    expect(childrenIndex).toBeGreaterThan(supportActionIndex);
  });

  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] keeps existing result actions mounted while reconciliation is pending', () => {
    const source = readFileSync(fileURLToPath(componentPath.href), 'utf8');

    // pending は別 return branch で children を unmount せず、同じ notification ancestor の末尾に維持する。
    const pendingGuardIndex = source.indexOf('if (!pending && result === undefined)');
    const childrenIndex = source.indexOf('{children}');
    expect(pendingGuardIndex).toBeGreaterThan(-1);
    expect(childrenIndex).toBeGreaterThan(pendingGuardIndex);
    expect(source).not.toContain('if (pending) {');
  });

  it('[MANAGEMENT-CLIENT-WIREFRAMES-S001] assigns state-specific semantic surfaces without changing the result layout', () => {
    const source = readFileSync(fileURLToPath(componentPath.href), 'utf8');

    expect(source).toContain("displayData.registrationOutcome === 're_registration_ready'");
    expect(source).toContain("displayData.registrationOutcome === 'reconciliation_required'");
    expect(source).toContain('displayData.reconciliationRequired === true');
    expect(source).toContain('border-operation-success-border');
    expect(source).toContain('border-operation-reconciliation-border');
    expect(source).toContain('border-operation-reregistration-border');
  });
});
