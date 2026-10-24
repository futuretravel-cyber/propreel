import { useState } from 'react';
import { Share2, MessageSquare, Users, Link as LinkIcon, Copy, Check, Send, X } from 'lucide-react';

interface Comment {
  id: string;
  author: string;
  authorAvatar?: string;
  message: string;
  timestamp: string;
  replies?: Comment[];
}

interface ShareLink {
  id: string;
  url: string;
  permissions: 'view' | 'edit' | 'admin';
  expiresAt?: string;
  createdAt: string;
}

export default function CollaborationPanel({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<'share' | 'comments'>('share');
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit' | 'admin'>('view');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([
    {
      id: '1',
      url: 'https://propreel.co.za/share/abc123',
      permissions: 'view',
      createdAt: '2025-03-10T10:00:00Z'
    }
  ]);
  const [comments, setComments] = useState<Comment[]>([
    {
      id: '1',
      author: 'Sarah van der Merwe',
      message: 'Love the golden hour effect on this one! The client will be thrilled.',
      timestamp: '2 hours ago'
    },
    {
      id: '2',
      author: 'James Molefe',
      message: 'Can we add the pool area to the video? It\'s a major selling point.',
      timestamp: '5 hours ago',
      replies: [
        {
          id: '2-1',
          author: 'You',
          message: 'Good idea! I\'ll regenerate with the pool shots included.',
          timestamp: '4 hours ago'
        }
      ]
    }
  ]);
  const [newComment, setNewComment] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const handleCreateShareLink = () => {
    const newLink: ShareLink = {
      id: Date.now().toString(),
      url: `https://propreel.co.za/share/${Math.random().toString(36).slice(2, 10)}`,
      permissions: sharePermission,
      createdAt: new Date().toISOString()
    };
    setShareLinks([newLink, ...shareLinks]);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const comment: Comment = {
      id: Date.now().toString(),
      author: 'You',
      message: newComment,
      timestamp: 'Just now'
    };
    setComments([comment, ...comments]);
    setNewComment('');
  };

  return (
    <div className="card-dark overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setActiveTab('share')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition ${
            activeTab === 'share'
              ? 'text-purple-400 border-b-2 border-purple-500'
              : 'text-ink-400 hover:text-white'
          }`}
        >
          <Share2 className="w-4 h-4" /> Share
        </button>
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition ${
            activeTab === 'comments'
              ? 'text-purple-400 border-b-2 border-purple-500'
              : 'text-ink-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" /> Comments ({comments.length})
        </button>
      </div>

      {/* Share Tab */}
      {activeTab === 'share' && (
        <div className="p-6 space-y-6">
          {/* Invite by Email — coming soon. There is no email sending behind
              this yet, so the form and its send button stay hidden until one
              exists (a button that sends nothing is worse than no button). */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Invite by Email</h3>
            <p className="text-xs text-white/50">Coming soon — email invitations aren't available yet. Use a share link below instead.</p>
          </div>

          {/* Share Links */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Share Links</h3>
              <button onClick={handleCreateShareLink} className="btn btn-secondary text-xs">
                <LinkIcon className="w-3 h-3" /> Create Link
              </button>
            </div>
            <div className="space-y-2">
              {shareLinks.map(link => (
                <div key={link.id} className="flex items-center gap-3 p-3 bg-ink-800/50 rounded-lg">
                  <LinkIcon className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{link.url}</p>
                    <p className="text-xs text-ink-400">
                      {link.permissions === 'view' ? 'View only' : link.permissions === 'edit' ? 'Can edit' : 'Admin access'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyLink(link.url)}
                    className="btn btn-ghost text-xs"
                  >
                    {copied === link.url ? (
                      <><Check className="w-3 h-3" /> Copied</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy</>
                    )}
                  </button>
                  <button className="text-ink-400 hover:text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Team Members */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Team Members with Access
            </h3>
            <div className="space-y-2">
              {[
                { name: 'Sarah van der Merwe', email: 'sarah@agency.co.za', permission: 'edit' },
                { name: 'James Molefe', email: 'james@agency.co.za', permission: 'view' }
              ].map(member => (
                <div key={member.email} className="flex items-center justify-between p-3 bg-ink-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 text-xs font-bold">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm text-white">{member.name}</p>
                      <p className="text-xs text-ink-400">{member.email}</p>
                    </div>
                  </div>
                  <span className="badge badge-muted text-[10px]">
                    {member.permission === 'view' ? 'View' : member.permission === 'edit' ? 'Edit' : 'Admin'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === 'comments' && (
        <div className="p-6">
          {/* New Comment */}
          <div className="mb-6">
            <textarea
              className="input min-h-[80px] mb-2"
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim()}
              className="btn btn-primary"
            >
              <Send className="w-4 h-4" /> Post Comment
            </button>
          </div>

          {/* Comments List */}
          <div className="space-y-4">
            {comments.map(comment => (
              <div key={comment.id} className="border-b border-white/5 pb-4 last:border-0">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-700/30 flex items-center justify-center text-purple-300 text-xs font-bold flex-shrink-0">
                    {comment.author.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-white">{comment.author}</p>
                      <p className="text-xs text-ink-500">{comment.timestamp}</p>
                    </div>
                    <p className="text-sm text-ink-300">{comment.message}</p>
                    
                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="mt-3 ml-4 space-y-3">
                        {comment.replies.map(reply => (
                          <div key={reply.id} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-ink-700 flex items-center justify-center text-ink-300 text-[10px] font-bold flex-shrink-0">
                              {reply.author[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-xs font-medium text-white">{reply.author}</p>
                                <p className="text-xs text-ink-500">{reply.timestamp}</p>
                              </div>
                              <p className="text-xs text-ink-300">{reply.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button className="text-xs text-ink-400 hover:text-purple-400 mt-2">
                      Reply
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
