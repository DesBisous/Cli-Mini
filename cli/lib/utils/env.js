const semver = require('semver');
const { execSync } = require('child_process'); // 子进程
const fs = require('fs');
const path = require('path');
const LRU = require('lru-cache');

const _npmProjects = new LRU({
  max: 10, // 缓存大小
  maxAge: 1000 // 缓存周期，毫秒单位
})

exports.hasProjectNpm = (cwd) => {
  // 缓存中是否已判断过了，如果是则直接返回结果
  if (_npmProjects.has(cwd)) {
    // 不进行检查，原因在于，使用该 cli 说明当前环境存在 npm
    // 如果 npm 不存在，cli 命令也不会生效
    return _npmProjects.get(cwd);
  }

  const lockFile = path.join(cwd, 'package-lock.json');
  const result = fs.existsSync(lockFile);
  _npmProjects.set(cwd, result);
  return result;
}

let _hasYarn = null;
const _yarnProjects = new LRU({
  max: 10, // 缓存大小
  maxAge: 1000 // 缓存周期，毫秒单位
});

exports.hasProjectYarn = (cwd) => {
  // 从 lru-cache 缓存中查找是否做过 yarn 判断了
  if (_yarnProjects.has(cwd)) {
    // 存在 yarn 缓存，检查 yarn 是否已安装了，如果存在直接返回 true
    return checkYarn(_yarnProjects.get(cwd));
  }
  // 不存在使用 yarn 的痕迹，查找 cwd 的 yarn.lock
  const lockFile = path.join(cwd, 'yarn.lock');
  const result = fs.existsSync(lockFile);
  _yarnProjects.set(cwd, result); // 对当前 cwd 存储 yarn 存在的记录
  return checkYarn(result); // 检查 yarn 是否本地已安装
}

function checkYarn (result) {
  if (result && !exports.hasYarn()) throw new Error(`The project seems to require yarn but it's not installed.`)
  return result
}

exports.hasYarn = () => {
  if (_hasYarn != null) {
    return _hasYarn
  }
  try {
    // 开启子进程检查 yarn 版本，以此判断 yarn 是否存在，ignore 不进行输出，可设置为 inherit 输出
    execSync('yarn --version', { stdio: 'ignore' })
    return (_hasYarn = true)
  } catch (e) {
    return (_hasYarn = false)
  }
}


let _hasPnpm = null;
let _pnpmVersion = null;
const _pnpmProjects = new LRU({
  max: 10,
  maxAge: 1000
})

exports.hasProjectPnpm = (cwd) => {
  // 判断缓存是否存在 Pnpm
  if (_pnpmProjects.has(cwd)) {
    // 检查 Pnpm 是否安装了
    return checkPnpm(_pnpmProjects.get(cwd));
  };

  const lockFile = path.join(cwd, 'pnpm-lock.yaml');
  const result = fs.existsSync(lockFile);
  _pnpmProjects.set(cwd, result);
  return checkPnpm(result); // 检查 Pnpm 是否安装了
}

function checkPnpm (result) {
  if (result && !exports.hasPnpm3OrLater()) {
    throw new Error(`The project seems to require pnpm${_hasPnpm ? ' >= 3' : ''} but it's not installed.`)
  };
  return result;
}

exports.hasPnpm3OrLater = () => {
  // 查询当前环境的 Pnpm 是否大于 '3.0.0' 版本
  return this.hasPnpmVersionOrLater('3.0.0');
}

exports.hasPnpmVersionOrLater = (version) => {
  // 版本比较，查询到的版本号是否大于等于 version
  return semver.gte(getPnpmVersion(), version)
}

function getPnpmVersion() {
  // 以获取过版本号的话，直接返回
  if (_pnpmVersion != null) {
    return _pnpmVersion;
  };
  try {
    // 执行 pnpm --version 输出版本号
    _pnpmVersion = execSync('pnpm --version', {
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString();
    // there's a critical bug in pnpm 2
    // https://github.com/pnpm/pnpm/issues/1678#issuecomment-469981972
    // so we only support pnpm >= 3.0.0
    _hasPnpm = true;
  } catch (e) {}
  return _pnpmVersion || '0.0.0';
}


