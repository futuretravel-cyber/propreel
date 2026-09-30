import { useState } from 'react';
import { useCredit } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Video, User, Sparkles, Zap, AlertCircle, Check } from 'lucide-react';
import { ModalAPI } from '../lib/modalClient';

interface FlashHeadVideoProps {
  voiceoverScript: string;
  profileImage: string | null;
  onVideoGenerated: (videoUrl: string) => void;
}

export default function FlashHeadVideo({ voiceoverScript, profileImage, onVideoGenerated }: FlashHeadVideoProps) {
  const { user } = useCredit();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const FLASHHEAD_CREDIT_COST = 8;

  const canGenerate = voiceoverScript && profileImage && user && user.credits >= FLASHHEAD_CREDIT_COST;

  const generateLipSyncVideo = async () => {
    if (!canGenerate) {
      if (!voiceoverScript) {
        toast.error('Please generate a voiceover script first');
        return;
      }
      if (!profileImage) {
        toast.error('Please upload your profile image first');
        return;
      }
      if (user && user.credits < FLASHHEAD_CREDIT_COST) {
        toast.error(`Insufficient credits. You need ${FLASHHEAD_CREDIT_COST} credits but only have ${user.credits}. Please purchase more credits.`);
        return;
      }
      return;
    }

    setGenerating(true);
    
    try {
      // Deduct credits first
      const { deductCredits } = useCredit();
      await deductCredits(FLASHHEAD_CREDIT_COST, 'FlashHead talking head video', {
        profile_image_url: profileImage,
        voiceover_text: voiceoverScript,
        model: 'fal-ai/flashhead'
      });

      // Call Modal API to generate FlashHead video
      const result = await ModalAPI.generateFlashHeadVideo({
        profile_image_url: profileImage!,
        voiceover_text: voiceoverScript,
        user_id: user!.id,
        voice: 'Aria',
        stability: 0.5
      });

      setVideoUrl(result.video_url);
      setGenerated(true);
      onVideoGenerated(result.video_url);
      
      toast.success('Lip-synced video generated successfully!', 'FlashHead Complete');
    } catch (error) {
      console.error('FlashHead generation error:', error);
      toast.error('Failed to generate lip-synced video', 'Error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card-dark p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-400" />
            AI Talking Head Video (FlashHead)
          </h3>
          <p className="text-ink-400 text-sm mt-1">
            Generate a professional lip-synced talking head video from your profile picture
          </p>
        </div>
        <div className="badge badge-brand">
          <Zap className="w-3 h-3" /> {FLASHHEAD_CREDIT_COST} credits
        </div>
      </div>

      {/* Requirements Check */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3">
          {voiceoverScript ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-ink-500" />
          )}
          <span className={`text-sm ${voiceoverScript ? 'text-white' : 'text-ink-400'}`}>
            Voiceover script generated
          </span>
        </div>
        <div className="flex items-center gap-3">
          {profileImage ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-ink-500" />
          )}
          <span className={`text-sm ${profileImage ? 'text-white' : 'text-ink-400'}`}>
            Profile image uploaded
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user && user.credits >= FLASHHEAD_CREDIT_COST ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-ink-500" />
          )}
          <span className={`text-sm ${user && user.credits >= FLASHHEAD_CREDIT_COST ? 'text-white' : 'text-ink-400'}`}>
            Sufficient credits ({user?.credits || 0} available)
          </span>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-ink-800/50 rounded-xl p-4 mb-6">
        <h4 className="font-semibold text-white text-sm mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          How it works
        </h4>
        <ol className="space-y-2 text-xs text-ink-300">
          <li>1. Your profile image is analyzed by FlashHead AI</li>
          <li>2. Your voiceover text is converted to speech using ElevenLabs</li>
          <li>3. The AI generates a lip-synced talking head video (512x512, 25 FPS)</li>
          <li>4. Video is stored in AWS S3</li>
          <li>5. Video is integrated into your property reel</li>
        </ol>
      </div>

      {/* Generated Video Preview */}
      {generated && videoUrl && (
        <div className="mb-6">
          <div className="aspect-video bg-ink-800 rounded-xl overflow-hidden mb-3">
            <video controls className="w-full h-full">
              <source src={videoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
          <p className="text-xs text-green-400 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Talking head video generated successfully
          </p>
        </div>
      )}

      {/* Generate Button */}
        <button
          onClick={generateLipSyncVideo}
          disabled={!canGenerate || generating}
          className={`btn w-full ${
            !canGenerate || generating
              ? 'bg-ink-700 text-ink-500 cursor-not-allowed'
              : 'btn-primary'
          }`}
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating Talking Head Video...
            </>
          ) : generated ? (
            <>
              <Check className="w-4 h-4" />
              Regenerate Video
            </>
          ) : (
            <>
              <Video className="w-4 h-4" />
              Generate Talking Head Video ({FLASHHEAD_CREDIT_COST} credits)
            </>
          )}
        </button>
      {!canGenerate && !generating && (
        <p className="text-xs text-ink-500 mt-3 text-center">
          {!voiceoverScript && 'Generate a voiceover script first • '}
          {!profileImage && 'Upload profile image first • '}
          {user && user.credits < FLASHHEAD_CREDIT_COST && 'Insufficient credits'}
        </p>
      )}
    </div>
  );
}
