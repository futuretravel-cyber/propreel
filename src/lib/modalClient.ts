/**
 * Modal Backend API Client
 * Handles communication with Modal-deployed functions
 * 
 * Endpoint: https://futuretravel--propreel-render.modal.run
 */

const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

import { workerHeaders } from './workerAuth';

export interface RenderVideoParams {
  record_id: string;
  tier: string;
  config_index: number;
  orientation: string;
  images: string[];
  voiceover_text: string;
  voice_id: string;
  /** BCP-47 voiceover language (one of South Africa's 11 official languages) */
  language?: string;
  include_agent_branding: boolean;
  music_url?: string;
}

export interface FlashHeadParams {
  profile_image_url: string;
  voiceover_text: string;
  user_id: string;
  voice?: string; // Narakeet native voice id for the selected language
  language?: string; // BCP-47 voiceover language
  stability?: number; // Voice stability 0-1, default 0.5
}

export interface EditImageParams {
  image_url: string;
  preset_id: string;
  custom_prompt?: string;
  strength?: number;
  guidance_scale?: number;
}

export interface RenderVideoResponse {
  record_id: string;
  status: string;
  video_url: string;
  tier: string;
  config_index: number;
  duration: number;
  resolution: string;
  processing_type: string;
  credits_used: number;
  image_count: number;
}

export interface FlashHeadResponse {
  status: string;
  video_url: string;
  duration: number;
  seed: number;
  user_id: string;
  credits_used: number;
  model: string;
  voice: string;
}

export interface EditImageResponse {
  status: string;
  image_url: string;
  preset_id: string;
  strength: number;
  guidance_scale: number;
  credits_used: number;
}

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  model: string;
  clip_duration: number;
  resolutions: string[];
  audio: boolean;
  flashhead: string;
}

export const ModalAPI = {
  /**
   * Generate a property video
   */
  async renderVideo(params: RenderVideoParams): Promise<RenderVideoResponse> {
    try {
      const response = await fetch(`${MODAL_ENDPOINT}/render_video`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await workerHeaders()),
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to render video');
      }

      return await response.json();
    } catch (error) {
      console.error('ModalAPI.renderVideo error:', error);
      throw error;
    }
  },

  /**
   * Generate FlashHead lip-sync video
   */
  async generateFlashHeadVideo(params: FlashHeadParams): Promise<FlashHeadResponse> {
    try {
      const response = await fetch(`${MODAL_ENDPOINT}/generate_flashhead_video`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await workerHeaders()),
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate FlashHead video');
      }

      return await response.json();
    } catch (error) {
      console.error('ModalAPI.generateFlashHeadVideo error:', error);
      throw error;
    }
  },

  /**
   * Edit an image with AI
   */
  async editImage(params: EditImageParams): Promise<EditImageResponse> {
    try {
      const response = await fetch(`${MODAL_ENDPOINT}/edit_image`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await workerHeaders()),
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to edit image');
      }

      return await response.json();
    } catch (error) {
      console.error('ModalAPI.editImage error:', error);
      throw error;
    }
  },

  /**
   * Get all image editing presets (full prompt text — admin session required;
   * served via the Vercel API, which proxies the worker server-side).
   */
  async getImagePresets(): Promise<any[]> {
    try {
      const response = await fetch('/api/users?action=image_presets', { credentials: 'same-origin' });

      if (!response.ok) {
        throw new Error('Failed to get image presets');
      }

      const data = await response.json();
      return Array.isArray(data?.presets) ? data.presets : [];
    } catch (error) {
      console.error('ModalAPI.getImagePresets error:', error);
      throw error;
    }
  },

  /**
   * Check service health
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    try {
      const response = await fetch(`${MODAL_ENDPOINT}/health`);

      if (!response.ok) {
        throw new Error('Service unhealthy');
      }

      return await response.json();
    } catch (error) {
      console.error('ModalAPI.healthCheck error:', error);
      throw error;
    }
  },
};

/**
 * Check if Modal backend is healthy
 */
export async function checkModalHealth(): Promise<boolean> {
  try {
    const health = await ModalAPI.healthCheck();
    return health.status === 'healthy';
  } catch (error) {
    return false;
  }
}

export default ModalAPI;
