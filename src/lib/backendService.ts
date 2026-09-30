/**
 * Backend Service - Real Data Integration
 * 
 * This service handles all backend operations with Supabase
 * Replaces mock data with real database operations
 */

import { supabase } from '../lib/supabase';
import { FIFOCreditManager, calculateExpirationDate, CreditExpiry } from './creditService';

// ═══════════════════════════════════════════════════════════════════════════════
// USER SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const UserService = {
  /**
   * Get current user with full profile
   */
  async getCurrentUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;

    const { data: profile, error } = await supabase
      .from('users')
      .select(`
        *,
        agency:agencies(*)
      `)
      .eq('id', authUser.id)
      .single();

    if (error) throw error;
    return profile;
  },

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: any) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get user's subscription
   */
  async getSubscription(userId: string) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CREDIT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const CreditService = {
  /**
   * Get user's credit balance with expiry info
   */
  async getBalance(userId: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('credits, credit_expiries')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const creditExpiries = user.credit_expiries || [];
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringIn7Days = creditExpiries
      .filter((e: any) => new Date(e.expiresAt) <= in7Days && new Date(e.expiresAt) > now)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    const expiringIn30Days = creditExpiries
      .filter((e: any) => new Date(e.expiresAt) <= in30Days && new Date(e.expiresAt) > now)
      .reduce((sum: number, e: any) => sum + e.amount, 0);

    return {
      personal: user.credits,
      expiringIn7Days,
      expiringIn30Days,
      total: user.credits
    };
  },

  /**
   * Deduct credits using FIFO
   */
  async deductCredits(userId: string, amount: number, reason: string, metadata?: any) {
    return await FIFOCreditManager.deductCreditsFIFO(userId, amount, reason, metadata);
  },

  /**
   * Add credits with expiration
   */
  async addCredits(
    userId: string,
    amount: number,
    source: 'purchase' | 'bonus' | 'gift' | 'subscription' | 'refund',
    description: string,
    metadata?: any
  ) {
    const expiresAt = calculateExpirationDate(source);
    return await FIFOCreditManager.addCreditsWithExpiry(
      userId,
      amount,
      source,
      description,
      expiresAt,
      metadata
    );
  },

  /**
   * Get credit transactions
   */
  async getTransactions(userId: string, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  /**
   * Process expired credits (should run daily)
   */
  async processExpiredCredits() {
    return await FIFOCreditManager.processExpiredCredits();
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const ProjectService = {
  /**
   * Get user's projects
   */
  async getProjects(userId: string, limit = 20, offset = 0) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  },

  /**
   * Get project by ID
   */
  async getProject(projectId: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Create new project
   */
  async createProject(userId: string, projectData: any) {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        ...projectData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update project
   */
  async updateProject(projectId: string, updates: any) {
    const { data, error } = await supabase
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete project
   */
  async deleteProject(projectId: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
  },

  /**
   * Get project statistics
   */
  async getStats(userId: string) {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('status, video_tier, created_at')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = {
      total: projects.length,
      ready: projects.filter(p => p.status === 'READY').length,
      processing: projects.filter(p => p.status === 'PROCESSING').length,
      failed: projects.filter(p => p.status === 'FAILED').length,
      draft: projects.filter(p => p.status === 'DRAFT').length,
      byTier: {
        ESSENTIAL: projects.filter(p => p.video_tier === 'ESSENTIAL').length,
        SOCIAL: projects.filter(p => p.video_tier === 'SOCIAL').length,
        CINEMATIC: projects.filter(p => p.video_tier === 'CINEMATIC').length,
        PREMIUM: projects.filter(p => p.video_tier === 'PREMIUM').length
      }
    };

    return stats;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENCY SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const AgencyService = {
  /**
   * Get agency details
   */
  async getAgency(agencyId: string) {
    const { data, error } = await supabase
      .from('agencies')
      .select(`
        *,
        members:users(*)
      `)
      .eq('id', agencyId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get agency members
   */
  async getMembers(agencyId: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('agency_id', agencyId);

    if (error) throw error;
    return data;
  },

  /**
   * Invite member to agency
   */
  async inviteMember(agencyId: string, email: string, role: string, creditLimit: number) {
    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('agency_invitations')
      .insert({
        agency_id: agencyId,
        email,
        role,
        credit_limit: creditLimit,
        status: 'PENDING',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (inviteError) throw inviteError;

    // TODO: Send invitation email
    return invitation;
  },

  /**
   * Update member credit limit
   */
  async updateMemberLimit(userId: string, newLimit: number) {
    const { data, error } = await supabase
      .from('users')
      .update({ credit_limit: newLimit })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Remove member from agency
   */
  async removeMember(userId: string) {
    const { error } = await supabase
      .from('users')
      .update({ agency_id: null })
      .eq('id', userId);

    if (error) throw error;
  },

  /**
   * Get agency analytics
   */
  async getAnalytics(agencyId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all agency members
    const { data: members } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('agency_id', agencyId);

    if (!members) return null;

    // Get transactions for all members
    const memberIds = members.map(m => m.id);
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('*')
      .in('user_id', memberIds)
      .gte('created_at', since.toISOString());

    // Get projects for all members
    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .in('user_id', memberIds)
      .gte('created_at', since.toISOString());

    // Calculate analytics
    const analytics = {
      totalCreditsUsed: transactions?.reduce((sum, t) => sum + Math.abs(t.amount), 0) || 0,
      totalRenders: projects?.length || 0,
      byMember: members.map(member => {
        const memberTransactions = transactions?.filter(t => t.user_id === member.id) || [];
        const memberProjects = projects?.filter(p => p.user_id === member.id) || [];

        return {
          userId: member.id,
          name: member.full_name,
          email: member.email,
          creditsUsed: memberTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
          renders: memberProjects.length
        };
      })
    };

    return analytics;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const PaymentService = {
  /**
   * Initialize Paystack payment
   */
  async initializePayment(email: string, amount: number, metadata?: any) {
    // This would call your backend API which then calls Paystack
    const response = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount, metadata })
    });

    if (!response.ok) throw new Error('Failed to initialize payment');
    return await response.json();
  },

  /**
   * Verify Paystack payment
   */
  async verifyPayment(reference: string) {
    const response = await fetch(`/api/paystack/verify/${reference}`);
    if (!response.ok) throw new Error('Failed to verify payment');
    return await response.json();
  },

  /**
   * Handle successful payment
   */
  async handleSuccessfulPayment(reference: string, userId: string, credits: number) {
    // Add credits to user account
    await CreditService.addCredits(
      userId,
      credits,
      'purchase',
      `Credit purchase via Paystack (Ref: ${reference})`
    );

    // Record payment
    const { error } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        reference,
        amount: credits,
        status: 'SUCCESS',
        created_at: new Date().toISOString()
      });

    if (error) throw error;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const RenderService = {
  /**
   * Start video render
   */
  async startRender(projectId: string, userId: string, tier: string, configIndex: number) {
    // Deduct credits first
    const tierCredits = {
      ESSENTIAL: [5, 10],
      SOCIAL: [30, 50, 80],
      CINEMATIC: [40, 70, 90],
      PREMIUM: [60, 100, 150]
    };

    const credits = tierCredits[tier as keyof typeof tierCredits]?.[configIndex] || 0;

    const deduction = await CreditService.deductCredits(
      userId,
      credits,
      `Video render - ${tier} tier`,
      { projectId, tier, configIndex }
    );

    if (!deduction.success) {
      throw new Error('Insufficient credits');
    }

    // Update project status
    await ProjectService.updateProject(projectId, {
      status: 'PROCESSING',
      credits_spent: credits
    });

    // Call Modal backend to start render
    const response = await fetch('/api/render/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, tier, configIndex })
    });

    if (!response.ok) {
      // Refund credits on failure
      await CreditService.addCredits(userId, credits, 'refund', 'Render failed - refund');
      throw new Error('Failed to start render');
    }

    const { jobId } = await response.json();

    // Update project with job ID
    await ProjectService.updateProject(projectId, {
      render_job_id: jobId
    });

    return { jobId, credits };
  },

  /**
   * Check render status
   */
  async checkRenderStatus(jobId: string) {
    const response = await fetch(`/api/render/status/${jobId}`);
    if (!response.ok) throw new Error('Failed to check render status');
    return await response.json();
  },

  /**
   * Start FlashHead render
   */
  async startFlashHeadRender(
    projectId: string,
    userId: string,
    profileImageUrl: string,
    voiceoverScript: string
  ) {
    // Deduct 8 credits for FlashHead
    const deduction = await CreditService.deductCredits(
      userId,
      8,
      'FlashHead lip-sync video',
      { projectId }
    );

    if (!deduction.success) {
      throw new Error('Insufficient credits');
    }

    // Call Modal backend
    const response = await fetch('/api/render/flashhead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        profileImageUrl,
        voiceoverScript
      })
    });

    if (!response.ok) {
      // Refund credits on failure
      await CreditService.addCredits(userId, 8, 'refund', 'FlashHead render failed - refund');
      throw new Error('Failed to start FlashHead render');
    }

    const { jobId, videoUrl } = await response.json();

    // Update project
    await ProjectService.updateProject(projectId, {
      flashhead_job_id: jobId,
      flashhead_video_url: videoUrl
    });

    return { jobId, videoUrl };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const ImageService = {
  /**
   * Edit image with AI
   */
  async editImage(
    userId: string,
    imageUrl: string,
    presetId: string,
    customPrompt?: string
  ) {
    // Deduct 2 credits
    const deduction = await CreditService.deductCredits(
      userId,
      2,
      `Image edit - ${presetId}`,
      { imageUrl, presetId }
    );

    if (!deduction.success) {
      throw new Error('Insufficient credits');
    }

    // Call Modal backend
    const response = await fetch('/api/image/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        presetId,
        customPrompt
      })
    });

    if (!response.ok) {
      // Refund credits on failure
      await CreditService.addCredits(userId, 2, 'refund', 'Image edit failed - refund');
      throw new Error('Failed to edit image');
    }

    const { editedImageUrl } = await response.json();
    return editedImageUrl;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export const SchedulerService = {
  /**
   * Initialize scheduled tasks
   * Call this on app startup
   */
  initialize() {
    // Process expired credits daily
    setInterval(async () => {
      await CreditService.processExpiredCredits();
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    // Check render statuses every 30 seconds
    setInterval(async () => {
      await this.checkPendingRenders();
    }, 30 * 1000); // Every 30 seconds

    console.log('Scheduler initialized');
  },

  /**
   * Check pending renders and update status
   */
  async checkPendingRenders() {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, render_job_id, status')
      .eq('status', 'PROCESSING');

    if (!projects) return;

    for (const project of projects) {
      if (!project.render_job_id) continue;

      try {
        const status = await RenderService.checkRenderStatus(project.render_job_id);

        if (status.status === 'completed') {
          await ProjectService.updateProject(project.id, {
            status: 'READY',
            video_url: status.videoUrl,
            completed_at: new Date().toISOString()
          });
        } else if (status.status === 'failed') {
          await ProjectService.updateProject(project.id, {
            status: 'FAILED',
            error_message: status.error
          });
        }
      } catch (error) {
        console.error(`Error checking render status for project ${project.id}:`, error);
      }
    }
  }
};
