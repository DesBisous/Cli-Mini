const chalk = require('chalk');
const execa = require('execa');
const LRU = require('lru-cache')
const semver = require('semver');
const minimist = require('minimist');
const stripAnsi = require('strip-ansi'); // 从字符串中去除 ANSI 转义码
const registries = require('../data/registries');
const shouldUseTaobao = require('./shouldUseTaobao');
const shouldUseCompany = require('./shouldUseCompany');
const { resolvePkg } = require('./pkg');
const { request } = require('./request');
const { cliPkgName } = require('../data');
const { log, info, warn, error } = require('./logger');
const { loadOptions } = require('./options');
const {
  hasYarn,
  hasPnpm3OrLater,
  hasProjectYarn,
  hasProjectPnpm,
  hasProjectNpm,
  hasPnpmVersionOrLater
} = require('./env');

const metadataCache = new LRU({
  max: 200,
  maxAge: 1000 * 60 * 30 // 30 min.
})

const SUPPORTED_PACKAGE_MANAGERS = ['yarn', 'pnpm', 'npm'];
const PACKAGE_MANAGER_PNPM4_CONFIG = {
  install: ['install', '--reporter', 'silent', '--shamefully-hoist'],
  add: ['install', '--reporter', 'silent', '--shamefully-hoist'],
  upgrade: ['update', '--reporter', 'silent'],
  remove: ['uninstall', '--reporter', 'silent']
}
const PACKAGE_MANAGER_PNPM3_CONFIG = {
  install: ['install', '--loglevel', 'error', '--shamefully-flatten'],
  add: ['install', '--loglevel', 'error', '--shamefully-flatten'],
  upgrade: ['update', '--loglevel', 'error'],
  remove: ['uninstall', '--loglevel', 'error']
}
const PACKAGE_MANAGER_CONFIG = {
  npm: {
    install: ['install', '--loglevel', 'error'],
    add: ['install', '--loglevel', 'error'],
    upgrade: ['update', '--loglevel', 'error'],
    remove: ['uninstall', '--loglevel', 'error']
  },
  pnpm: hasPnpmVersionOrLater('4.0.0') ? PACKAGE_MANAGER_PNPM4_CONFIG : PACKAGE_MANAGER_PNPM3_CONFIG,
  yarn: {
    install: [],
    add: ['add'],
    upgrade: ['upgrade'],
    remove: ['remove']
  }
}

function extractPackageScope (packageName) {
  const scopedNameRegExp = /^(@[^/]+)\/.*$/
  const result = packageName.match(scopedNameRegExp)

  if (!result) {
    return undefined
  }

  return result[1]
}

class PackageManager {
  constructor({ context, forcePackageManager } = {}) {
    this.context = context || process.cwd();
    this._registries = {};

    // 指定包管理器
    if (forcePackageManager) {
      this.bin = forcePackageManager
    } else if (context) {
      // 从查找指定路径中去查询包管理器缓存
      if (hasProjectYarn(context)) {
        this.bin = 'yarn';
      } else if (hasProjectPnpm(context)) {
        this.bin = 'pnpm';
      } else if (hasProjectNpm(context)) {
        this.bin = 'npm';
      }
    }

    // 如果未指定包管理器，先去查找 rc 文件是否能够得到 packageManager，否则按照优先级来判断
    if (!this.bin) {
      this.bin = loadOptions().packageManager || (hasYarn() ? 'yarn' : hasPnpm3OrLater() ? 'pnpm' : 'npm');
    }

    if (this.bin === 'npm') {
      // npm 支持的版本你最低为 v6.9.0
      const MIN_SUPPORTED_NPM_VERSION = '6.9.0'
      // execa 是 child_process 的改进版
      const npmVersion = stripAnsi(execa.sync('npm', ['--version']).stdout);

      if (semver.lt(npmVersion, MIN_SUPPORTED_NPM_VERSION)) {
        throw new Error(
          'You are using an outdated version of NPM.\n' +
          `It does not support some core functionalities of ${cliPkgName}.\n` +
          'Please upgrade your NPM version.'
        )
      }

      // 版本大于等于 7.0.0 版本
      if (semver.gte(npmVersion, '7.0.0')) {
        this.needsPeerDepsFix = true;
      }
    }

    // 如果当前环境同时不存在 ['yarn', 'pnpm', 'npm']
    if (!SUPPORTED_PACKAGE_MANAGERS.includes(this.bin)) {
      log();
      warn(
        `The package manager ${chalk.red(this.bin)} is ${chalk.red('not officially supported')}.\n` +
        `It will be treated like ${chalk.cyan('npm')}, but compatibility issues may occur.\n` +
        `See if you can use ${chalk.cyan('--registry')} instead.`
      );
      // 找不到默认预设为 npm 包管理器
      PACKAGE_MANAGER_CONFIG[this.bin] = PACKAGE_MANAGER_CONFIG.npm;
    }

    // 获取指定目录或者 cwd 目录下的 package.js
    const projectPkg = resolvePkg(this.context);
    const resolveFrom = projectPkg && projectPkg.vuePlugins && projectPkg.vuePlugins.resolveFrom

    // 插件可能位于另一个位置。
    if (resolveFrom) {
      this.context = path.resolve(context, resolveFrom)
    }

  }


  async getRegistry(scope) {
    const cacheKey = scope || ''
    if (this._registries[cacheKey]) {
      return this._registries[cacheKey]
    }

    // 解析指令，是否指定了源 registry
    const args = minimist(process.argv, {
      alias: {
        r: 'registry'
      }
    })

    let registry;
    if (args.registry) {
      registry = args.registry; // 使用指定源
    } if (registries.company && await shouldUseCompany(this.bin)) {
      // 检查是否有私库源可用
      registry = registries.company;
    } else if (await shouldUseTaobao(this.bin)) {
      // 判断是否使用淘宝源
      registry = registries.taobao;
    } else {
      try {
        if (scope) {
          registry = (await execa(this.bin, ['config', 'get', scope + ':registry'])).stdout
        }
        // 找不到源就是用本地匹配到的 bin 的源
        if (!registry || registry === 'undefined') {
          registry = (await execa(this.bin, ['config', 'get', 'registry'])).stdout
        }
      } catch (e) {
        // Yarn 2 uses `npmRegistryServer` instead of `registry`
        registry = (await execa(this.bin, ['config', 'get', 'npmRegistryServer'])).stdout
      }
    }
    // cacheKey = scope || ''
    this._registries[cacheKey] = stripAnsi(registry).trim();
    info(`Detected you will use ${this._registries[cacheKey]} registry`);
    return this._registries[cacheKey];
  }

  async getMetadata(packageName, { full = false } = {}) {
    const scope = extractPackageScope(packageName);
    const registry = await this.getRegistry(scope);

    const metadataKey = `${this.bin}-${registry}-${packageName}`;
    // 是否有缓存
    let metadata = metadataCache.get(metadataKey);

    if (metadata) {
      return metadata;
    }

    const headers = {}
    if (!full) {
      headers.Accept = 'application/vnd.npm.install-v1+json;q=1.0, application/json;q=0.9, */*;q=0.8'
    }

    /**
     * 获取作者配置
     * ...暂不处理
     */

    const url = `${registry.replace(/\/$/g, '')}/${packageName}`;
    try {
      // 获取 cli 的信息
      metadata = await request.get(url, { headers });
      metadata = metadata.body ? metadata.body : metadata;
      if (metadata.error) {
        throw new Error(metadata.error)
      }
      // 存入缓存
      metadataCache.set(metadataKey, metadata)
      return metadata;
    } catch (e) {
      error(`Failed to get response from ${url}`)
      throw e
    }

  }

  async getRemoteVersion (packageName, versionRange = 'latest') {
    const metadata = await this.getMetadata(packageName)
    // 查找 dist-tags 字段中是否存在 versionRange
    if (Object.keys(metadata['dist-tags']).includes(versionRange)) {
      return metadata['dist-tags'][versionRange];
    }
    // 获取版本列表
    const versions = Array.isArray(metadata.versions) ? metadata.versions : Object.keys(metadata.versions)
    // 返回列表中满足范围的最高版本
    return semver.maxSatisfying(versions, versionRange);
  }
}

module.exports = PackageManager;