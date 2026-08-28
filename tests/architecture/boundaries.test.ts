import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('architecture boundaries', () => {
  it(
    'passes dependency-cruiser rules',
    () => {
      const result = execFileSync(
        'npx',
        ['depcruise', 'src', '--config', '.dependency-cruiser.cjs'],
        { cwd: root, encoding: 'utf8' },
      );
      expect(result).toContain('no dependency violations found');
    },
    20_000,
  );

  it('domain sources do not import outward layers', () => {
    const domainFiles = listTsFiles(path.join(root, 'src/domain'));
    for (const file of domainFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(
        /from ['"]\.\.\/\.\.\/(application|infrastructure|ports|agent|interfaces)/,
      );
      expect(source).not.toMatch(
        /from ['"]@(application|infrastructure|ports)\//,
      );
    }
  });

  it('application sources do not import infrastructure', () => {
    const appFiles = listTsFiles(path.join(root, 'src/application'));
    for (const file of appFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from ['"].*infrastructure/);
      expect(source).not.toMatch(/from ['"]@infrastructure\//);
    }
  });

  it('application and domain sources do not import googleapis', () => {
    const roots = [
      path.join(root, 'src/domain'),
      path.join(root, 'src/application'),
      path.join(root, 'src/ports'),
    ];
    for (const dir of roots) {
      for (const file of listTsFiles(dir)) {
        const source = fs.readFileSync(file, 'utf8');
        expect(source).not.toMatch(/from ['"]googleapis['"]/);
        expect(source).not.toMatch(/from ['"]googleapis\//);
        expect(source).not.toMatch(/from ['"]ioredis['"]/);
      }
    }
  });

  it('googleapis imports are confined to the Google Calendar adapter', () => {
    const infraFiles = listTsFiles(path.join(root, 'src/infrastructure'));
    for (const file of infraFiles) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/from ['"]googleapis['"]/.test(source)) continue;
      expect(file.replace(/\\/g, '/')).toMatch(
        /infrastructure\/calendar\/google\//,
      );
    }
  });

  it('ioredis imports are confined to the Redis WorkingMemory adapter', () => {
    const infraFiles = listTsFiles(path.join(root, 'src/infrastructure'));
    for (const file of infraFiles) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/from ['"]ioredis['"]/.test(source)) continue;
      expect(file.replace(/\\/g, '/')).toMatch(
        /infrastructure\/memory\/redis\//,
      );
    }
  });

  it('agent sources do not import infrastructure', () => {
    const agentFiles = listTsFiles(path.join(root, 'src/agent'));
    for (const file of agentFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from ['"].*infrastructure/);
      expect(source).not.toMatch(/from ['"]@infrastructure\//);
      expect(source).not.toMatch(/from ['"]express['"]/);
      expect(source).not.toMatch(/from ['"]ioredis['"]/);
      expect(source).not.toMatch(/from ['"]googleapis['"]/);
    }
  });

  it('express imports are confined to HTTP interfaces', () => {
    for (const file of listTsFiles(path.join(root, 'src'))) {
      const source = fs.readFileSync(file, 'utf8');
      // type-only imports from express in runtime bootstrap are acceptable for DI typing
      if (!/from ['"]express['"]/.test(source)) continue;
      if (file.replace(/\\/g, '/').includes('/runtime/')) continue;
      expect(file.replace(/\\/g, '/')).toMatch(/interfaces\/http\//);
    }
  });

  it('OpenRouter adapter is not imported by agent/domain/application/ports/interfaces', () => {
    const blocked = [
      'src/domain',
      'src/application',
      'src/ports',
      'src/agent',
      'src/interfaces',
    ];
    for (const rel of blocked) {
      for (const file of listTsFiles(path.join(root, rel))) {
        const source = fs.readFileSync(file, 'utf8');
        expect(source).not.toMatch(/infrastructure\/llm\/openrouter/);
        expect(source).not.toMatch(/OpenRouterChatModel/);
      }
    }
  });
});
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
