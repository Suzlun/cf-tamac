import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../..', import.meta.url);
const appRoot = new URL('../../app/', import.meta.url);

const forbiddenBrowserPaths = [
  /['"`]\/api\/client(?:\/|['"`?#])/u,
  /['"`]\/api\/agent(?:\/|['"`?#])/u,
];

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

function relativePath(filePath: string): string {
  return relative(fileURLToPath(packageRoot.href), filePath).replaceAll('\\', '/');
}

function appRoutePath(filePath: string): string {
  const relativeRouteFile = relative(fileURLToPath(appRoot.href), filePath).replaceAll('\\', '/');
  const route = relativeRouteFile
    .replace(/\/page\.tsx$/u, '')
    .replace(/\/route\.ts$/u, '')
    .replace(/^page\.tsx$/u, '')
    .replace(/^route\.ts$/u, '')
    .replace(/\[[^\]]+\]/gu, ':param');
  const normalizedRoute = `/${route}`.replace(/\/$/u, '');
  return normalizedRoute === '' ? '/' : normalizedRoute;
}

describe('Management Client Agent API proxy absence', () => {
  it('[MANAGEMENT-CLIENT-S008] Client exposes no Agent API proxy route', () => {
    const appFiles = collectFiles(appRoot);
    const pageRouteManifest = appFiles
      .filter((filePath) => filePath.endsWith('/page.tsx'))
      .map(appRoutePath)
      .sort();
    const routeHandlerInventory = appFiles
      .filter((filePath) => filePath.endsWith('/route.ts'))
      .map(appRoutePath)
      .sort();

    expect(pageRouteManifest).toEqual([
      '/',
      '/agents',
      '/agents/:param',
      '/agents/:param/events',
      '/agents/:param/integrations',
      '/agents/:param/schedules',
      '/agents/:param/settings',
      '/agents/:param/threads',
      '/agents/:param/tools',
      '/agents/new',
    ]);
    expect(routeHandlerInventory).toEqual([]);
    expect(existsSync(fileURLToPath(new URL('api/', appRoot).href))).toBe(false);

    const proxyIssues = appFiles.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenBrowserPaths
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${relativePath(filePath)} exposes ${String(pattern)}`);
    });
    expect(proxyIssues).toEqual([]);
  });
});
