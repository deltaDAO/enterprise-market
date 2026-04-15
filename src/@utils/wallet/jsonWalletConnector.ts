import { createConnector } from 'wagmi'
import {
  type Address,
  type Chain,
  type Hex,
  createWalletClient,
  http
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
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}
export type JsonWalletConnectorProperties = {
  loadWallet: (pk: string, chainId?: number) => void
  isWalletLoaded: () => boolean
}

type Properties = JsonWalletConnectorProperties

export function jsonWalletConnector(options: JsonWalletConnectorOptions = {}) {
  const { persistSession = true } = options

  return createConnector<Provider, Properties>((config) => {
    let privateKey: Hex | undefined
    let currentChainId: number | undefined

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

    function buildProvider(chain: Chain) {
      if (!privateKey) throw new Error('Wallet not loaded.')

      const account = privateKeyToAccount(privateKey)
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http()
      })

      return async ({
        method,
        params
      }: {
        method: string
        params?: unknown[]
      }): Promise<unknown> => {
        // Delegate signing/account methods to local wallet
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return [account.address]

          case 'eth_chainId':
            return `0x${chain.id.toString(16)}`

          case 'personal_sign': {
            const [message] = params as [Hex, Address]
            return walletClient.signMessage({
              account,
              message: { raw: message }
            })
          }

          case 'eth_signTypedData_v4': {
            const [, typedDataJson] = params as [Address, string]
            const typedData = JSON.parse(typedDataJson)
            return walletClient.signTypedData({
              account,
              ...typedData
            })
          }

          case 'eth_sendTransaction': {
            const [tx] = params as [Record<string, string | undefined>]
            return walletClient.sendTransaction({
              account,
              chain,
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
            } as unknown as Parameters<typeof walletClient.sendTransaction>[0])
          }

          case 'wallet_switchEthereumChain': {
            const [{ chainId: hexChainId }] = params as [{ chainId: string }]
            const newChainId = Number(hexChainId)
            const newChain = config.chains.find((c) => c.id === newChainId)
            if (!newChain) throw new Error(`Chain ${newChainId} not supported.`)
            currentChainId = newChainId
            persistState()
            config.emitter.emit('change', { chainId: newChainId })
            return null
          }

          default: {
            // Delegate read-only calls to the chain's RPC
            const transport = http()({ chain, retryCount: 0 } as Parameters<
              ReturnType<typeof http>
            >[0])
            return transport.request({
              method,
              params
            } as Parameters<typeof transport.request>[0])
          }
        }
      }
    }

    return {
      get id() {
        return JSON_WALLET_CONNECTOR_ID
      },
      get name() {
        return 'JSON Wallet'
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
      },

      isWalletLoaded(): boolean {
        return !!privateKey
      },

      // --- Standard connector methods ---

      async connect({ chainId, withCapabilities } = {}) {
        if (!privateKey) {
          // Try restoring from session
          if (!restoreState()) {
            throw new Error(
              'Wallet not loaded. Call loadWallet(privateKey) first.'
            )
          }
        }

        const targetChainId = chainId ?? currentChainId ?? config.chains[0].id
        currentChainId = targetChainId

        const account = privateKeyToAccount(privateKey)
        persistState()

        const accounts: readonly Address[] = [account.address]

        config.emitter.emit('connect', {
          accounts,
          chainId: targetChainId
        })

        return {
          accounts: (withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts) as never,
          chainId: targetChainId
        }
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

      async getProvider({ chainId } = {}) {
        const chain = getChain(chainId)
        const request = buildProvider(chain)
        return { request } as Provider
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

        config.emitter.emit('change', { chainId })
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

jsonWalletConnector.type = 'jsonWallet' as const
