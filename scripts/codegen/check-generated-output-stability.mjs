import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = process.cwd();

const generatedRoots = [
  'packages/agent/proto',
  'packages/agent/src/generated/rpc',
  'packages/client/src/generated/agent-rpc',
  'packages/sdk/src/generated/agent-rpc',
];

/**
 * command-owned generated root の内容を、file path と bytes の順序付きSHA-256へ畳み込みます。
 *
 * @param {string} root - repository rootからのgenerated directoryです。
 * @returns {string} directory内のrelative pathとfile bytesを含む安定したhex digestです。
 */
export function snapshotGeneratedRoot(root) {
  const absoluteRoot = resolve(projectRoot, root);
  const files = listFiles(absoluteRoot).sort((left, right) => left.localeCompare(right));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${relative(absoluteRoot, file)}\0`);
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * 生成commandを実行し、失敗をcodegen gateへ伝播します。
 *
 * @param {string[]} command - 実行するprogramとargumentです。
 * @throws 子processがnon-zero終了した場合に発生します。
 */
function runCommand(command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Codegen command failed with status ${String(result.status)}: ${command.join(' ')}`
    );
  }
}

function listFiles(directory) {
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Generated root is not a directory: ${directory}`);
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

function main() {
  // 生成前のworktree状態を基準にし、commit/clean checkoutへ依存せずcommandの決定性を検査します。
  const before = new Map(generatedRoots.map((root) => [root, snapshotGeneratedRoot(root)]));
  runCommand(['pnpm', 'gen']);
  // parity、field stability、禁止surfaceは既存のstandalone checkerへ委譲します。
  runCommand(['node', 'scripts/codegen/check-agent-codegen-drift.mjs']);

  const changedRoots = [];
  for (const root of generatedRoots) {
    const beforeHash = before.get(root);
    const afterHash = snapshotGeneratedRoot(root);
    if (beforeHash !== afterHash) {
      changedRoots.push(`${root}: ${beforeHash} -> ${afterHash}`);
    }
    process.stdout.write(`${root}: ${beforeHash} == ${afterHash}\n`);
  }
  if (changedRoots.length > 0) {
    throw new Error(
      `Generated output changed after a deterministic regeneration:\n${changedRoots.join('\n')}`
    );
  }
  process.stdout.write('Codegen generated-root stability: PASS\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
