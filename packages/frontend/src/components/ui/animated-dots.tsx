interface AnimatedDotsProps {
  /** Base text to display before the dots (e.g., "Loading") */
  text: string
  /** Additional className for styling */
  className?: string
}

/**
 * AnimatedDots component displays text with animated ellipsis using pure CSS
 * The dots cycle: . -> .. -> ... -> . (1 second each)
 *
 * Example: "Loading." -> "Loading.." -> "Loading..."
 */
export function AnimatedDots({ text, className = '' }: AnimatedDotsProps) {
  return (
    <span className={`loading-text ${className}`}>
      <span>{text}</span>
      <span className="loading-dots" />
    </span>
  )
}

export default AnimatedDots
