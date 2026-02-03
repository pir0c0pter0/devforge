'use client'

import { useEffect, useState } from 'react'

interface AnimatedDotsProps {
  /** Base text to display before the dots (e.g., "Loading") */
  text: string
  /** Animation interval in milliseconds (default: 400ms) */
  interval?: number
  /** Maximum number of dots (default: 3) */
  maxDots?: number
  /** Additional className for styling */
  className?: string
}

/**
 * AnimatedDots component displays text with animated ellipsis
 * The dots cycle from 1 to maxDots, creating a loading animation effect
 * Uses fixed-width span to prevent text from shifting during animation
 *
 * Example: "Loading" -> "Loading." -> "Loading.." -> "Loading..." -> "Loading."
 */
export function AnimatedDots({
  text,
  interval = 400,
  maxDots = 3,
  className = ''
}: AnimatedDotsProps) {
  const [dotCount, setDotCount] = useState(1)

  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount((prev) => (prev >= maxDots ? 1 : prev + 1))
    }, interval)

    return () => clearInterval(timer)
  }, [interval, maxDots])

  // Create dots string with invisible placeholder dots to maintain width
  const visibleDots = '.'.repeat(dotCount)
  const invisibleDots = '.'.repeat(maxDots - dotCount)

  return (
    <span className={className}>
      {text}
      <span className="inline-block" style={{ minWidth: `${maxDots}ch` }}>
        {visibleDots}
        <span className="invisible">{invisibleDots}</span>
      </span>
    </span>
  )
}

export default AnimatedDots
