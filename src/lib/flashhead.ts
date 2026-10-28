/**
 * FlashHead API Integration
 * Generates lip-synced videos using fal-ai/flashhead
 */

export interface FlashHeadRequest {
  profile_image_url: string;
  text: string;
  voice_id?: string;
  user_id: string;
}

export interface FlashHeadResponse {
  video_url: string;
  duration: number;
  status: 'processing' | 'completed' | 'failed';
}

/**
 * Generate a lip-synced video using FlashHead
 * This would be called from the Modal backend
 */
export async function generateFlashHeadVideo(request: FlashHeadRequest): Promise<FlashHeadResponse> {
  // In production, this would call the Modal backend endpoint
  // which would then call fal-ai/flashhead
  
  const response = await fetch('/api/render/avatar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Failed to generate avatar video');
  }

  return response.json();
}

/**
 * Check the status of a FlashHead video generation
 */
export async function checkFlashHeadStatus(jobId: string): Promise<FlashHeadResponse> {
  const response = await fetch(`/api/render/avatar/status/${jobId}`);
  
  if (!response.ok) {
    throw new Error('Failed to check avatar video status');
  }

  return response.json();
}
