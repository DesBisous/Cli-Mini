const semver = require('semver');
const PackageManager = require('./projectPackageManager');
const { cliPkgName } = require('../data');
const { loadOptions, saveOptions } = require('./options');


let sessionCached = null;
const pm = new PackageManager();

module.exports = async function getVersions() {
  if (sessionCached) {
    return sessionCached;
  }

  // latest 是一个 30 分钟内缓存的最新稳定版本，30缓存失效就会获取最新稳定的版本
  let latest = null;
  const local = require('../../package.json').version;

  // 检查版本是否为非稳定版本 0.0.1-alpha.1 => [ 'alpha', 1 ]、0.0.1 => null
  const includePrerelease = !!semver.prerelease(local);

  // 获取本地版本记录
  const { latestVersion = local, lastChecked = 0 } = loadOptions();
  const cached = latestVersion;
  const daysPassed = (Date.now() - lastChecked) / (60 * 60 * 1000 * 24)

  let error;
  if (daysPassed > 1) {
    // 如果我们在一天内没有检查新版本，请等待检查
    // before proceeding
    try {
      latest = await getAndCacheLatestVersion(cached, includePrerelease)
    } catch (e) {
      latest = cached
      error = e
    }
  }  else {
    // 否则，在后台进行检查。如果结果已更新，
    // 它将用于接下来的24小时。
    // 如果背景检查失败，请勿抛出中断用户
    getAndCacheLatestVersion(cached, includePrerelease).catch(() => {})
    latest = cached
  }

  // 如果当前已安装的版本可能大于缓存的版本了，说明已被更新了，并且当前的 local 版本不是预发布版本
  if (semver.gt(local, latest) && !semver.prerelease(local)) {
    latest = local;
  }

  // latestMinor 获取 latest 版本的 主要版本号.次要版本号.0 
  let latestMinor = `${semver.major(latest)}.${semver.minor(latest)}.0`;
  if (
    // 如果两个版本包含破坏更改，则尊重用户，保留本地版本
    /major/.test(semver.diff(local, latest)) ||
    // 如果本地版本大于等于最新稳定版本 latest，并且是预发布的版本，则尊重用户，保留本地预发布版本
    (semver.gte(local, latest) && semver.prerelease(local))
  ) {
    // fallback to the local cli version number
    latestMinor = local;
  }

  // 缓存并返回
  return (sessionCached = {
    current: local,
    latest,
    latestMinor,
    error
  })
}

// 获取最新版本并将其保存在磁盘上
// 使它在下次立即可用
async function getAndCacheLatestVersion(cached, includePrerelease) {
  // 获取稳定版本
  let version = await pm.getRemoteVersion(cliPkgName, 'latest');
  
  console.log('version:', version, includePrerelease);
  // 如果本地 Cli 为预发布版本，则查询最新 next 版本
  if (includePrerelease) {
    const next = await pm.getRemoteVersion(cliPkgName, 'next');
    console.log('next:', next);
    // 如果 next 大于当前版本就使用最新的 next 版本，否者还是使用稳定版本
    version = semver.gt(next, version) ? next : version;
  }

  // 检验合法，保存在缓存中;
  if (semver.valid(version) && version !== cached) {
    saveOptions({ latestVersion: version, lastChecked: Date.now() });
    return version;
  }
  return cached;
}