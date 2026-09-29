import { FileInfo, S3Object } from '@oceanprotocol/lib'

export interface FormFileData extends FileInfo {
  url?: string
  transactionId?: string
  address?: string
  abi?: string
  headers?: { key: string; value: string }[]
  s3Access?: S3Object
  method?: string
  valid?: boolean
  contentType?: string
  contentLength?: string
  [key: string]: any
}

export function isS3File(file: FileInfo): file is FormFileData {
  return file.type === 's3'
}

export function getS3Access(file: FileInfo): S3Object | undefined {
  return isS3File(file) ? file.s3Access : undefined
}
