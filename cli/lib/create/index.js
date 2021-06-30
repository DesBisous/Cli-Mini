const fs = require('fs-extra');
const path = require('path');
const { exit } = require('../utils/exit');
const { warn, error } = require('../utils/logger');
const { stopSpinner } = require('../utils/spinner');
const { clearConsole } = require('../utils/clearConsole');
const validateProjectName = require('validate-npm-package-name')

async function create(projectName, options) {
  const cwd = options.cwd || process.cwd(); // 当前命令执行所在目录
  const inCurrent = projectName === '.';
  const name = inCurrent ? path.relative('../', cwd) : projectName;
  const targetDir = path.resolve(cwd, projectName || '.'); // 拼接当前命令所在目录下的 projectName

  // 校验名称是否合法
  const result = validateProjectName(name);
  if (!result.validForNewPackages) {
    error(`Invalid project name: "${name}"`);
    result.errors && result.errors.forEach(err => {
      console.log('');
      error(err);
    });
    result.warnings && result.warnings.forEach(_warn => {
      console.log('');
      warn(_warn);
    });
    exit(1);
  }

  if (fs.existsSync(targetDir) && !options.merge) {
    if (options.force) {
      await fs.removeSync(targetDir);
    } else {
      await clearConsole();
    }
  }

  fs.mkdirSync(targetDir);

}

module.exports = (...args) => {
  return create(...args).catch(err => {
    stopSpinner(false);
    error(err);
    exit(1);
  })
}