import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchListing } from '../../../lib/listingFetch';

export interface ListingExtractRequest {
  url: string;
}

export interface ListingExtractResponse {
  url: string;
  source: 'privateproperty' | 'property24' | 'unknown' | 'failed';
  title: string | null;
  priceText: string | null;
  description: string | null;
  features: string[];
  photos: string[];
  raw?: {
    titleRaw?: string | null;
    descriptionRaw?: string | null;
    priceRaw?: string | null;
  };
  error?: string;
  warnings?: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListingExtractResponse>,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      url: '',
      source: 'unknown',
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      error: 'Method not allowed. Use POST with { "url": "..." }.',
    });
    return;
  }

  const body = (req.body as ListingExtractRequest) ?? {};
  const url = (body.url ?? '').trim();

  if (!url) {
    res.status(400).json({
      url: '',
      source: 'unknown',
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      error: 'url is required.',
    });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({
      url,
      source: 'unknown',
      title: null,
      priceText: null,
      description: null,
      features: [],
      photos: [],
      error: 'url is not a valid URL.',
    });
    return;
  }

  // Honor the existing extraction shape so the wizard chip can render warnings
  // and raw fields without change.
  const snapshot = await fetchListing(url, {
    maxPhotos: 20,
    timeoutMs: 20000,
  });

  res.status(200).json(snapshot as unknown as ListingExtractResponse);
}
