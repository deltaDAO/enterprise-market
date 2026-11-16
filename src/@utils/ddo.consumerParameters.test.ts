import { getServiceConsumerParameters } from './ddo'

const words = { name: 'words', type: 'text', label: 'Words', default: '' }
const pages = { name: 'pages', type: 'text', label: 'Pages', default: '1-10' }

function asset(type: string, algorithmParams?: (typeof words)[]) {
  return {
    credentialSubject: {
      metadata: {
        type,
        algorithm: algorithmParams
          ? {
              container: { entrypoint: '', image: '', tag: '', checksum: '' },
              consumerParameters: algorithmParams
            }
          : undefined
      }
    }
  } as unknown as Parameters<typeof getServiceConsumerParameters>[0]
}

describe('getServiceConsumerParameters', () => {
  it('returns metadata.algorithm parameters when the service has none', () => {
    expect(
      getServiceConsumerParameters(asset('algorithm', [words, pages]), {
        consumerParameters: null
      })
    ).toEqual([words, pages])
  })

  it('keeps service parameters and drops metadata duplicates by name', () => {
    const serviceWords = { ...words, label: 'Service words' }
    expect(
      getServiceConsumerParameters(asset('algorithm', [words, pages]), {
        consumerParameters: [serviceWords]
      })
    ).toEqual([serviceWords, pages])
  })

  it('ignores algorithm metadata on non-algorithm assets', () => {
    expect(
      getServiceConsumerParameters(asset('dataset', [words]), {
        consumerParameters: undefined
      })
    ).toEqual([])
  })

  it('handles missing asset and service', () => {
    expect(getServiceConsumerParameters(undefined, undefined)).toEqual([])
  })
})
