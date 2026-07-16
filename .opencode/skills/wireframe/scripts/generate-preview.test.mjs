import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const generatorPath = fileURLToPath(new URL('./generate-preview.mjs', import.meta.url));

/**
 * 一時 directory に JSON source を作成して preview generator を実行する。
 *
 * @param {string} source - wireframe JSON の内容。
 * @param {(fixtureDirectory: string, sourcePath: string, previewPath: string) => void} verify - fixture 検証処理。
 */
function withWireframeFixture(source, verify) {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), 'wireframe-preview-'));
  const sourcePath = path.join(fixtureDirectory, 'screen.wireframe.json');
  const previewPath = path.join(fixtureDirectory, 'screen.wireframe.html');

  try {
    mkdirSync(path.dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, source, 'utf8');
    verify(fixtureDirectory, sourcePath, previewPath);
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

const validWireframe = JSON.stringify(
  {
    name: '録音',
    viewport: { width: 1280, height: 800 },
    root: { name: '録音', direction: 'vertical', children: [] },
  },
  null,
  2
);

test('JSON source から generated preview を作成する', () => {
  withWireframeFixture(validWireframe, (_fixtureDirectory, sourcePath, previewPath) => {
    const result = spawnSync(process.execPath, [generatorPath, sourcePath], { encoding: 'utf8' });

    assert.equal(result.status, 0);
    const preview = readFileSync(previewPath, 'utf8');
    assert.match(preview, /^<!-- GENERATED FROM screen\.wireframe\.json BY /u);
    assert.match(preview, /const WIREFRAME_DATA = \{/u);
    assert.match(preview, /録音/u);
  });
});

test('generated preview の直接編集を check で検出する', () => {
  withWireframeFixture(validWireframe, (_fixtureDirectory, sourcePath, previewPath) => {
    const generateResult = spawnSync(process.execPath, [generatorPath, sourcePath], {
      encoding: 'utf8',
    });
    assert.equal(generateResult.status, 0);

    writeFileSync(
      previewPath,
      `${readFileSync(previewPath, 'utf8')}\n<!-- manual edit -->\n`,
      'utf8'
    );

    const checkResult = spawnSync(process.execPath, [generatorPath, '--check', sourcePath], {
      encoding: 'utf8',
    });
    assert.equal(checkResult.status, 1);
    assert.match(checkResult.stderr, /generated preview が JSON source と一致しません/u);
  });
});
