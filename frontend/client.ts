import { createClient } from '@sanity/client';

export const client = createClient({
  projectId: '6y9ive6v',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2025-11-29',
});
