import { ReactNode } from 'react'
import { useSessionPersistence } from '@hooks/useSessionPersistence'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  useSessionPersistence()
  return <>{children}</>
}
