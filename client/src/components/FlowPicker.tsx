import { useState } from 'react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus, FileText, Upload, Play, MousePointer2, Camera,
  Presentation, ArrowRight, Clapperboard,
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

  const hasExisting = flows.length > 0;

  return (
    <div className="flex flex-col h-full px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full space-y-5"
      >
        {/* ─── Hero: What this app does ─── */}
        <div className="text-center space-y-3 pb-2">
          <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-ds-accent/25 to-ds-emerald/15 border border-ds-accent/20">
            <Presentation className="w-7 h-7 text-ds-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ds-text">Dashboard to Slides</h2>
            <p className="text-xs text-ds-text-muted mt-1 leading-relaxed">
              Record your dashboard workflow, capture screenshots,<br />
              and generate a PowerPoint — automatically.
            </p>
          </div>
        </div>

        {/* ─── How it works — always visible, numbered steps ─── */}
        <div className="rounded-xl border border-ds-border bg-ds-surface/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider">
            3 steps to your first deck
          </p>
          {[
            {
              num: '1',
              icon: Clapperboard,
              color: 'text-ds-accent',
              bg: 'bg-ds-accent/12',
              title: 'Record',
              desc: 'Click, scroll, and navigate your dashboard',
            },
            {
              num: '2',
              icon: Camera,
              color: 'text-ds-emerald',
              bg: 'bg-ds-emerald/12',
              title: 'Capture',
              desc: 'Select regions to screenshot as slides',
            },
            {
              num: '3',
              icon: Play,
              color: 'text-ds-cyan',
              bg: 'bg-ds-cyan/12',
              title: 'Run',
              desc: 'Auto-replays everything and builds your PPTX',
            },
          ].map((step) => (
            <div key={step.num} className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${step.bg} shrink-0`}>
                <step.icon className={`w-4 h-4 ${step.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ds-text">{step.title}</p>
                <p className="text-xs text-ds-text-dim">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Primary CTA: Create new report ─── */}
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
          <button
            onClick={() => setShowNewDialog(true)}
            className="w-full flex items-center justify-center gap-3 px-5 rounded-xl bg-ds-accent text-white font-bold text-sm shadow-lg shadow-ds-accent/25 hover:bg-ds-accent-hover transition-all"
            style={{ height: '48px', borderRadius: '12px' }}
          >
            <Plus className="w-5 h-5" />
            Create New Report
            <ArrowRight className="w-4 h-4 ml-1 opacity-60" />
          </button>
        </motion.div>

        {/* ─── Existing reports ─── */}
        {hasExisting && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ds-text-dim uppercase tracking-wider px-1">
              Your Reports ({flows.length})
            </p>
            <div className="space-y-1.5">
              {flows.map(flow => (
                <motion.button
                  key={flow.id}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  onClick={() => setActiveFlow(flow.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ds-surface border border-ds-border hover:border-ds-accent/30 hover:bg-ds-surface-hover transition-all text-left group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-ds-accent/10 group-hover:bg-ds-accent/20 transition-colors shrink-0">
                    <Presentation className="w-4 h-4 text-ds-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ds-text truncate">{flow.name}</p>
                    <p className="text-xs text-ds-text-dim">
                      {flow.steps.length} action{flow.steps.length !== 1 ? 's' : ''}
                      {flow.steps.filter(s => s.type === 'SNAP').length > 0 &&
                        ` · ${flow.steps.filter(s => s.type === 'SNAP').length} slide${flow.steps.filter(s => s.type === 'SNAP').length !== 1 ? 's' : ''}`
                      }
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ds-text-dim group-hover:text-ds-accent transition-colors" />
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Import ─── */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-ds-text-dim"
          onClick={() => importFlow()}
        >
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          Import Report from JSON
        </Button>
      </motion.div>

      {/* New report dialog */}
      <Dialog.Root open={showNewDialog} onOpenChange={setShowNewDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed top-0 left-0 bottom-0 w-[var(--sidebar-w,380px)] bg-black/60 z-50" />
          <Dialog.Content className="fixed top-1/2 left-[calc(var(--sidebar-w,380px)/2)] -translate-x-1/2 -translate-y-1/2 w-[340px] bg-ds-surface border border-ds-border rounded-xl p-5 z-50 shadow-2xl">
            <Dialog.Title className="text-sm font-bold text-ds-text mb-1">
              Name Your Report
            </Dialog.Title>
            <Dialog.Description className="text-xs text-ds-text-dim mb-4">
              What dashboard are you capturing? This becomes your deck title.
            </Dialog.Description>
            <Input
              icon={<FileText className="w-3.5 h-3.5" />}
              value={newFlowName}
              onChange={e => setNewFlowName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g., Weekly Revenue Report"
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
