import { getNodeId, isObject } from './jwt'
import { CredentialSource, JsonObject, ParsedVc, SOURCE_KEY } from './types'

const MAX_DEPTH = 6

export interface CredentialGraph {
  subjects: Map<string, { subject: JsonObject; vc: ParsedVc }>
}

export function getCredentialSource(vc: ParsedVc): CredentialSource {
  return {
    id: vc.id,
    types: vc.types,
    issuer: vc.issuer,
    validFrom: vc.validFrom,
    validUntil: vc.validUntil,
    evidence: vc.payload.evidence
  }
}

export function buildGraph(credentials: ParsedVc[]): CredentialGraph {
  const subjects = new Map<string, { subject: JsonObject; vc: ParsedVc }>()
  credentials.forEach((vc) => {
    if (vc.subjectId) subjects.set(vc.subjectId, { subject: vc.subject, vc })
  })
  return { subjects }
}

export function findCredentialByType(
  credentials: ParsedVc[],
  type: string
): ParsedVc | undefined {
  return credentials.find(
    (vc) => vc.types.includes(type) || vc.subject.type === type
  )
}

// A node that only points to another node, e.g. { "@id": "…#cs" }
function isReference(node: JsonObject): boolean {
  const keys = Object.keys(node).filter((key) => key !== 'type')
  return keys.length === 1 && (keys[0] === '@id' || keys[0] === 'id')
}

/**
 * Replaces `{ "@id": … }` references with the credentialSubject they point
 * to, so the UI can show values instead of URIs. Resolved nodes carry the
 * metadata of their source VC under SOURCE_KEY (issuer, evidence, validity).
 * References that are not part of the presentation (e.g. plain URLs) are kept.
 */
export function resolveReferences(
  value: unknown,
  graph: CredentialGraph,
  path: string[] = [],
  depth = 0
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveReferences(item, graph, path, depth))
  }
  if (!isObject(value) || depth > MAX_DEPTH) return value

  const id = getNodeId(value)
  if (id && isReference(value)) {
    const target = graph.subjects.get(id)
    if (!target || path.includes(id)) return value
    return {
      ...(resolveReferences(
        target.subject,
        graph,
        [...path, id],
        depth + 1
      ) as JsonObject),
      [SOURCE_KEY]: getCredentialSource(target.vc)
    }
  }

  const nextPath = id ? [...path, id] : path
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolveReferences(child, graph, nextPath, depth + 1)
    ])
  )
}
