export const CONSUMER_PARAMETERS_COMPATIBLE_TYPES = [
  'url',
  'smartcontract'
] as const

export type CompatibleFileType =
  (typeof CONSUMER_PARAMETERS_COMPATIBLE_TYPES)[number]

export function isFileTypeCompatibleWithConsumerParameters(
  fileType: string
): boolean {
  return CONSUMER_PARAMETERS_COMPATIBLE_TYPES.includes(
    fileType as CompatibleFileType
  )
}
