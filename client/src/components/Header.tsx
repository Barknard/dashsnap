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
    <div className="flex items-center justify-between px-4 py-3 border-b border-ds-border bg-ds-surface/50 glass">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-ds-accent to-ds-cyan shadow-md shadow-ds-accent/20">
          <Camera className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-ds-text tracking-tight leading-none">
            DashSnap
          </h1>
          <p className="text-xs text-ds-text-dim leading-none mt-0.5">
            Dashboard to Deck
          </p>
        </div>
        <Badge variant="cyan" className="ml-1 text-xs">
          v{version}
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        {updateAvailable && (
          <Tooltip content={`Update ${updateAvailable} available`}>
            <Button variant="ghost" size="icon-sm" className="relative text-ds-emerald">
              <ArrowDownCircle className="w-4 h-4" />
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
            <Settings className="w-4 h-4 text-ds-text-muted hover:text-ds-text" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
