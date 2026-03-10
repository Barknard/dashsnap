import * as Dialog from '@radix-ui/react-dialog';
import * as Switch from '@radix-ui/react-switch';
import {
  Settings, FolderOpen, FileText, Globe, Lightbulb,
  RefreshCw, X, Heart, Download, CheckCircle, AlertCircle, ExternalLink, Loader2,
  Layout, Maximize2,
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
  const updateStatus = useAppStore(s => s.updateStatus);
  const updateAvailable = useAppStore(s => s.updateAvailable);
  const updateReleaseUrl = useAppStore(s => s.updateReleaseUrl);
  const updateProgress = useAppStore(s => s.updateProgress);
  const updateError = useAppStore(s => s.updateError);
  const updateDownloadPath = useAppStore(s => s.updateDownloadPath);

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
      pptxLayout: undefined,
    });
  };

  // Helper to update a single pptxLayout field
  const updateLayout = (field: string, value: number | boolean | string) => {
    const cur = currentSettings.pptxLayout;
    saveSettings({
      pptxLayout: {
        imageX: cur?.imageX ?? 0.3,
        imageY: cur?.imageY ?? 0.8,
        imageW: cur?.imageW ?? 12.7,
        imageH: cur?.imageH ?? 6.2,
        showHeader: cur?.showHeader ?? true,
        showFooter: cur?.showFooter ?? true,
        fitMode: cur?.fitMode ?? 'contain',
        [field]: value,
      },
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

            {/* PPTX Layout */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-ds-text flex items-center gap-1.5">
                <Layout className="w-3 h-3 text-ds-accent" />
                PowerPoint Layout
              </label>
              <p className="text-xs text-ds-text-dim mb-1">
                Position and size of screenshots on each slide (inches). Slide is 13.33 x 7.5 in.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {([
                  ['imageX', 'X Position'],
                  ['imageY', 'Y Position'],
                  ['imageW', 'Width'],
                  ['imageH', 'Height'],
                ] as const).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <span className="text-[10px] text-ds-text-dim uppercase tracking-wide">{label}</span>
                    <Input
                      type="number"
                      step="0.1"
                      value={currentSettings.pptxLayout?.[field] ?? { imageX: 0.3, imageY: 0.8, imageW: 12.7, imageH: 6.2 }[field]}
                      onChange={e => updateLayout(field, parseFloat(e.target.value) || 0)}
                      className="font-mono text-sm"
                    />
                  </div>
                ))}
              </div>

              {/* Fit Mode */}
              <div className="space-y-1">
                <span className="text-[10px] text-ds-text-dim uppercase tracking-wide flex items-center gap-1">
                  <Maximize2 className="w-2.5 h-2.5" /> Fit Mode
                </span>
                <div className="flex gap-1">
                  {(['contain', 'fill', 'stretch'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => updateLayout('fitMode', mode)}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors capitalize ${
                        (currentSettings.pptxLayout?.fitMode ?? 'contain') === mode
                          ? 'bg-ds-accent/20 border-ds-accent text-ds-accent'
                          : 'bg-ds-bg border-ds-border text-ds-text-muted hover:text-ds-text'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Header / Footer toggles */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-ds-text">Show Header</span>
                <Switch.Root
                  checked={currentSettings.pptxLayout?.showHeader ?? true}
                  onCheckedChange={v => updateLayout('showHeader', v)}
                  className="w-9 h-5 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
                >
                  <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 translate-x-0.5" />
                </Switch.Root>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ds-text">Show Footer</span>
                <Switch.Root
                  checked={currentSettings.pptxLayout?.showFooter ?? true}
                  onCheckedChange={v => updateLayout('showFooter', v)}
                  className="w-9 h-5 rounded-full bg-ds-bg border border-ds-border data-[state=checked]:bg-ds-accent transition-colors"
                >
                  <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4 translate-x-0.5" />
                </Switch.Root>
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
            <div className="space-y-2">
              {updateStatus === 'checking' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-accent/10 border border-ds-accent/20">
                  <Loader2 className="w-3.5 h-3.5 text-ds-accent animate-spin" />
                  <span className="text-xs text-ds-text">Checking for updates...</span>
                </div>
              )}

              {updateStatus === 'up-to-date' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-emerald/10 border border-ds-emerald/20">
                  <CheckCircle className="w-3.5 h-3.5 text-ds-emerald" />
                  <span className="text-xs text-ds-text">You're up to date!</span>
                </div>
              )}

              {updateStatus === 'available' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-amber/10 border border-ds-amber/20">
                    <Download className="w-3.5 h-3.5 text-ds-amber" />
                    <span className="text-xs text-ds-text">
                      Update v{updateAvailable} available!
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => appIpc.downloadUpdate()}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download Update
                  </Button>
                  {updateReleaseUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-ds-text-dim"
                      onClick={() => appIpc.openExternal(updateReleaseUrl)}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      View on GitHub
                    </Button>
                  )}
                </div>
              )}

              {updateStatus === 'downloading' && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-accent/10 border border-ds-accent/20">
                    <Loader2 className="w-3.5 h-3.5 text-ds-accent animate-spin" />
                    <span className="text-xs text-ds-text">Downloading update... {updateProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-ds-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ds-accent rounded-full transition-all duration-300"
                      style={{ width: `${updateProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {updateStatus === 'downloaded' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-emerald/10 border border-ds-emerald/20">
                    <CheckCircle className="w-3.5 h-3.5 text-ds-emerald" />
                    <span className="text-xs text-ds-text">Update downloaded! Restart to install.</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => appIpc.installUpdate()}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Restart & Install
                  </Button>
                </div>
              )}

              {updateStatus === 'download-complete' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-emerald/10 border border-ds-emerald/20">
                    <CheckCircle className="w-3.5 h-3.5 text-ds-emerald" />
                    <span className="text-xs text-ds-text">Update saved to Downloads!</span>
                  </div>
                  {updateDownloadPath && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => appIpc.openPath(updateDownloadPath)}
                    >
                      <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                      Open Downloads
                    </Button>
                  )}
                  <p className="text-xs text-ds-text-dim text-center">
                    Close this app and run the new version.
                  </p>
                </div>
              )}

              {updateStatus === 'error' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ds-red/10 border border-ds-red/20">
                  <AlertCircle className="w-3.5 h-3.5 text-ds-red" />
                  <span className="text-xs text-ds-text truncate" title={updateError || ''}>
                    Update check failed
                  </span>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => appIpc.checkUpdate()}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${updateStatus === 'checking' ? 'animate-spin' : ''}`} />
                Check for Updates
              </Button>
            </div>

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
