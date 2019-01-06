'use strict'

const Logger = require('logplease')
Logger.setLogLevel('DEBUG')
module.exports = Logger.create('origin-linking', { color: Logger.Colors.Green })
