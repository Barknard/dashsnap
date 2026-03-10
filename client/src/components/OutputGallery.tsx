import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Image, FileText, FolderOpen, RefreshCw, Trash2, Eye, X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './ui/Button';
import { app as appIpc } from '@/lib/ipc';

interface OutputFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  type: string;
  dataUrl: string | null;
}

export function OutputGallery() {
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<OutputFile | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const results = await appIpc.listOutputs();
      setFiles(results);
    } catch (err) {
      console.error('Failed to load outputs:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const images = files.filter(f => f.type === 'image');
  const pptxFiles = files.filter(f => f.type === 'pptx');

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ds-text flex items-center gap-1.5">
          <Image className="w-4 h-4 text-ds-accent" />
          Saved Output
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => appIpc.openPath('')}>
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* PowerPoint files */}
      {pptxFiles.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider mb-1.5 px-1">
            PowerPoints
          </h4>
          <div className="space-y-1">
            {pptxFiles.map(f => (
              <button
                key={f.name}
                onClick={() => appIpc.openPath(f.path)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-ds-surface hover:bg-ds-surface-hover border border-ds-border/50 transition-colors text-left"
              >
                <FileText className="w-4 h-4 text-ds-purple shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ds-text truncate">{f.name}</p>
                  <p className="text-xs text-ds-text-dim">{formatSize(f.size)} · {formatDate(f.modified)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Screenshot thumbnails */}
      {images.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider mb-1.5 px-1">
            Screenshots ({images.length})
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {images.map(f => (
              <motion.button
                key={f.name}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => f.dataUrl ? setPreviewFile(f) : appIpc.openPath(f.path)}
                className="relative group rounded-lg overflow-hidden border border-ds-border/50 bg-ds-bg hover:border-ds-accent/50 transition-colors"
              >
                {f.dataUrl ? (
                  <img
                    src={f.dataUrl}
                    alt={f.name}
                    className="w-full h-24 object-cover"
                  />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center bg-ds-surface">
                    <Image className="w-6 h-6 text-ds-text-dim" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white" />
                </div>
                {/* Name label */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                  <p className="text-xs text-white truncate">{f.name.replace(/\.(png|jpg|jpeg)$/i, '')}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <Image className="w-10 h-10 text-ds-text-dim/40 mb-3" />
          <p className="text-sm text-ds-text-muted">No output files yet</p>
          <p className="text-xs text-ds-text-dim mt-1">Run a flow to generate screenshots and PowerPoints</p>
        </div>
      )}

      {/* Open folder button */}
      <div className="mt-auto pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => appIpc.openPath('')}
        >
          <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
          Open Output Folder
        </Button>
      </div>

      {/* Image preview dialog */}
      <Dialog.Root open={!!previewFile} onOpenChange={open => { if (!open) setPreviewFile(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/80 z-50" />
          <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[360px] bg-ds-surface border border-ds-border rounded-xl z-50 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-ds-border">
              <Dialog.Title className="text-xs font-bold text-ds-text truncate flex-1">
                {previewFile?.name}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm">
                  <X className="w-4 h-4" />
                </Button>
              </Dialog.Close>
            </div>
            {previewFile?.dataUrl && (
              <img
                src={previewFile.dataUrl}
                alt={previewFile.name}
                className="w-full max-h-[60vh] object-contain bg-black"
              />
            )}
            <div className="flex items-center justify-between px-3 py-2 border-t border-ds-border">
              <span className="text-xs text-ds-text-dim">
                {previewFile ? formatSize(previewFile.size) : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewFile && appIpc.openPath(previewFile.path)}
              >
                Open File
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
