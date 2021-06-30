const { exit } = require('./exit')

// proxy to joi for option validation
exports.createSchema = fn => {
  const joi = require('joi') // 强大的字段规则校验器

  let schema = fn(joi) // 采用 joi.object().key() 的方式能够不断的覆盖叠加键
  if (typeof schema === 'object' && typeof schema.validate !== 'function') {
    schema = joi.object(schema)
  }

  return schema
}

exports.validate = (obj, schema, cb) => {
  const { error } = schema.validate(obj)
  if (error) {
    cb(error.details[0].message)
    exit(1) // 退出
  }
}

exports.validateSync = (obj, schema) => {
  const { error } = schema.validate(obj)
  if (error) {
    throw error
  }
}
