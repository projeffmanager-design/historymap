'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runSync(args, overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-sync-'));
    try {
        const project = path.join(dir, 'project worktree');
        const bin = path.join(dir, 'bin');
        fs.mkdirSync(project);
        fs.mkdirSync(bin);
        fs.copyFileSync(path.join(__dirname, '..', 'sync'), path.join(project, 'sync'));
        fs.writeFileSync(path.join(bin, 'git'), [
            '#!/bin/bash',
            'printf "%s|%s\\n" "$PWD" "$*" >> "$SYNC_TEST_LOG"',
            'if [ "$1" = diff ]; then exit "${SYNC_TEST_DIFF_STATUS:-1}"; fi',
            'if [ "$1" = push ]; then exit "${SYNC_TEST_PUSH_STATUS:-0}"; fi',
            ''
        ].join('\n'), { mode:0o755 });
        const log = path.join(dir, 'calls');
        const result = spawnSync('bash', [path.join(project, 'sync'), ...args], {
            cwd:dir, encoding:'utf8',
            env:{ ...process.env, PATH:`${bin}:${process.env.PATH}`, SYNC_TEST_LOG:log, ...overrides }
        });
        return { ...result, project, calls:fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
    } finally { fs.rmSync(dir, { recursive:true, force:true }); }
}

test('sync pushes the current worktree commit instead of the separate local main branch', () => {
    const result = runSync(['번역 제출 활성화']);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls.map(line => line.split('|')[1]), [
        'add .', 'diff --cached --quiet', 'commit -m 번역 제출 활성화', 'push origin HEAD:main'
    ]);
    assert.ok(result.calls.every(line => line.startsWith(`${result.project}|`)));
    assert.doesNotMatch(result.calls.join('\n'), /--force/);
});

test('already committed work can still be pushed after an earlier failed deployment attempt', () => {
    const result = runSync(['배포 재시도'], { SYNC_TEST_DIFF_STATUS:'0' });
    assert.equal(result.status, 0);
    assert.ok(result.calls.some(line => line.endsWith('|push origin HEAD:main')));
    assert.ok(result.calls.every(line => !line.includes('|commit ')));
});

test('sync without a commit message explains usage without changing Git state', () => {
    const result = runSync([]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /커밋 메시지를 입력/);
    assert.deepEqual(result.calls, []);
});

test('a rejected push does not announce a successful deployment or try to force it', () => {
    const result = runSync(['동기화'], { SYNC_TEST_PUSH_STATUS:'1' });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /동기화 완료/);
    assert.equal(result.calls.filter(line => line.includes('|push ')).length, 1);
});
