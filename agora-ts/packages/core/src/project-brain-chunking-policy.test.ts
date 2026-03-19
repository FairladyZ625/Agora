import { describe, expect, it } from 'vitest';
import type { ProjectBrainDocument } from './project-brain-query-port.js';
import { ProjectBrainChunkingPolicy } from './project-brain-chunking-policy.js';

function makeDocument(content: string): ProjectBrainDocument {
  return {
    project_id: 'proj-chunk',
    kind: 'decision',
    slug: 'hybrid-retrieval',
    title: 'Hybrid Retrieval Decision',
    path: '/brain/knowledge/decision/hybrid-retrieval.md',
    content,
    created_at: '2026-03-19T00:00:00.000Z',
    updated_at: '2026-03-19T12:00:00.000Z',
    source_task_ids: ['OC-200'],
  };
}

describe('project brain chunking policy', () => {
  it('splits markdown by heading, emits deterministic chunk ids, and weights search text', () => {
    const content = `---
doc_type: project_brain_knowledge
project_id: proj-chunk
kind: decision
slug: hybrid-retrieval
title: "Hybrid Retrieval Decision"
---

# Hybrid Retrieval Decision

Project brain retrieval should combine vector recall with lexical rerank.

## Context

The current search is raw string matching over title, content, and path.

## Decision

Use Qdrant as the first vector adapter while keeping core provider-neutral.
`;

    const policy = new ProjectBrainChunkingPolicy();
    const chunks = policy.chunkDocument(makeDocument(content));

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.heading_path)).toEqual([
      ['Hybrid Retrieval Decision'],
      ['Hybrid Retrieval Decision', 'Context'],
      ['Hybrid Retrieval Decision', 'Decision'],
    ]);

    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunk_id).toBe(`proj-chunk:decision:hybrid-retrieval:${index}`);
      expect(chunk.project_id).toBe('proj-chunk');
      expect(chunk.document_kind).toBe('decision');
      expect(chunk.document_slug).toBe('hybrid-retrieval');
      expect(chunk.source_path).toBe('/brain/knowledge/decision/hybrid-retrieval.md');
      expect(chunk.ordinal).toBe(index);
      expect(chunk.updated_at).toBe('2026-03-19T12:00:00.000Z');
    }

    expect(chunks[0]?.search_text).toContain('Hybrid Retrieval Decision Hybrid Retrieval Decision');
    expect(chunks[0]?.search_text).toContain('/brain/knowledge/decision/hybrid-retrieval.md');
    expect(chunks[2]?.search_text).toContain('Decision Decision');
    expect(chunks[2]?.text).toContain('Use Qdrant as the first vector adapter');
  });
});
