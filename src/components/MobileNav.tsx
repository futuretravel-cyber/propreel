import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Video, FolderOpen, Zap, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function MobileNav() {
  const { user } = useAuth();
  const showAgency = user?.role === 'AGENCY_OWNER' || user?.role === 'ADMIN';

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-ink-900/95 backdrop-blur-xl border-t border-white/5">
      <div className="flex items-center justify-around py-2 px-2">
        <NavLink
          to="/dashboard"
          aria-label="Dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium">Dashboard</span>
        </NavLink>

        <NavLink
          to="/dashboard/video"
          aria-label="AI tools"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
          }
        >
          <Video className="w-5 h-5" />
          <span className="text-[10px] font-medium">Create</span>
        </NavLink>

        <NavLink
          to="/dashboard/projects"
          aria-label="Projects"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
          }
        >
          <FolderOpen className="w-5 h-5" />
          <span className="text-[10px] font-medium">Projects</span>
        </NavLink>

        <NavLink
          to="/dashboard/credits"
          aria-label="Credits"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
          }
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px] font-medium">Credits</span>
        </NavLink>

        {showAgency && (
          <NavLink
            to="/dashboard/agency"
            aria-label="Agency"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
            }
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Agency</span>
          </NavLink>
        )}

        {!showAgency && (
          <NavLink
            to="/dashboard/settings"
            aria-label="Profile"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition ${isActive ? 'text-purple-400' : 'text-ink-500'}`
            }
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Profile</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}
