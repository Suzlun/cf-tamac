import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../..', import.meta.url);
const componentsUiDir = new URL('../components/ui/', import.meta.url);
const componentsDir = new URL('../components', import.meta.url);
const appDir = new URL('../../app', import.meta.url);
const layoutPath = new URL('../../app/layout.tsx', import.meta.url);
const globalsCssPath = new URL('../../app/globals.css', import.meta.url);
const tailwindConfigPath = new URL('../../tailwind.config.ts', import.meta.url);
const inventoryPath = new URL('../../shadcn-official-components.json', import.meta.url);

interface ShadcnInventory {
  readonly componentNames: readonly string[];
}

function read(filePath: URL): string {
  return readFileSync(fileURLToPath(filePath.href), 'utf8');
}

function relativePath(filePath: string): string {
  return relative(fileURLToPath(packageRoot.href), filePath).replaceAll('\\', '/');
}

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

// 旧 control-room 独自 token / class / gradient。これらが styling source に残っていないか検証する。
const FORBIDDEN_OLD_TOKENS = [
  '--paper',
  '--ink',
  '--coal',
  '--panel',
  '--signal',
  '--cyan',
  'Iowan Old Style',
  'radial-gradient',
  'control-room',
  '.topline',
  '.signal-badge-dot',
  '.data-table-wrapper',
  '.storage-meter',
  '.route-grid',
];

const FORBIDDEN_IMPORTS_REGEX =
  /(?:from\s+["']server-only["']|@connectrpc\/connect|@bufbuild\/protobuf|@cf-tamac\/client-agent-rpc|drizzle-orm|packages\/agent\/src|from\s+["'][^"']*server\/(?:actions|agent-rpc|credentials)[^"']*["'])/u;

describe('Management Client design system', () => {
  it('[CLIENT-DESIGN-SYSTEM-S001] 全 Shadcn 公式 component が local source として存在する', () => {
    const inventory = JSON.parse(read(inventoryPath)) as ShadcnInventory;
    expect(inventory.componentNames.length).toBeGreaterThan(0);

    // 在庫の各 component が編集可能な local TSX source として存在する。
    for (const name of inventory.componentNames) {
      const componentFile = new URL(`${name}.tsx`, componentsUiDir);
      expect(existsSync(fileURLToPath(componentFile.href))).toBe(true);
    }

    // runtime remote registry / remote component package を消費しない（local import のみ）。
    const uiSources = collectFiles(componentsUiDir)
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n');
    expect(uiSources).not.toMatch(/ui\.shadcn\.com|registry:ui|shadcn\/registry/i);
  });

  it('[CLIENT-DESIGN-SYSTEM-S002] TAMAC tinted token と指定書体が styling source である', () => {
    const globals = read(globalsCssPath);
    const tailwindConfig = read(tailwindConfigPath);
    const layout = read(layoutPath);

    // TAMAC の mineral teal token block と Tailwind directives が存在する。
    expect(globals).toContain('@tailwind base');
    expect(globals).toContain('--background: 180 20% 96.1%;');
    expect(globals).toContain('--foreground: 189 39% 12.9%;');
    expect(globals).toContain('--primary: 183 83% 22.7%;');
    expect(globals).toContain('--border: 186 17% 76.3%;');
    expect(globals).toContain('fonts.googleapis.com/css2?family=IBM+Plex+Mono');
    expect(globals).toContain('family=IBM+Plex+Sans+JP');
    expect(globals).toContain('.dark');
    expect(tailwindConfig).toContain('hsl(var(--background))');
    expect(tailwindConfig).toContain('hsl(var(--primary))');
    expect(tailwindConfig).toContain('IBM Plex Sans JP');
    expect(tailwindConfig).toContain('IBM Plex Mono');
    expect(layout).toContain('<body>');

    // 旧 control-room 独自 token / class / font / gradient は styling source に残っていない。
    for (const forbidden of FORBIDDEN_OLD_TOKENS) {
      expect(globals).not.toContain(forbidden);
      expect(tailwindConfig).not.toContain(forbidden);
    }
  });

  it('[CLIENT-DESIGN-SYSTEM-S004] UI component 層が Agent RPC seam を import しない', () => {
    // src/components/** と app/** の browser-visible module は Agent RPC seam を含まない。
    // ただし app/** の Server Component から server actions を呼ぶのは許容される（server-side execution）。
    const componentFiles = collectFiles(componentsDir);
    const importIssues = componentFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return FORBIDDEN_IMPORTS_REGEX.test(content)
        ? [`${relativePath(filePath)} imports Agent RPC/server-only seam`]
        : [];
    });
    expect(importIssues).toEqual([]);

    // component 層に credential/secret 文字列が含まれない。
    const componentSources = componentFiles
      .map((filePath) => readFileSync(filePath, 'utf8'))
      .join('\n');
    expect(componentSources).not.toContain('credentialRef');
    expect(componentSources).not.toContain('secretMaterial');
    expect(componentSources).not.toContain('privateKey');
    expect(componentSources).not.toContain('Bearer ');
  });

  it('[CLIENT-DESIGN-SYSTEM-S001] feature components use Shadcn primitives for visible controls', () => {
    const componentFiles = collectFiles(componentsDir).filter(
      (filePath) => !relativePath(filePath).startsWith('src/components/ui/')
    );
    const rawControlIssues = componentFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      const matches = content.matchAll(
        /<(button|select|textarea|table)\b|<input\b(?![^>]*type=["']hidden["'])/gu
      );
      return [...matches].map(
        (match) => `${relativePath(filePath)} contains raw <${match[1] ?? 'input'}>`
      );
    });

    expect(rawControlIssues).toEqual([]);
  });
});

describe('Management Client browser import graph after Shadcn materialization', () => {
  it('[CLIENT-DESIGN-SYSTEM-S004] app routes do not import Connect runtime or generated Agent RPC construction', () => {
    // app/** は Server Component から server actions を呼べるが、Connect runtime や
    // generated Agent RPC client の直接 construction / server-only factory を持たない。
    const appFiles = collectFiles(appDir);
    const importIssues = appFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return /(?:@connectrpc\/connect|@bufbuild\/protobuf|@cf-tamac\/client-agent-rpc|from\s+["']server-only["'])/u.test(
        content
      )
        ? [`${relativePath(filePath)} imports Agent RPC/Connect/server-only seam`]
        : [];
    });
    expect(importIssues).toEqual([]);
  });
});
