import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  ChevronDown, Plus, Copy, Download, Upload, Trash2,
  FileText, Check, Layers,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useFlowStore } from '@/stores/flowStore';

export function FlowMenu() {
  const flows = useFlowStore(s => s.flows);
  const activeFlowId = useFlowStore(s => s.activeFlowId);
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const setActiveFlow = useFlowStore(s => s.setActiveFlow);
  const createFlow = useFlowStore(s => s.createFlow);
  const deleteFlow = useFlowStore(s => s.deleteFlow);
  const duplicateFlow = useFlowStore(s => s.duplicateFlow);
  const exportFlow = useFlowStore(s => s.exportFlow);
  const importFlow = useFlowStore(s => s.importFlow);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');

  const handleCreate = () => {
    if (newFlowName.trim()) {
      createFlow(newFlowName.trim());
      setNewFlowName('');
      setShowNewDialog(false);
    }
  };

  if (!activeFlow) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ds-border bg-ds-surface/30">
        <Layers className="w-3.5 h-3.5 text-ds-accent shrink-0" />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-semibold text-ds-text hover:bg-ds-surface-hover transition-colors min-w-0">
              <span className="truncate">{activeFlow.name}</span>
              <span className="text-xs text-ds-text-dim">({activeFlow.steps.length} steps)</span>
              <ChevronDown className="w-3.5 h-3.5 text-ds-text-dim shrink-0" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[220px] rounded-lg border border-ds-border bg-ds-surface shadow-xl p-1"
              sideOffset={4}
              align="start"
            >
              {/* Switch flow */}
              {flows.length > 1 && (
                <>
                  <DropdownMenu.Label className="px-2 py-1 text-xs font-semibold text-ds-text-dim uppercase tracking-wider">
                    Switch Flow
                  </DropdownMenu.Label>
                  {flows.map(f => (
                    <DropdownMenu.Item
                      key={f.id}
                      onClick={() => setActiveFlow(f.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none"
                    >
                      {f.id === activeFlowId && <Check className="w-3 h-3 text-ds-accent" />}
                      {f.id !== activeFlowId && <div className="w-3" />}
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-ds-text-dim ml-auto">{f.steps.length}</span>
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="h-px bg-ds-border my-1" />
                </>
              )}

              {/* Actions */}
              <DropdownMenu.Item
                onClick={() => setShowNewDialog(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none"
              >
                <Plus className="w-3.5 h-3.5 text-ds-text-muted" />
                New Flow
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={() => duplicateFlow(activeFlow.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none"
              >
                <Copy className="w-3.5 h-3.5 text-ds-text-muted" />
                Duplicate
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={() => exportFlow(activeFlow.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none"
              >
                <Download className="w-3.5 h-3.5 text-ds-text-muted" />
                Export as JSON
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onClick={() => importFlow()}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none"
              >
                <Upload className="w-3.5 h-3.5 text-ds-text-muted" />
                Import Flow
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-ds-border my-1" />

              <DropdownMenu.Item
                onClick={() => setShowDeleteDialog(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ds-red cursor-pointer hover:bg-ds-red/10 outline-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Flow
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* New flow dialog */}
      <Dialog.Root open={showNewDialog} onOpenChange={setShowNewDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[340px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <Dialog.Title className="text-sm font-bold text-ds-text mb-1">
              Create New Flow
            </Dialog.Title>
            <Dialog.Description className="text-xs text-ds-text-dim mb-4">
              Give your flow a name that describes its purpose.
            </Dialog.Description>
            <Input
              icon={<FileText className="w-3.5 h-3.5" />}
              value={newFlowName}
              onChange={e => setNewFlowName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g., Visier Attrition by Quarter"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowNewDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!newFlowName.trim()}>
                Create
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete confirmation */}
      <AlertDialog.Root open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[340px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <AlertDialog.Title className="text-sm font-bold text-ds-text mb-1">
              Delete Flow
            </AlertDialog.Title>
            <AlertDialog.Description className="text-xs text-ds-text-dim mb-4">
              Are you sure you want to delete "{activeFlow?.name}"? This cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => activeFlowId && deleteFlow(activeFlowId)}
                >
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
