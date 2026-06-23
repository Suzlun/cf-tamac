import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serverCredentialsRoot = new URL('../server/credentials', import.meta.url);

function collectFiles(root: URL): string[] {
  const rootPath = fileURLToPath(root.href);
  if (!existsSync(rootPath)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(rootPath).sort()) {
    const fullPath = `${rootPath}/${entry}`;
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFiles(new URL(`${entry}/`, root)));
    } else if (stats.isFile() && /\.(?:ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Management Client credential boundary', () => {
  it('[CLIENT-REGISTRY-S002] secret resolution module is server-only', () => {
    const files = collectFiles(serverCredentialsRoot);
    expect(files.length).toBeGreaterThan(0);

    const secretResolutionPath = fileURLToPath(
      new URL('../server/credentials/secret-resolution.ts', import.meta.url).href
    );
    const secretResolution = readFileSync(secretResolutionPath, 'utf8');
    expect(secretResolution).toContain("import 'server-only';");
  });

  it('[CLIENT-REGISTRY-S002] browser-safe serialization excludes secret material', () => {
    const browserSafePath = fileURLToPath(
      new URL('../server/credentials/browser-safe.ts', import.meta.url).href
    );
    const browserSafe = readFileSync(browserSafePath, 'utf8');

    expect(browserSafe).toContain('BrowserSafeCredentialReference');
    expect(browserSafe).not.toContain('secretMaterial');
    expect(browserSafe).not.toContain('privateKey');
    expect(browserSafe).not.toContain('sharedSecret');
  });

  it('[CLIENT-REGISTRY-S002] browser-safe type does not leak credentialRef', () => {
    const browserSafePath = fileURLToPath(
      new URL('../server/credentials/browser-safe.ts', import.meta.url).href
    );
    const browserSafe = readFileSync(browserSafePath, 'utf8');

    const interfaceRegex = /export interface BrowserSafeCredentialReference {[^}]+}/;
    const match = interfaceRegex.exec(browserSafe);
    expect(match).not.toBeNull();
    const interfaceText = match?.[0] ?? '';
    expect(interfaceText).not.toContain('credentialRef');
    expect(interfaceText).not.toContain('publicFingerprint');
    expect(interfaceText).toContain('maskedHint');
  });
});
