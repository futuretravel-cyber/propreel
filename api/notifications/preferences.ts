import { VercelRequest, VercelResponse } from '@vercel/node';
import { getUser, updateUser } from '../../lib/userService';

// Default notification preferences applied to new users
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailNotifications: true,
  pushNotifications: true,
  renderComplete: true,
  lowCredits: true,
  newFeatures: true,
  billingAlerts: true,
  marketingEmails: false,
};

/**
 * GET  /api/notifications/preferences?user_id=xxx
 * POST /api/notifications/preferences  { user_id, preferences: {...} }
 *
 * Notification preferences are stored on the user record under
 * `notificationPreferences` in DynamoDB.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const userId = req.query.user_id as string;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
      const user = await getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json({
        success: true,
        preferences: user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES,
      });
    } catch (error) {
      console.error('Get notification preferences error:', error);
      return res.status(500).json({ error: 'Failed to load preferences' });
    }
  }

  if (req.method === 'POST') {
    const { user_id, preferences } = req.body || {};
    if (!user_id || typeof preferences !== 'object' || preferences === null) {
      return res.status(400).json({ error: 'Missing user_id or preferences' });
    }

    try {
      const user = await getUser(user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Only persist known keys, coerced to boolean
      const cleaned: Record<string, boolean> = { ...(user.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES) };
      for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
        if (key in preferences) {
          cleaned[key] = Boolean(preferences[key]);
        }
      }

      await updateUser(user_id, { notificationPreferences: cleaned });

      return res.status(200).json({
        success: true,
        preferences: cleaned,
        message: 'Notification preferences saved',
      });
    } catch (error) {
      console.error('Save notification preferences error:', error);
      return res.status(500).json({ error: 'Failed to save preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
