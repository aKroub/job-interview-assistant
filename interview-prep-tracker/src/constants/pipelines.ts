import type { PipelineId } from '../types';

/**
 * Pipeline definitions for separating job searches by region.
 *
 * Each pipeline is a self-contained Kanban board with its own set of companies.
 * Companies without a pipeline field default to DEFAULT_PIPELINE (backwards compat).
 */

/** Ordered list of available pipelines. */
export const PIPELINES: PipelineId[] = ['tel-aviv', 'us'];

/** Human-readable labels keyed by pipeline ID. */
export const PIPELINE_LABELS: Record<PipelineId, string> = {
  'tel-aviv': 'Tel Aviv',
  'us':       'US',
};

/** Fallback pipeline for companies created before this feature. */
export const DEFAULT_PIPELINE: PipelineId = 'tel-aviv';
