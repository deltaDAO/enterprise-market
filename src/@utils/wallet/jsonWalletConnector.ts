import { createConnector } from 'wagmi'
import {
  type Address,
  type Chain,
  type EIP1193RequestFn,
  type Hex,
  type HttpTransport,
  createWalletClient
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { LoggerInstance } from '@oceanprotocol/lib'

export const JSON_WALLET_CONNECTOR_ID = 'jsonWallet'

const SESSION_STORAGE_KEY = 'jsonWallet:pk'
const SESSION_STORAGE_CHAIN_KEY = 'jsonWallet:chainId'

interface JsonWalletConnectorOptions {
  persistSession?: boolean
}

type Provider = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: EIP1193RequestFn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (...args: any[]) => void) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeListener: (event: string, handler: (...args: any[]) => void) => any
}
export type JsonWalletConnectorProperties = {
  loadWallet: (pk: string, chainId?: number) => void
  isWalletLoaded: () => boolean
  cancelPendingConnect: () => void
}

type Properties = JsonWalletConnectorProperties

/* -------------------------------------------------------
   Module-level callback so the UI can react when the
   connector needs a wallet import / unlock from the user.
------------------------------------------------------- */
let onImportRequest: (() => void) | null = null

export function setImportRequestHandler(handler: (() => void) | null) {
  onImportRequest = handler
}

export function jsonWalletConnector(options: JsonWalletConnectorOptions = {}) {
  const { persistSession = true } = options

  return createConnector<Provider, Properties>((config) => {
    let privateKey: Hex | undefined
    let currentChainId: number | undefined
    let connectResolver: {
      resolve: (result: {
        accounts: readonly Address[]
        chainId: number
      }) => void
      reject: (error: Error) => void
      chainId?: number
    } | null = null

    // Provider-level event listeners (persistent across getProvider calls)
    const providerListeners: Record<
      string,
      Array<(...args: any[]) => void>
    > = {}

    function emitProviderEvent(event: string, ...args: any[]) {
      providerListeners[event]?.forEach((handler) => handler(...args))
    }

    function getChain(chainId?: number): Chain {
      const id = chainId ?? currentChainId ?? config.chains[0].id
      return config.chains.find((c) => c.id === id) ?? config.chains[0]
    }

    function persistState() {
      if (!persistSession || typeof sessionStorage === 'undefined') return
      try {
        if (privateKey) {
          sessionStorage.setItem(SESSION_STORAGE_KEY, privateKey)
        }
        if (currentChainId) {
          sessionStorage.setItem(
            SESSION_STORAGE_CHAIN_KEY,
            String(currentChainId)
          )
        }
      } catch {
        // sessionStorage may be blocked
      }
    }

    function clearPersistedState() {
      if (typeof sessionStorage === 'undefined') return
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
        sessionStorage.removeItem(SESSION_STORAGE_CHAIN_KEY)
      } catch {
        // ignore
      }
    }

    function restoreState(): boolean {
      if (!persistSession || typeof sessionStorage === 'undefined') return false
      try {
        const storedKey = sessionStorage.getItem(
          SESSION_STORAGE_KEY
        ) as Hex | null
        const storedChain = sessionStorage.getItem(SESSION_STORAGE_CHAIN_KEY)
        if (storedKey) {
          privateKey = storedKey
          currentChainId = storedChain
            ? Number(storedChain)
            : config.chains[0].id
          return true
        }
      } catch {
        // ignore
      }
      return false
    }

    function buildProvider(): Provider {
      if (!privateKey) throw new Error('Wallet not loaded.')

      const request: EIP1193RequestFn = async ({ method, params }) => {
        // Resolve the active chain and account on each request so
        // chain switches are reflected immediately without page reload.
        const activeChain = getChain(currentChainId)
        const account = privateKeyToAccount(privateKey!)
        const configuredTransport =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (config as any).transports?.[activeChain.id]
        if (!configuredTransport) {
          throw new Error(
            `No transport configured for chain ${activeChain.id}. ` +
              `Ensure NEXT_PUBLIC_NODE_URI_MAP is set.`
          )
        }

        // Delegate signing/account methods to local wallet
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [account.address] as any

          case 'eth_chainId':
            return `0x${activeChain.id.toString(16)}` as any

          case 'personal_sign': {
            const [message] = params as [Hex, Address]
            const wc = createWalletClient({
              account,
              chain: activeChain,
              transport: configuredTransport
            })
            return wc.signMessage({
              account,
              message: { raw: message }
            }) as any
          }

          case 'eth_signTypedData_v4': {
            const [, typedDataJson] = params as [Address, string]
            const typedData = JSON.parse(typedDataJson)
            const wc = createWalletClient({
              account,
              chain: activeChain,
              transport: configuredTransport
            })
            return wc.signTypedData({
              account,
              ...typedData
            }) as any
          }

          case 'eth_sendTransaction': {
            const [tx] = params as [Record<string, string | undefined>]
            const wc = createWalletClient({
              account,
              chain: activeChain,
              transport: configuredTransport
            })
            return wc.sendTransaction({
              account,
              chain: activeChain,
              to: tx.to as Address | undefined,
              data: tx.data as Hex | undefined,
              value: tx.value ? BigInt(tx.value) : undefined,
              gas: tx.gas ? BigInt(tx.gas) : undefined,
              gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
              maxFeePerGas: tx.maxFeePerGas
                ? BigInt(tx.maxFeePerGas)
                : undefined,
              maxPriorityFeePerGas: tx.maxPriorityFeePerGas
                ? BigInt(tx.maxPriorityFeePerGas)
                : undefined,
              nonce: tx.nonce ? Number(tx.nonce) : undefined
            } as unknown as Parameters<typeof wc.sendTransaction>[0]) as any
          }

          case 'wallet_switchEthereumChain': {
            const [{ chainId: hexChainId }] = params as [{ chainId: string }]
            const newChainId = Number(hexChainId)
            const newChain = config.chains.find((c) => c.id === newChainId)
            if (!newChain) throw new Error(`Chain ${newChainId} not supported.`)
            currentChainId = newChainId
            persistState()
            config.emitter.emit('change', { chainId: newChainId })
            emitProviderEvent('chainChanged', `0x${newChainId.toString(16)}`)
            return null as any
          }

          default: {
            // Delegate read-only calls to the chain's RPC using the
            // wagmi-configured transport (respects custom RPC endpoints).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const t = (config as any).transports?.[activeChain.id]
            if (!t) {
              throw new Error(
                `No transport configured for chain ${activeChain.id}. ` +
                  `Ensure NEXT_PUBLIC_NODE_URI_MAP is set.`
              )
            }
            const transport = t({
              chain: activeChain,
              retryCount: 0
            } as Parameters<HttpTransport>[0])
            return transport.request({
              method,
              params
            } as Parameters<typeof transport.request>[0])
          }
        }
      }

      // Return an EIP-1193 compliant provider object.
      // wagmi's getConnectorClient wraps this with custom() internally.
      return {
        request,
        on(event: string, handler: (...args: any[]) => void) {
          if (!providerListeners[event]) providerListeners[event] = []
          providerListeners[event].push(handler)
          return this
        },
        removeListener(event: string, handler: (...args: any[]) => void) {
          providerListeners[event] = providerListeners[event]?.filter(
            (h) => h !== handler
          )
          return this
        }
      } as Provider
    }

    function performConnect(chainId?: number) {
      const targetChainId =
        (chainId || undefined) ?? currentChainId ?? config.chains[0].id
      currentChainId = targetChainId

      const account = privateKeyToAccount(privateKey!)
      persistState()

      const accounts: readonly Address[] = [account.address]

      config.emitter.emit('connect', {
        accounts,
        chainId: targetChainId
      })

      return { accounts, chainId: targetChainId }
    }

    return {
      get id() {
        return JSON_WALLET_CONNECTOR_ID
      },
      get name() {
        return 'JSON Wallet'
      },
      get icon() {
        return '/images/json-wallet.svg'
      },
      type: jsonWalletConnector.type,

      // --- Custom properties ---

      loadWallet(pk: string, chainId?: number) {
        privateKey = (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex
        currentChainId = chainId ?? config.chains[0].id
        persistState()
        LoggerInstance.log(
          `[jsonWalletConnector] Wallet loaded for ${
            privateKeyToAccount(privateKey).address
          }`
        )

        // If a connect() call is waiting, resolve it now
        if (connectResolver) {
          try {
            const result = performConnect(
              (connectResolver.chainId || undefined) ?? chainId
            )
            connectResolver.resolve(result)
          } catch (err) {
            connectResolver.reject(err as Error)
          }
          connectResolver = null
        } else {
          // No pending connect — emit change to invalidate wagmi's
          // connector client cache so useConnectorClient re-fetches
          const account = privateKeyToAccount(privateKey)
          config.emitter.emit('change', {
            accounts: [account.address],
            chainId: currentChainId
          })
        }
      },

      isWalletLoaded(): boolean {
        return !!privateKey
      },

      cancelPendingConnect() {
        if (connectResolver) {
          connectResolver.reject(new Error('Import cancelled'))
          connectResolver = null
        }
      },

      // --- Standard connector methods ---

      async connect({ chainId } = {}) {
        if (!privateKey) {
          // Try restoring from session
          if (!restoreState()) {
            // No wallet available — ask the UI to show the import modal
            // and return a promise that resolves when loadWallet() is called
            if (connectResolver) {
              connectResolver.reject(new Error('Superseded by new attempt'))
              connectResolver = null
            }

            return new Promise<{
              accounts: readonly Address[]
              chainId: number
            }>((resolve, reject) => {
              connectResolver = { resolve, reject, chainId }
              onImportRequest?.()
            }) as never
          }
        }

        return performConnect(chainId) as never
      },

      async disconnect() {
        LoggerInstance.log('[jsonWalletConnector] Disconnecting wallet.')
        privateKey = undefined
        currentChainId = undefined
        clearPersistedState()
        config.emitter.emit('disconnect')
      },

      async getAccounts() {
        if (!privateKey) return []
        return [privateKeyToAccount(privateKey).address]
      },

      async getChainId() {
        return currentChainId ?? config.chains[0].id
      },

      async getProvider({ chainId: _chainId } = {}) {
        if (!privateKey) {
          // Return a no-op provider when wallet is not yet loaded
          const noopRequest: EIP1193RequestFn = async () => {
            throw new Error('Wallet not loaded')
          }
          return {
            request: noopRequest,
            on() {
              return this
            },
            removeListener() {
              return this
            }
          } as Provider
        }
        return buildProvider()
      },

      async isAuthorized() {
        if (privateKey) return true
        return restoreState()
      },

      async switchChain({ chainId }) {
        const chain = config.chains.find((c) => c.id === chainId)
        if (!chain) throw new Error(`Chain ${chainId} not supported.`)

        currentChainId = chainId
        persistState()

        // Emit on wagmi's emitter so wagmi state updates
        config.emitter.emit('change', {
          chainId,
          accounts: privateKey
            ? [privateKeyToAccount(privateKey).address]
            : undefined
        })

        // Emit on the EIP-1193 provider so hooks listening to the
        // provider's 'chainChanged' event (e.g. useActiveWalletChainId)
        // pick up the change without requiring a page reload.
        emitProviderEvent('chainChanged', `0x${chainId.toString(16)}`)

        LoggerInstance.log(
          `[jsonWalletConnector] Switched to chain ${chain.name} (${chainId})`
        )

        return chain
      },

      onAccountsChanged() {
        // Fixed account — nothing to do
      },

      onChainChanged(chainId) {
        currentChainId = Number(chainId)
        persistState()
      },

      onDisconnect() {
        privateKey = undefined
        currentChainId = undefined
        clearPersistedState()
        config.emitter.emit('disconnect')
      }
    }
  })
}

jsonWalletConnector.type = 'injected' as const
