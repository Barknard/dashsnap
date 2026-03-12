import { Camera, Settings, ArrowDownCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Tooltip } from './ui/Tooltip';
import { useAppStore } from '@/stores/appStore';

export function Header() {
  const version = useAppStore(s => s.version);
  const updateAvailable = useAppStore(s => s.updateAvailable);
  const setShowSettings = useAppStore(s => s.setShowSettings);

  return (
    <div className="flex items-center gap-2 px-3 shrink-0" style={{ width: 'var(--sidebar-w, 380px)' }}>
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-ds-accent to-ds-cyan shadow-sm shadow-ds-accent/20 shrink-0">
        <Camera className="w-3.5 h-3.5 text-white" />
      </div>
      <h1 className="text-sm font-bold text-ds-text tracking-tight leading-none">
        DashSnap
      </h1>
      <Badge variant="cyan" className="text-xs">
        v{version}
      </Badge>
      <div className="flex items-center gap-0.5 ml-auto">
        {updateAvailable && (
          <Tooltip content={`Update ${updateAvailable} available`}>
            <Button variant="ghost" size="icon-sm" className="relative text-ds-emerald">
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-ds-emerald rounded-full animate-pulse-recording" />
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Settings">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-3.5 h-3.5 text-ds-text-muted hover:text-ds-text" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
