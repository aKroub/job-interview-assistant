/**
 * Pipeline definitions for separating job searches by region.
 *
 * Each pipeline is a self-contained Kanban board with its own set of companies.
 * Companies without a pipeline field default to DEFAULT_PIPELINE (backwards compat).
 */

/** @type {string[]} Ordered list of available pipelines. */
export const PIPELINES = ['tel-aviv', 'us'];

/** @type {Record<string, string>} Human-readable labels keyed by pipeline ID. */
export const PIPELINE_LABELS = {
  'tel-aviv': 'Tel Aviv',
  'us':       'US',
};

/** @type {string} Fallback pipeline for companies created before this feature. */
export const DEFAULT_PIPELINE = 'tel-aviv';
