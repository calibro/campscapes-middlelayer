#!/usr/bin/env node
const http = require('http')
const fs = require('fs')
const websocket = require('ws')
const yaml = require('js-yaml')
const { tryStartRunner, createClient, killRunner, ps } = require('./core')

if (process.argv.length < 3) {
  console.error('A configuration file is required.')
  process.exit(1)
}

const CONF = yaml.safeLoad(fs.readFileSync(process.argv[2], 'utf8'))
const PORT = CONF.port || 3000

const server = http.createServer()
const wss = new websocket.Server({
  server: server,
  binary: false,
})

function parseCommand(actionArgs) {
  if (actionArgs.length === 0) {
    throw new Error('Please specify a script to start.')
  }
  const [command, ...args] = actionArgs

  if (typeof CONF.scripts[command] !== 'object') {
    throw new Error(`Unknown command: ${command}.`)
  }

  return [command, ...args]
}

wss.on('connection', function incoming(ws) {

  function send(type, message) {
    ws.send(JSON.stringify({
      type,
      message,
    }))
  }

  const { detatch, tryAttach } = createClient(send)

  ws.on('error', () => {
    detatch()
    console.log('WS error')
  })

  ws.on('close', () => {
    detatch()
    console.log('WS close')
  })

  ws.on('message', (data) => {
    const [action, ...actionArgs] = data.split(' ')

    try {
      if (action === 'start') {
        const [command, ...args] = parseCommand(actionArgs)
        const commandDescr = CONF.scripts[command]
        tryStartRunner(command, commandDescr.command, args, commandDescr.options)
        tryAttach(command)
      } else if (action === 'd') {
        detatch()
      } else if (action === 'kill') {
        const [command] = parseCommand(actionArgs)
        killRunner(command)
      } else if (action === 'attach') {
        const [command] = parseCommand(actionArgs)
        tryAttach(command)
      } else if (action === 'ps') {
        send('ps', ps())
      }
    } catch (e) {
      send('error', e.message)
    }
  })
})

server.listen(PORT)

console.log(`
  @@@ INMAGIK  websocketscreen on port ${PORT} @@@
`)
