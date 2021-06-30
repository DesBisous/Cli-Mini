const fs = require('fs-extra')
const os = require('os')
const path = require('path')

const migrateWindowsConfigPath = file => {
  if (process.platform !== 'win32') {
    return
  }
  const appData = process.env.APPDATA
  if (appData) {
    const rcDir = path.join(appData, 'vue')
    const rcFile = path.join(rcDir, file)
    const properRcFile = path.join(os.homedir(), file)
    if (fs.existsSync(rcFile)) {
      try {
        if (fs.existsSync(properRcFile)) {
          fs.removeSync(rcFile)
        } else {
          fs.moveSync(rcFile, properRcFile)
        }
      } catch (e) {}
    }
  }
}


exports.getRcPath = file => {
  migrateWindowsConfigPath(file);
  // os.homedir() 本机 home 目录
  return path.join(os.homedir(), file);
}