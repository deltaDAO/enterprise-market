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

// Upper bound of nodes visited per resolution, whatever the input looks like
export const MAX_RESOLVED_NODES = 500

interface ResolveState {
  budget: number
  expanded: Set<string>
}

// Scalar fields only, used for repeated references (no further expansion)
function shallow(subject: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(subject).filter(
      ([, child]) => !isObject(child) && !Array.isArray(child)
    )
  )
}

function resolve(
  value: unknown,
  graph: CredentialGraph,
  state: ResolveState,
  depth: number
): unknown {
  if (state.budget <= 0 || depth > MAX_DEPTH) return value
  state.budget -= 1

  if (Array.isArray(value)) {
    return value.map((item) => resolve(item, graph, state, depth))
  }
  if (!isObject(value)) return value

  const id = getNodeId(value)
  if (id && isReference(value)) {
    const target = graph.subjects.get(id)
    if (!target) return value
    const source = { [SOURCE_KEY]: getCredentialSource(target.vc) }
    // Each subject is expanded once; later references (and cycles) only get
    // its scalar fields, which keeps the output linear in the input size
    if (state.expanded.has(id)) {
      return { ...shallow(target.subject), ...source }
    }
    state.expanded.add(id)
    return {
      ...(resolve(target.subject, graph, state, depth + 1) as JsonObject),
      ...source
    }
  }

  if (id) state.expanded.add(id)
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      resolve(child, graph, state, depth + 1)
    ])
  )
}

/**
 * Replaces `{ "@id": … }` references with the credentialSubject they point
 * to, so the UI can show values instead of URIs. Resolved nodes carry the
 * metadata of their source VC under SOURCE_KEY (issuer, evidence, validity).
 * References that are not part of the presentation (e.g. plain URLs) are kept.
 * The work is bounded by MAX_RESOLVED_NODES and MAX_DEPTH.
 */
export function resolveReferences(
  value: unknown,
  graph: CredentialGraph
): unknown {
  return resolve(
    value,
    graph,
    { budget: MAX_RESOLVED_NODES, expanded: new Set() },
    0
  )
}
