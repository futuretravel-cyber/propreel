import { useState } from 'react';
import { User, Upload, Sparkles, Zap, Info, Video } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useCredit } from '../context/AuthContext';

interface AITalkingProfileProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  profileImage: string | null;
  onProfileImageChange: (image: string | null) => void;
  voiceoverScript: string;
}

export default function AITalkingProfile({ 
  enabled, 
  onToggle, 
  profileImage, 
  onProfileImageChange,
  voiceoverScript 
}: AITalkingProfileProps) {
  const toast = useToast();
  const { user } = useCredit();
  const [uploading, setUploading] = useState(false);

  const CREDIT_COST = 8;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      onProfileImageChange(reader.result as string);
      setUploading(false);
      toast.success('Profile image uploaded successfully');
    };
    reader.onerror = () => {
      setUploading(false);
      toast.error('Failed to upload image');
    };
    reader.readAsDataURL(file);
  };

  const handleToggle = () => {
    if (!enabled && !profileImage) {
      toast.error('Please upload a profile image first');
      return;
    }
    
    if (!enabled && !voiceoverScript) {
      toast.error('Please generate or write a voiceover script first');
      return;
    }

    const newEnabled = !enabled;
    onToggle(newEnabled);
    
    if (newEnabled) {
      toast.success(`AI Talking Profile enabled (${CREDIT_COST} credits)`);
    } else {
      toast.info('AI Talking Profile disabled');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-purple-400" />
          <label className="label mb-0">AI Talking Profile</label>
          <span className="badge badge-brand text-xs">
            <Zap className="w-3 h-3" /> {CREDIT_COST} credits
          </span>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-purple-600' : 'bg-ink-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="bg-ink-800/50 rounded-xl p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ink-400">
            Generate an AI-powered talking head video using your profile photo. The AI will animate your photo to speak the voiceover script naturally.
          </p>
        </div>

        {/* Profile Image Upload */}
        <div>
          <label className="label">Agent Profile Photo</label>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl bg-ink-900 border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-ink-500" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="profile-upload"
                disabled={uploading}
              />
              <label
                htmlFor="profile-upload"
                className={`btn btn-secondary w-full cursor-pointer ${uploading ? 'opacity-50' : ''}`}
              >
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {profileImage ? 'Change Photo' : 'Upload Photo'}
                  </>
                )}
              </label>
              <p className="text-xs text-ink-500 mt-2">
                Upload a clear, front-facing photo (max 5MB)
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${profileImage ? 'bg-green-500' : 'bg-ink-600'}`} />
            <span className={profileImage ? 'text-green-400' : 'text-ink-500'}>
              Profile photo {profileImage ? 'uploaded' : 'required'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${voiceoverScript ? 'bg-green-500' : 'bg-ink-600'}`} />
            <span className={voiceoverScript ? 'text-green-400' : 'text-ink-500'}>
              Voiceover script {voiceoverScript ? 'ready' : 'required'}
            </span>
          </div>
        </div>

      {/* Info Box */}
      {enabled && (
        <div className="bg-purple-950/30 border border-purple-500/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Video className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-purple-200">
              <p className="font-semibold mb-1">AI Talking Head Video Active</p>
              <p className="text-purple-300 mb-2">
                Your profile will be animated using FlashHead AI to create a professional lip-synced talking head video.
              </p>
              <div className="space-y-1 text-purple-300">
                <p>• Text converted to speech with ElevenLabs</p>
                <p>• Image animated with FlashHead AI</p>
                <p>• Processed via Modal backend</p>
                <p>• Stored in AWS S3</p>
                <p>• Integrated into final property reel</p>
              </div>
            </div>
          </div>
        </div>
      )}      </div>
    </div>
  );
}
