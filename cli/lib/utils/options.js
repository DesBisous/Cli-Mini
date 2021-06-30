const joi = require('joi');
const fs = require('fs-extra');
const cloneDeep = require('lodash.clonedeep');
const { error } = require('./logger');
const { getRcPath } = require('./rcPath');
const { rcName, cliName } = require('../data');
const { createSchema, validate } = require('./validate');

exports.defaults = {
  lastChecked: undefined,
  latestVersion: undefined,

  packageManager: undefined,
  useTaobaoRegistry: undefined,
  useCompanyRegistry: undefined,
}

let cachedOptions = null;
const rcPath = exports.rcPath = getRcPath(rcName);

const schema = createSchema(joi => joi.object().keys({
  latestVersion: joi.string().regex(/^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/),
  lastChecked: joi.date().timestamp(),
  packageManager: joi.string().valid('yarn', 'npm', 'pnpm'),
  useTaobaoRegistry: joi.boolean(),
  useCompanyRegistry: joi.boolean(),
}))

exports.loadOptions = () => {
  if (cachedOptions) {
    return cachedOptions
  }
  if (fs.existsSync(rcPath)) {
    try {
      // 读取版本配置文件
      cachedOptions = JSON.parse(fs.readFileSync(rcPath, 'utf-8'))
    } catch (e) {
      error(
        `Error loading saved preferences: ` +
        `~/${rcName} may be corrupted or have syntax errors. ` +
        `Please fix/delete it and re-run ${cliName} in manual mode.\n` +
        `(${e.message})`
      )
      exit(1)
    }
    validate(cachedOptions, schema, () => {
      error(
        `~/${rcName} may be outdated. ` +
        `Please delete it and re-run ${cliName} in manual mode.`
      )
    })
    return cachedOptions;
  } else {
    return {}
  }
}

exports.saveOptions = toSave => {
  const options = Object.assign(cloneDeep(exports.loadOptions()), toSave);
  // 查询 rc 文件是否存在不在于 exports.defaults 模板中的字段，如果有则删除
  for (const key in options) {
    if (!(key in exports.defaults)) {
      delete options[key];
    }
  }
  cachedOptions = options;
  try {
    // 写入
    fs.writeFileSync(rcPath, JSON.stringify(options, null, 2))
    return true
  } catch (e) {
    error(
      `Error saving preferences: ` +
      `make sure you have write access to ${rcPath}.\n` +
      `(${e.message})`
    )
  }
}