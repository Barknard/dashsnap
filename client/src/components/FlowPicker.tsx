import { useState } from 'react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Layers, Plus, FileText, Upload, Play, MousePointer2, Camera,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useFlowStore } from '@/stores/flowStore';

export function FlowPicker() {
  const flows = useFlowStore(s => s.flows);
  const setActiveFlow = useFlowStore(s => s.setActiveFlow);
  const createFlow = useFlowStore(s => s.createFlow);
  const importFlow = useFlowStore(s => s.importFlow);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');

  const handleCreate = () => {
    if (newFlowName.trim()) {
      createFlow(newFlowName.trim());
      setNewFlowName('');
      setShowNewDialog(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[340px] text-center"
      >
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-ds-accent/20 to-ds-cyan/10 border border-ds-accent/20 mb-5">
          <Layers className="w-8 h-8 text-ds-accent" />
        </div>

        <h2 className="text-lg font-bold text-ds-text mb-1">Select a Flow</h2>
        <p className="text-xs text-ds-text-dim mb-6">
          Pick an existing flow or create a new one to get started.
        </p>

        {/* Existing flows */}
        {flows.length > 0 && (
          <div className="space-y-1.5 mb-5">
            {flows.map(flow => (
              <motion.button
                key={flow.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setActiveFlow(flow.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-ds-surface border border-ds-border hover:border-ds-accent/40 hover:bg-ds-surface-hover transition-all text-left group"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-ds-accent/10 group-hover:bg-ds-accent/20 transition-colors shrink-0">
                  <Play className="w-4 h-4 text-ds-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ds-text truncate">{flow.name}</p>
                  <p className="text-xs text-ds-text-dim">
                    {flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}
                    {flow.description ? ` — ${flow.description}` : ''}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full"
            onClick={() => setShowNewDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Flow
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => importFlow()}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import from JSON
          </Button>
        </div>

        {/* Quick guide */}
        {flows.length === 0 && (
          <div className="mt-8 text-left space-y-3">
            <p className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider">How it works</p>
            {[
              { icon: MousePointer2, text: 'Record clicks to navigate your dashboard' },
              { icon: Camera, text: 'Capture elements as screenshots' },
              { icon: Play, text: 'Run the flow to auto-generate your PowerPoint' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-ds-accent/10 shrink-0">
                  <step.icon className="w-3.5 h-3.5 text-ds-accent" />
                </div>
                <span className="text-xs text-ds-text-muted">{step.text}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

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
    </div>
  );
}
