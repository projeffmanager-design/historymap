'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync, execSync } = require('node:child_process');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('        async function _gitPushTiles(label) {');
const end = source.indexOf('        let _tileRebuildInProgress', start);
assert.ok(start >= 0 && end > start);
const env = { ...process.env, GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_NOSYSTEM:'1' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding:'utf8', stdio:'pipe' }).trim();

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'territory-sync-'));
    t.after(() => fs.rmSync(root, { recursive:true, force:true }));
    const remote = path.join(root, 'remote.git');
    const project = path.join(root, 'project worktree');
    git(root, 'init', '--bare', '--initial-branch=main', remote);
    git(root, 'init', '--initial-branch=main', project);
    git(project, 'config', 'user.name', 'Tile sync test');
    git(project, 'config', 'user.email', 'tiles@example.test');
    fs.mkdirSync(path.join(project, 'public', 'tiles'), { recursive:true });
    fs.writeFileSync(path.join(project, 'public', 'tiles', 'index.json'), '[]\n');
    git(project, 'add', '.');
    git(project, 'commit', '-m', 'initial tiles');
    git(project, 'remote', 'add', 'origin', remote);
    git(project, 'push', 'origin', 'HEAD:main');
    git(project, 'checkout', '--detach');
    const context = vm.createContext({
        __dirname:project,
        require:name => {
            assert.equal(name, 'child_process');
            return { execSync:(command, options) => execSync(command, { ...options, env, stdio:'pipe' }) };
        },
        console:{ log() {}, error() {} }
    });
    vm.runInContext(source.slice(start, end), context);
    return { root, remote, project, context, sync:() => context._gitPushTiles('manual test') };
}

test('tile sync pushes a new tile commit from detached HEAD to remote main', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.project, 'public', 'tiles', 'index.json'), '[1]\n');
    const result = await f.sync();
    assert.equal(result.ok, true, result.message);
    assert.equal(result.changed, true);
    assert.equal(git(f.remote, 'rev-parse', 'main'), git(f.project, 'rev-parse', 'HEAD'));
});

test('retry pushes an existing tile commit without creating another commit', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.project, 'public', 'tiles', 'index.json'), '[2]\n');
    git(f.project, 'add', 'public/tiles');
    git(f.project, 'commit', '-m', 'tiles committed before failed push');
    const head = git(f.project, 'rev-parse', 'HEAD');
    const result = await f.sync();
    assert.equal(result.ok, true, result.message);
    assert.equal(result.changed, true, 'publishing an existing pending commit counts as a sync');
    assert.equal(git(f.project, 'rev-parse', 'HEAD'), head);
    assert.equal(git(f.remote, 'rev-parse', 'main'), head);
    assert.equal((await f.sync()).changed, false, 'a second sync has no remaining changes');
});

test('tile sync preserves a newer remote main when histories diverge', async t => {
    const f = fixture(t);
    const other = path.join(f.root, 'other');
    git(f.root, 'clone', f.remote, other);
    git(other, 'config', 'user.name', 'Another editor');
    git(other, 'config', 'user.email', 'other@example.test');
    fs.writeFileSync(path.join(other, 'other.txt'), 'remote change\n');
    git(other, 'add', '.');
    git(other, 'commit', '-m', 'another remote update');
    git(other, 'push', 'origin', 'HEAD:main');
    const remoteHead = git(f.remote, 'rev-parse', 'main');
    fs.writeFileSync(path.join(f.project, 'public', 'tiles', 'index.json'), '[3]\n');
    const result = await f.sync();
    assert.equal(result.ok, false);
    assert.equal(git(f.remote, 'rev-parse', 'main'), remoteHead);
});

test('deployment status counts pending commits without a branch upstream', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.project, 'public', 'tiles', 'index.json'), '[4]\n');
    git(f.project, 'add', 'public/tiles');
    git(f.project, 'commit', '-m', 'pending tile change');
    const line = source.match(/^\s*const unpushed = .*$/m)?.[0];
    assert.ok(line);
    f.context.execSync = (command, options) => execSync(command, { ...options, env, stdio:'pipe' });
    const unpushed = vm.runInContext(`${line}\nunpushed;`, f.context);
    assert.equal(unpushed.split('\n').filter(Boolean).length, 1);
});
