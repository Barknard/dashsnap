import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  Settings, FolderOpen, FileText, Globe, Lightbulb,
  RefreshCw, X, Heart,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAppStore } from '@/stores/appStore';
import { settings as settingsIpc, app as appIpc } from '@/lib/ipc';

export function SettingsDialog() {
  const showSettings = useAppStore(s => s.showSettings);
  const setShowSettings = useAppStore(s => s.setShowSettings);
  const currentSettings = useAppStore(s => s.settings);
  const saveSettings = useAppStore(s => s.saveSettings);
  const version = useAppStore(s => s.version);

  const handleBrowseFolder = async (field: 'browserProfilePath' | 'outputPath') => {
    const path = await settingsIpc.browseFolder();
    if (path) saveSettings({ [field]: path });
  };

  const handleBrowseTemplate = async () => {
    const path = await settingsIpc.browseTemplate();
    if (path) saveSettings({ defaultTemplate: path });
  };

  const handleReset = () => {
    saveSettings({
      browserProfilePath: '',
      outputPath: '',
      defaultTemplate: undefined,
      startUrl: 'about:blank',
      showTips: true,
    });
  };

  return (
    <Dialog.Root open={showSettings} onOpenChange={setShowSettings}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[360px] max-h-[85vh] overflow-y-auto bg-ds-surface border border-ds-border rounded-xl z-50 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-ds-text-muted" />
              <Dialog.Title className="text-sm font-bold text-ds-text">Settings</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm">
                <X className="w-4 h-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="p-5 space-y-5">
            {/* Browser Profile */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ds-text flex items-center gap-1.5">
                <FolderOpen className="w-3 h-3 text-ds-text-dim" />
                Browser Profile Path
              </label>
              <p className="text-xs text-ds-text-dim mb-1">
                Where SSO cookies and session data are stored. Change this if IT restricts default folders.
              </p>
              <div className="flex gap-2">
                <Input
                  value={currentSettings.browserProfilePath}
                  onChange={e => saveSettings({ browserProfilePath: e.target.value })}
                  placeholder="Default: %USERPROFILE%\DashSnap\browser_profile"
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={() => handleBrowseFolder('browserProfilePath')}>
                  Browse
                </Button>
              </div>
            </div>

            {/* Output Path */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ds-text flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-ds-text-dim" />
                Output Folder
              </label>
              <p className="text-xs text-ds-text-dim mb-1">
                Where generated PowerPoint files are saved.
              </p>
              <div className="flex gap-2">
                <Input
                  value={currentSettings.outputPath}
                  onChange={e => saveSettings({ outputPath: e.target.value })}
                  placeholder="Default: %USERPROFILE%\DashSnap\output"
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={() => handleBrowseFolder('outputPath')}>
                  Browse
                </Button>
              </div>
            </div>

            {/* Default Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ds-text flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-ds-purple" />
                Default PowerPoint Template
              </label>
              <div className="flex gap-2">
                <Input
                  value={currentSettings.defaultTemplate || ''}
                  onChange={e => saveSettings({ defaultTemplate: e.target.value })}
                  placeholder="None (blank 16:9 slides)"
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleBrowseTemplate}>
                  Browse
                </Button>
              </div>
            </div>

            {/* Start URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ds-text flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-ds-cyan" />
                Start URL
              </label>
              <p className="text-xs text-ds-text-dim mb-1">
                The page loaded when DashSnap opens.
              </p>
              <Input
                value={currentSettings.startUrl}
                onChange={e => saveSettings({ startUrl: e.target.value })}
                placeholder="about:blank"
                className="font-mono text-sm"
              />
            </div>

            {/* Show Tips */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="w-3 h-3 text-ds-amber" />
                <span className="text-xs font-medium text-ds-text">Show Tips</span>
              </div>
              <Switch.Root
                checked={currentSettings.showTips}
                onCheckedChange={v => saveSettings({ showTips: v })}
                className="w-9 h-5 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
              >
                <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 translate-x-0.5" />
              </Switch.Root>
            </div>

            {/* Divider */}
            <div className="border-t border-ds-border" />

            {/* Update check */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => appIpc.checkUpdate()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Check for Updates
            </Button>

            {/* Reset */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-ds-text-dim"
              onClick={handleReset}
            >
              Reset to Defaults
            </Button>

            {/* About */}
            <div className="text-center pt-2 border-t border-ds-border">
              <p className="text-sm text-ds-text-dim">
                DashSnap v{version}
              </p>
              <p className="text-xs text-ds-text-dim/60 mt-1 flex items-center justify-center gap-1">
                Made with <Heart className="w-2.5 h-2.5 text-ds-red/60" /> for dashboard warriors
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
