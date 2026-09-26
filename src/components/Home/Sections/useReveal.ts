import { RefObject, useEffect, useRef, useState } from 'react'

// 'idle' until the observer reports, so server render and no-JS show content
export type RevealState = 'idle' | 'out' | 'in'

export function useReveal<T extends HTMLElement>(
  threshold = 0.2
): [RefObject<T>, RevealState] {
  const ref = useRef<T>(null)
  const [state, setState] = useState<RevealState>('idle')

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('in')
          observer.disconnect()
        } else {
          setState((current) => (current === 'idle' ? 'out' : current))
        }
      },
      { threshold }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, state]
}
