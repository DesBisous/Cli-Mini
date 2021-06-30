const chalk = require('chalk');
const execa = require('execa');
const registries = require('../data/registries');
const inquirer = require('inquirer');
const { request } = require('./request');
const { hasYarn } = require('./env');
const { cliPkgName } = require('../data');
const { loadOptions, saveOptions } = require('./options');

async function ping (registry) {
  await request.get(`${registry}/${cliPkgName}/latest`);
  return registry
}

function removeSlash (url) {
  return url.replace(/\/$/, '')
}

let checked;
let result;

module.exports = async function shouldUseTaobao(command) {
  if (!command) {
    command = hasYarn() ? 'yarn' : 'npm'
  }

  // 如果已检查过了，直接返回结果
  if (checked) return result;
  checked = true;

  // 查询是否存在以前保存的偏好
  const saved = loadOptions().useTaobaoRegistry;
  if (typeof saved === 'boolean') {
    return (result = saved)
  }

  // 保存结果函数
  const save = val => {
    result = val
    // 存储到本地 rc 文件中
    saveOptions({ useTaobaoRegistry: val });
    return val;
  }

  let userCurrent;
  try {
    // 获取 command 也就是 bin 的源 registry
    userCurrent = (await execa(command, ['config', 'get', 'registry'])).stdout
  } catch (registryError) {
    try {
      // Yarn 2 uses `npmRegistryServer` instead of `registry`
      userCurrent = (await execa(command, ['config', 'get', 'npmRegistryServer'])).stdout
    } catch (npmRegistryServerError) {
      return save(false)
    }
  }

  // 获取源字典中的地址
  const defaultRegistry = registries[command];
  if (removeSlash(userCurrent) !== removeSlash(defaultRegistry)) {
    // user has configured custom registry, respect that
    return save(false)
  }

  let faster
  try {
    faster = await Promise.race([
      ping(defaultRegistry),
      ping(registries.taobao)
    ])
  } catch (e) {
    return save(false)
  }


  if (faster !== registries.taobao) {
    // default is already faster
    return save(false)
  }

  // ask and save preference
  const { useTaobaoRegistry } = await inquirer.prompt([
    {
      name: 'useTaobaoRegistry',
      type: 'confirm',
      message: chalk.yellow(
        ` Your connection to the default ${command} registry seems to be slow.\n` +
          `   Use ${chalk.cyan(registries.taobao)} for faster installation?`
      )
    }
  ])
  return save(useTaobaoRegistry)
}
