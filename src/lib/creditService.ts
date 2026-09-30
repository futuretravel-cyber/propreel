/**
 * Credit Service - FIFO (First In, First Out) Credit Expiration
 * 
 * This service manages credit expiration using FIFO principle:
 * - Credits are used in the order they were received (oldest first)
 * - When credits expire, the oldest credits are removed first
 * - Prevents credit hoarding and encourages active usage
 */

import { supabase } from '../lib/supabase';

// Define CreditExpiry interface locally to avoid circular dependency
export interface CreditExpiry {
  amount: number;
  expiresAt: string;
  source: 'subscription' | 'purchase' | 'gift' | 'bonus' | 'refund';
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'bonus' | 'gift' | 'refund' | 'subscription' | 'deduction';
  description: string;
  metadata?: any;
  created_at: string;
}

/**
 * FIFO Credit Manager
 * Handles credit expiration and usage in FIFO order
 */
export class FIFOCreditManager {
  /**
   * Deduct credits using FIFO principle
   * Uses oldest credits first
   */
  static async deductCreditsFIFO(
    userId: string, 
    amount: number, 
    reason: string,
    metadata?: any
  ): Promise<{ success: boolean; remainingCredits: number; expiredCredits: number }> {
    try {
      // Get user's current credits and expiry records
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('credits, credit_expiries')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      if (!user) throw new Error('User not found');

      const currentCredits = user.credits;
      const creditExpiries: CreditExpiry[] = user.credit_expiries || [];

      // Check if user has enough credits
      if (currentCredits < amount) {
        return {
          success: false,
          remainingCredits: currentCredits,
          expiredCredits: 0
        };
      }

      // Sort expiries by date (oldest first) for FIFO
      const sortedExpiries = [...creditExpiries].sort((a, b) => 
        new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
      );

      // Deduct credits from oldest to newest
      let remainingToDeduct = amount;
      const updatedExpiries: CreditExpiry[] = [];

      for (const expiry of sortedExpiries) {
        if (remainingToDeduct <= 0) {
          // All credits deducted, keep remaining expiries
          updatedExpiries.push(expiry);
        } else if (expiry.amount <= remainingToDeduct) {
          // Use all of this expiry's credits
          remainingToDeduct -= expiry.amount;
          // Don't add to updatedExpiries (it's fully used)
        } else {
          // Use partial credits from this expiry
          const remaining = expiry.amount - remainingToDeduct;
          updatedExpiries.push({
            ...expiry,
            amount: remaining
          });
          remainingToDeduct = 0;
        }
      }

      // Update user's credits and expiries
      const newCredits = currentCredits - amount;
      const { error: updateError } = await supabase
        .from('users')
        .update({
          credits: newCredits,
          credit_expiries: updatedExpiries,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Record transaction
      await this.recordTransaction(userId, -amount, 'deduction', reason, metadata);

      return {
        success: true,
        remainingCredits: newCredits,
        expiredCredits: 0
      };
    } catch (error) {
      console.error('Error deducting credits:', error);
      throw error;
    }
  }

  /**
   * Process expired credits
   * Removes credits that have passed their expiration date
   */
  static async processExpiredCredits(): Promise<{
    processed: number;
    expired: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;
    let expired = 0;

    try {
      // Get all users with credit expiries
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, credits, credit_expiries');

      if (usersError) throw usersError;

      const now = new Date();

      for (const user of users || []) {
        const creditExpiries: CreditExpiry[] = user.credit_expiries || [];
        
        // Filter out expired credits
        const validExpiries = creditExpiries.filter(expiry => 
          new Date(expiry.expiresAt) > now
        );

        const expiredAmount = creditExpiries.reduce((sum, expiry) => {
          if (new Date(expiry.expiresAt) <= now) {
            return sum + expiry.amount;
          }
          return sum;
        }, 0);

        // Only update if there were expired credits
        if (expiredAmount > 0) {
          const newCredits = Math.max(0, user.credits - expiredAmount);

          const { error: updateError } = await supabase
            .from('users')
            .update({
              credits: newCredits,
              credit_expiries: validExpiries,
              updated_at: now.toISOString()
            })
            .eq('id', user.id);

          if (updateError) {
            errors.push(`Failed to update user ${user.id}: ${updateError.message}`);
          } else {
            processed++;
            expired += expiredAmount;

            // Record expiration transaction
            await this.recordTransaction(
              user.id,
              -expiredAmount,
              'expiration',
              `Credits expired (FIFO)`,
              { expiredAt: now.toISOString() }
            );
          }
        }
      }

      return { processed, expired, errors };
    } catch (error) {
      console.error('Error processing expired credits:', error);
      errors.push(`Fatal error: ${error}`);
      return { processed, expired, errors };
    }
  }

  /**
   * Add credits with expiration
   * Credits are added with an expiration date
   */
  static async addCreditsWithExpiry(
    userId: string,
    amount: number,
    source: 'purchase' | 'bonus' | 'gift' | 'subscription' | 'refund',
    description: string,
    expiresAt: Date,
    metadata?: any
  ): Promise<{ success: boolean; newBalance: number }> {
    try {
      // Get current user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('credits, credit_expiries')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      if (!user) throw new Error('User not found');

      const creditExpiries: CreditExpiry[] = user.credit_expiries || [];

      // Add new expiry record
      const newExpiry: CreditExpiry = {
        amount,
        expiresAt: expiresAt.toISOString(),
        source
      };

      const updatedExpiries = [...creditExpiries, newExpiry];
      const newCredits = user.credits + amount;

      // Update user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          credits: newCredits,
          credit_expiries: updatedExpiries,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Record transaction
      await this.recordTransaction(userId, amount, source, description, metadata);

      return {
        success: true,
        newBalance: newCredits
      };
    } catch (error) {
      console.error('Error adding credits:', error);
      throw error;
    }
  }

  /**
   * Get credit expiry summary for a user
   */
  static async getCreditExpirySummary(userId: string): Promise<{
    totalCredits: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
    expiries: CreditExpiry[];
  }> {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('credits, credit_expiries')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (!user) throw new Error('User not found');

      const creditExpiries: CreditExpiry[] = user.credit_expiries || [];
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const expiringIn7Days = creditExpiries
        .filter(e => new Date(e.expiresAt) <= in7Days && new Date(e.expiresAt) > now)
        .reduce((sum, e) => sum + e.amount, 0);

      const expiringIn30Days = creditExpiries
        .filter(e => new Date(e.expiresAt) <= in30Days && new Date(e.expiresAt) > now)
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        totalCredits: user.credits,
        expiringIn7Days,
        expiringIn30Days,
        expiries: creditExpiries
      };
    } catch (error) {
      console.error('Error getting credit expiry summary:', error);
      throw error;
    }
  }

  /**
   * Record a credit transaction
   */
  private static async recordTransaction(
    userId: string,
    amount: number,
    type: string,
    description: string,
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount,
          type,
          description,
          metadata: metadata || {},
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error recording transaction:', error);
      // Don't throw - transaction recording is not critical
    }
  }

  /**
   * Schedule daily credit expiration processing
   * Should be called by a cron job or scheduled task
   */
  static async scheduleDailyExpiration(): Promise<void> {
    try {
      const result = await this.processExpiredCredits();
      
      console.log('Daily credit expiration processed:', {
        processed: result.processed,
        expired: result.expired,
        errors: result.errors.length
      });

      if (result.errors.length > 0) {
        console.error('Expiration errors:', result.errors);
      }
    } catch (error) {
      console.error('Error in daily expiration processing:', error);
    }
  }
}

/**
 * Credit Expiration Policies
 */
export const CREDIT_EXPIRATION_POLICIES = {
  // Subscription credits expire at end of billing cycle
  SUBSCRIPTION: {
    duration: 'monthly', // Expires at end of current billing period
    rollover: true // Unused credits roll over to next month
  },

  // Purchased credits expire after 1 year
  PURCHASED: {
    duration: 365, // days
    rollover: false
  },

  // Bonus credits expire after 90 days
  BONUS: {
    duration: 90, // days
    rollover: false
  },

  // Gift credits expire after 180 days
  GIFT: {
    duration: 180, // days
    rollover: false
  }
};

/**
 * Calculate expiration date based on credit source
 */
export function calculateExpirationDate(
  source: 'purchase' | 'bonus' | 'gift' | 'subscription' | 'refund',
  subscriptionEndDate?: Date
): Date {
  const now = new Date();

  switch (source) {
    case 'subscription':
      // Subscription credits expire at end of billing period
      return subscriptionEndDate || new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    case 'purchase':
      // Purchased credits expire after 1 year
      return new Date(now.getTime() + CREDIT_EXPIRATION_POLICIES.PURCHASED.duration * 24 * 60 * 60 * 1000);
    
    case 'bonus':
      // Bonus credits expire after 90 days
      return new Date(now.getTime() + CREDIT_EXPIRATION_POLICIES.BONUS.duration * 24 * 60 * 60 * 1000);
    
    case 'gift':
      // Gift credits expire after 180 days
      return new Date(now.getTime() + CREDIT_EXPIRATION_POLICIES.GIFT.duration * 24 * 60 * 60 * 1000);
    
    case 'refund':
      // Refund credits expire after 1 year (same as purchase)
      return new Date(now.getTime() + CREDIT_EXPIRATION_POLICIES.PURCHASED.duration * 24 * 60 * 60 * 1000);
    
    default:
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  }
}
