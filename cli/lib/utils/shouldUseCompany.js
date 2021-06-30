const execa = require('execa');
const { hasYarn } = require('./env');
const registries = require('../data/registries');
const { loadOptions, saveOptions } = require('./options');

function removeSlash(url) {
  return url.replace(/\/$/, '');
}

let checked;
let result;

module.exports = async function shouldUseCompany(command) {
  if (!command) {
    command = hasYarn() ? 'yarn' : 'npm';
  }

  // 如果已检查过了，直接返回结果
  if (checked) return result;
  checked = true;

  // 查询是否存在以前保存的偏好
  const saved = loadOptions().useCompanyRegistry;
  if (typeof saved === 'boolean') {
    return (result = saved)
  }

  // 保存结果函数
  const save = val => {
    result = val
    // 存储到本地 rc 文件中
    saveOptions({ useCompanyRegistry: val });
    return val;
  }

  let userCurrent;
  let yarnCurrent;
  let npmRegistry;

  try {
    // 获取 command 也就是 bin 的源 registry
    userCurrent = (await execa(command, ['config', 'get', 'registry'])).stdout;
    hasYarn() && (yarnCurrent = (await execa('yarn', ['config', 'get', 'registry'])).stdout);
    npmRegistry = (await execa('npm', ['config', 'get', 'registry'])).stdout;
  } catch (registryError) {
    try {
      // Yarn 2 uses `npmRegistryServer` instead of `registry`
      userCurrent = (await execa(command, ['config', 'get', 'npmRegistryServer'])).stdout
    } catch (npmRegistryServerError) {
      return save(false)
    }
  }

  console.log(userCurrent);
  console.log(yarnCurrent);
  console.log(npmRegistry);

  const companyRegistry = registries['company'];
  if (
    removeSlash(companyRegistry) === removeSlash(userCurrent) ||
    removeSlash(companyRegistry) === removeSlash(yarnCurrent) ||
    removeSlash(companyRegistry) === removeSlash(npmRegistry)
  ) {
    /**
     * 这里查找用户是否配置了 npm 或者 yarn 的源为 company 的源，如果是直接使用 company 的源，
     * 因为这个 Cli 主要还是为内部服务
     */
    return save(true);
  }
  return save(false);
}