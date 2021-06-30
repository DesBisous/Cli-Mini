const getVersions = require('./getVersions')
const { clearConsole } = require('./logger');

exports.generateTitle = async function (checkUpdate) {
  // 即将初始化：包管理器初始化和 Cli 版本检查
  const { current, latest, error } = await getVersions();
  // 检查版本，使用 @hst/utils 来测试一下结果才行了，即使会在 home 生成 .hstrc
  console.log('getVersions:', current, latest, error);

  // return title
};

exports.clearConsole = async function clearConsoleWithTitle (checkUpdate) {
  const title = await exports.generateTitle(checkUpdate);
  // clearConsole(title);
}
