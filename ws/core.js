const { spawn } = require('child_process')
const kill = require('tree-kill');

const runners = {}

function createClient(sender) {
  let detatch

  function attach(name) {
    const sendOut = msg => sender('stdout', msg.toString())
    const sendExit = exitCode => sender('exit', {
      name,
      killed: runners[name].killed,
      exitCode,
    })
    const sendError = msg => sender('stderr', msg.toString())
    const sendCommandError = msg => sender('command_error', msg.toString())

    if (runners[name].stdout) {
      runners[name].stdout.on('data', sendOut)
    }
    if (runners[name].stderr) {
      runners[name].stderr.on('data', sendError)
    }
    runners[name].on('exit', sendExit)
    runners[name].on('error', sendCommandError)

    ensureDetatched()
    detatch = () => {
      if (runners[name].stdout) {
        runners[name].stdout.off('data', sendOut)
      }
      if (runners[name].stderr) {
        runners[name].stderr.off('data', sendError)
      }
      runners[name].off('exit', sendExit)
      runners[name].off('error', sendCommandError)
    }
  }

  function tryAttach(name) {
    const runner = runners[name]
    if (!runner || runner.exitCode !== null || runner.killed) {
      throw new Error(`Command: ${name} is not running.`)
    } else {
      attach(name, sender)
    }
  }

  function ensureDetatched() {
    if (detatch) {
      detatch()
    }
    detatch = undefined
  }

  return {
    tryAttach,
    detatch: ensureDetatched
  }
}

function tryStartRunner(name, command, args, options) {
  const runner = runners[name]
  if (!runner || runner.exitCode !== null || runner.killed) {
    runners[name] = spawn(command, args, options)
  } else {
    throw new Error('Already running.')
  }
}

function killRunner(name) {
  const runner = runners[name]
  if (runner && runner.exitCode === null && !runner.killed) {
    kill(runner.pid, 'SIGKILL', function(err){
      if(!err){
        runner.killed = true
      } else {
        console.error("err killing process", err)
      }
    })
  }
}

function ps() {
  return Object.keys(runners).map(name => ({
    name,
    exitCode: runners[name].exitCode,
    killed: runners[name].killed,
  }))
}

module.exports.createClient = createClient
module.exports.tryStartRunner = tryStartRunner
module.exports.killRunner = killRunner
module.exports.ps = ps
