import {
  ConfigHelper,
  Config,
  getOceanArtifactsAddressesByChainId
} from '@oceanprotocol/lib'
import {
  getAllowedErc20Map,
  getNodeUriMap,
  getRuntimeConfig
} from '../runtimeConfig'
import { getAddress } from 'ethers'

export interface ConfigEnterprise extends Config {
  tokenAddresses: string[]
  escrowAddress?: string
}

/**
  This function takes a Config object as an input and returns a new sanitized Config object
  The new Config object has the same properties as the input object, but with some values replaced by environment variables if they exist
  Also adds missing contract addresses deployed when running barge locally
  @param {Config} config - The input Config object
  @returns {Config} A new Config object
*/
export function sanitizeDevelopmentConfig(config: Config): Config {
  const runtimeConfig = getRuntimeConfig()
  return {
    nodeUri: config.nodeUri,
    oceanNodeUri: runtimeConfig.NEXT_PUBLIC_PROVIDER_URL || config.oceanNodeUri,
    fixedRateExchangeAddress:
      runtimeConfig.NEXT_PUBLIC_FIXED_RATE_EXCHANGE_ADDRESS,
    dispenserAddress: runtimeConfig.NEXT_PUBLIC_DISPENSER_ADDRESS,
    oceanTokenAddress: config.oceanTokenAddress,
    nftFactoryAddress: runtimeConfig.NEXT_PUBLIC_NFT_FACTORY_ADDRESS,
    routerFactoryAddress: runtimeConfig.NEXT_PUBLIC_ROUTER_FACTORY_ADDRESS,
    accessListFactory:
      config.accessListFactory ||
      runtimeConfig.NEXT_PUBLIC_ACCESS_LIST_FACTORY_ADDRESS
  } as Config
}

/**
 * Helper to validate and checksum a list of addresses.
 * Removes invalid addresses and logs a warning.
 */
function validateAndChecksumAddresses(addresses: string[]): string[] {
  return addresses.reduce((acc: string[], address) => {
    try {
      // ethers.utils.getAddress (v5) or ethers.getAddress (v6) throws if invalid
      // and returns the checksummed address if valid.
      const checksummed = getAddress(address) // ethers v6

      acc.push(checksummed)
    } catch (e) {
      console.warn(
        `[Config] Invalid address found in env: ${address}, skipping.`
      )
    }
    return acc
  }, [])
}

const chainsWarnedWithoutAllowedErc20 = new Set<string>()

// getOceanConfig runs from many effects (e.g. while a wallet sits on an
// unsupported network), so only warn once per chain.
function warnNoAllowedErc20Once(networkKey: string): void {
  if (chainsWarnedWithoutAllowedErc20.has(networkKey)) return
  chainsWarnedWithoutAllowedErc20.add(networkKey)
  console.warn(
    `[getOceanConfig] No valid NEXT_PUBLIC_ALLOWED_ERC20_ADDRESSES entry for network: ${networkKey}. No base token is available on this network.`
  )
}

export function getOceanConfig(
  network: string | number
): ConfigEnterprise | null {
  if (!network) {
    console.warn('[getOceanConfig] No network provided yet.')
    return null
  }

  const rpcMap = getNodeUriMap()
  const erc20Map = getAllowedErc20Map()

  let config = new ConfigHelper().getConfig(network) as any

  if (!config) {
    console.warn(`[getOceanConfig] No config found for network: ${network}`)
    return null
  }

  if (network === 8996) {
    config = { ...config, ...sanitizeDevelopmentConfig(config) }
  }
  // Override nodeUri with value from RPC map if it exists
  const networkKey = network.toString()
  if (rpcMap[networkKey]) config.nodeUri = rpcMap[networkKey]
  const validAddresses = erc20Map[networkKey]
    ? validateAndChecksumAddresses(erc20Map[networkKey])
    : []
  config.tokenAddresses = validAddresses
  // The configured ERC20 allowlist is the source of truth for the chain's
  // base token: oceanTokenAddress resolves to its first valid entry (e.g.
  // devEURAU on OP Sepolia, or OCEAN where OCEAN is the configured token).
  // ocean.js ships OCEAN as a built-in default; a chain without a (valid)
  // allowlist entry must not silently fall back to it, so it gets no base
  // token at all and callers that need one must handle `undefined`.
  config.oceanTokenAddress = validAddresses[0]
  if (validAddresses.length === 0) warnNoAllowedErc20Once(networkKey)
  const enterpriseContracts = getOceanArtifactsAddressesByChainId(
    Number(network)
  )
  // Override config with enterprise contracts if present
  if (enterpriseContracts) {
    config.escrowAddress =
      enterpriseContracts.EnterpriseEscrow || config.escrowAddress
    config.fixedRateExchangeAddress =
      enterpriseContracts.FixedPriceEnterprise ||
      enterpriseContracts.FixedPrice ||
      config.fixedRateExchangeAddress
    config.routerFactoryAddress =
      enterpriseContracts.Router || config.routerFactoryAddress
    config.nftFactoryAddress =
      enterpriseContracts.ERC721Factory || config.nftFactoryAddress
    config.dispenserAddress =
      enterpriseContracts.Dispenser || config.dispenserAddress
    config.accessListFactory =
      enterpriseContracts.AccessListFactory || config.accessListFactory
    config.opfCommunityFeeCollector =
      enterpriseContracts.OPFCommunityFeeCollector ||
      config.opfCommunityFeeCollector
    config.EnterpriseFeeCollector =
      enterpriseContracts.EnterpriseFeeCollector ||
      config.EnterpriseFeeCollector
    config.startBlock = enterpriseContracts.startBlock || config.startBlock
    config.ERC20Template = enterpriseContracts.ERC20Template
    config.ERC721Template = enterpriseContracts.ERC721Template
    config.OPFCommunityFeeCollectorCompute =
      enterpriseContracts.OPFCommunityFeeCollectorCompute
  }
  return config as ConfigEnterprise
}
