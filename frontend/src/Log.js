import React, { useEffect, useRef } from "react"

/**
 * Types of messages: stdout, stderr, info
 */
const Log = ({ log }) => {
  const domRef = useRef(null)

  useEffect(() => {
    if (log.length > 0 && domRef && domRef.current) {
      domRef.current.scrollTop = domRef.current.scrollHeight
    }
  }, [log.length])

  return (
    <pre className="log" ref={domRef}>
      {log.map(({ type, message }, i) => (
        <span key={i} className={`msg-${type}`}>{message}</span>
      ))}
    </pre>
  )
}

export default Log