import { getNodeId, isObject } from './jwt'
import { CredentialSource, JsonObject, ParsedVc, SOURCE_KEY } from './types'

const MAX_DEPTH = 6

export interface CredentialGraph {
  subjects: Map<string, { subject: JsonObject; vc: ParsedVc }>
}

const EVIDENCE_FIELDS = ['gx:evidenceURL', 'gx:evidenceOf', 'gx:executionDate']
const MAX_EVIDENCE_FIELD_LENGTH = 512

// Only the short, displayed evidence fields: arbitrary evidence payloads would
// otherwise be copied into every resolved reference
function getEvidence(evidence: unknown): JsonObject | undefined {
  if (!isObject(evidence)) return undefined
  const fields = EVIDENCE_FIELDS.filter(
    (field) => typeof evidence[field] === 'string'
  ).map((field) => [
    field,
    (evidence[field] as string).slice(0, MAX_EVIDENCE_FIELD_LENGTH)
  ])
  return fields.length ? Object.fromEntries(fields) : undefined
}

export function getCredentialSource(vc: ParsedVc): CredentialSource {
  return {
    id: vc.id,
    types: vc.types,
    issuer: vc.issuer,
    validFrom: vc.validFrom,
    validUntil: vc.validUntil,
    evidence: getEvidence(vc.payload.evidence)
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

// Constant-size marker for a subject that is already expanded elsewhere: no
// field values, so repeating a reference can't multiply the response size
function repeatedReference(id: string, vc: ParsedVc): JsonObject {
  return {
    id,
    [SOURCE_KEY]: { id: vc.id, types: vc.types.slice(-1), repeated: true }
  }
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
    // Each subject is expanded once; later references (and cycles) become a
    // constant-size marker, which keeps the output linear in the input size
    if (state.expanded.has(id)) return repeatedReference(id, target.vc)
    state.expanded.add(id)
    return {
      ...(resolve(target.subject, graph, state, depth + 1) as JsonObject),
      [SOURCE_KEY]: getCredentialSource(target.vc)
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
