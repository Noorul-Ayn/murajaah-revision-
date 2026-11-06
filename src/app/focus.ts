import { createContext, useContext, useEffect } from 'react'

/** Lets a screen hide the navigation while it needs full attention (a quiz in progress). */
export const FocusContext = createContext<(on: boolean) => void>(() => undefined)

export function useFocusMode(on: boolean) {
  const set = useContext(FocusContext)
  useEffect(() => {
    set(on)
    return () => set(false)
  }, [on, set])
}
