import React, { useMemo, useEffect, useReducer } from 'react'
import { WSURL, COMMAND_NAME } from "./constants"
import useRawWs from "@inmagik/websocket-hooks/useRawWs"
import "./index.scss"
import Log from "./Log"

const App = () => {
  const [state, dispatch] = useReducer((state, action) => {
    if (action.type === "__open") {
      return {
        ...state,
        open: true
      }
    }
    else if (action.type === "__close") {
      return {
        ...state,
        open: false,
        loaded: false,
      }
    }
    else if (action.type === "__reset") {
      return {
        ...state,
        log: [],
        error: []
      }
    }
    else if (action.type === "ps") {
      return {
        ...state,
        ps: action.message,
        loaded: true,
      }
    }
    else if (action.type === "stdout" || action.type === "stderr" || action.type === "info") {
      return {
        ...state,
        log: [
          ...state.log,
          action
        ]
      }
    }
    else if (action.type === "error" || action.type === "command_error") {
      return {
        ...state,
        log: [
          ...state.log,
          { type: action.type, message: action.message.endsWith("\n") ? action.message : `${action.message}\n` }
        ]
      }
    }
    else if (action.type === "exit") {
      return {
        ...state,
        ps: state.ps.map(proc => {
          if (proc.name !== action.message.name) {
            return proc
          } else {
            return action.message
          }
        }),
        log: [
          ...state.log,
          { type: "info", message: action.message.killed ? `Process killed\n` : `Process exited with code ${action.message.exitCode}\n` }
        ]
      }
    }
  }, { open: false, loaded: false, log: [], errors: [], ps: [] })

  const handlers = useMemo(() => ({
    open: event => { dispatch({ type: "__open" }) },
    message: event => { dispatch(JSON.parse(event.data)) },
    close: event => { dispatch({ type: "__close" }) },
  }), [])


  const [wsSend] = useRawWs(WSURL, handlers)

  const isRunning = (() => {
    const recordInPsTable = state.ps.find(proc => proc.name === COMMAND_NAME)
    if (recordInPsTable) {
      return recordInPsTable.exitCode === null && recordInPsTable.killed === false
    } else {
      return false
    }
  })()

  useEffect(() => {
    if (state.open) {
      wsSend(`ps`)
    }
  }, [state.open, wsSend])

  useEffect(() => {
    if (state.loaded && isRunning) {
      dispatch({ type: "info", message: "Attaching to running instance\n" })
      wsSend(`attach ${COMMAND_NAME}`)
    }
  }, [isRunning, state.loaded, wsSend])

  return (
    <div className="d-flex flex-column align-items-stretch justify-content-between w-100 h-100 p-2">
      <h1 className="text-center">Campscapes Scraper</h1>
      <div className="flex-1 d-flex flex-column align-items-center justify-content-center">
        <Log log={state.log} />
        <div className="d-flex flex-row justify-content-center">
          <button
            type="button"
            className="p-2 btn btn-primary mx-3"
            onClick={() => {
              dispatch({ type: "__reset" })
              wsSend(`start ${COMMAND_NAME}`)
              wsSend('ps')
            }}
            disabled={!state.loaded || isRunning}
          >Run</button>
          <button
            type="button"
            className="p-2 btn btn-danger mx-3"
            onClick={() => {
              wsSend(`detatch`)
              wsSend(`kill ${COMMAND_NAME}`)
              wsSend('ps')
            }}
            disabled={!state.loaded || !isRunning}
          >Stop</button>
        </div>
      </div>
    </div>
  )
}

export default App