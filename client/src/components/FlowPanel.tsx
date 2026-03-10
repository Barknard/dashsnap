import { useState } from 'react';
import {
  Plus, Trash2, Copy, Download, Upload, FileText, ChevronDown,
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Tooltip } from './ui/Tooltip';
import { StepList } from './StepList';
import { WelcomeCard } from './OnboardingTips';
import { useFlowStore } from '@/stores/flowStore';
import { type FlowStep } from '@shared/types';

interface FlowPanelProps {
  onEditStep: (step: FlowStep) => void;
}

export function FlowPanel({ onEditStep }: FlowPanelProps) {
  const flows = useFlowStore(s => s.flows);
  const activeFlowId = useFlowStore(s => s.activeFlowId);
  const activeFlow = useFlowStore(s => s.getActiveFlow());
  const setActiveFlow = useFlowStore(s => s.setActiveFlow);
  const createFlow = useFlowStore(s => s.createFlow);
  const deleteFlow = useFlowStore(s => s.deleteFlow);
  const duplicateFlow = useFlowStore(s => s.duplicateFlow);
  const exportFlow = useFlowStore(s => s.exportFlow);
  const importFlow = useFlowStore(s => s.importFlow);
  const updateFlowDescription = useFlowStore(s => s.updateFlowDescription);

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

  return (
    <div className="flex flex-col h-full">
      <WelcomeCard />

      {/* Flow selector */}
      <div className="px-3 pb-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Select.Root value={activeFlowId || ''} onValueChange={setActiveFlow}>
            <Select.Trigger className="flex-1 flex items-center justify-between h-9 px-3 rounded-lg border border-ds-border bg-ds-bg text-sm text-ds-text hover:border-ds-border-bright transition-colors">
              <Select.Value placeholder="Select a flow..." />
              <Select.Icon>
                <ChevronDown className="w-3.5 h-3.5 text-ds-text-dim" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                className="z-50 rounded-lg border border-ds-border bg-ds-surface shadow-xl overflow-hidden"
                position="popper"
                sideOffset={4}
              >
                <Select.Viewport className="p-1">
                  {flows.map(f => (
                    <Select.Item
                      key={f.id}
                      value={f.id}
                      className="flex items-center h-8 px-3 rounded-md text-sm text-ds-text cursor-pointer hover:bg-ds-surface-hover outline-none data-[highlighted]:bg-ds-surface-hover"
                    >
                      <Select.ItemText>{f.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                  {flows.length === 0 && (
                    <div className="px-3 py-2 text-xs text-ds-text-dim">No flows yet</div>
                  )}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          {/* Action buttons */}
          <Tooltip content="New flow">
            <Button variant="outline" size="icon" onClick={() => setShowNewDialog(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </Tooltip>
        </div>

        {/* Flow actions row */}
        {activeFlow && (
          <div className="flex items-center gap-1">
            <Tooltip content="Duplicate flow">
              <Button variant="ghost" size="icon-sm" onClick={() => duplicateFlow(activeFlow.id)}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content="Export as JSON">
              <Button variant="ghost" size="icon-sm" onClick={() => exportFlow(activeFlow.id)}>
                <Download className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content="Import flow">
              <Button variant="ghost" size="icon-sm" onClick={() => importFlow()}>
                <Upload className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
            <div className="flex-1" />
            <Tooltip content="Delete flow">
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-ds-red"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Tooltip>
          </div>
        )}

        {/* Flow description */}
        {activeFlow && (
          <textarea
            value={activeFlow.description || ''}
            onChange={e => updateFlowDescription(activeFlow.id, e.target.value)}
            placeholder="Add a description..."
            rows={2}
            className="w-full px-3 py-2 text-xs text-ds-text-muted bg-ds-bg border border-ds-border rounded-lg resize-none placeholder:text-ds-text-dim focus:outline-none focus:ring-1 focus:ring-ds-accent/50"
          />
        )}
      </div>

      {/* Step list */}
      <div className="flex-1 overflow-y-auto px-2">
        <StepList onEditStep={onEditStep} />
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
    </div>
  );
}
