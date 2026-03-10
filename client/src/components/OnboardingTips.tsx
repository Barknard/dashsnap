import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Globe, MousePointer2, Play, X } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useFlowStore } from '@/stores/flowStore';
import { useAppStore } from '@/stores/appStore';

const TIPS = [
  { icon: MousePointer2, text: 'Click stable elements like labels and named buttons — they survive page updates better.' },
  { icon: Globe, text: 'Navigate to your dashboard first, then start recording. DashSnap inherits your login session.' },
  { icon: Play, text: 'Use "Test Step" to verify a single step works before running the full flow.' },
  { icon: Lightbulb, text: 'Add a Wait step after each Click to give dashboards time to load new data.' },
  { icon: Lightbulb, text: 'Export flows as JSON to share with teammates — they can import them in one click.' },
  { icon: Lightbulb, text: 'DashSnap uses your Windows session for SSO. No passwords are ever stored.' },
  { icon: Lightbulb, text: 'Screenshots capture only the region you select — perfect for embedding specific charts.' },
  { icon: Lightbulb, text: 'Set a PowerPoint template in Settings to match your company\'s brand automatically.' },
];

export function RotatingTip() {
  const showTips = useAppStore(s => s.settings.showTips);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!showTips) return;
    const interval = setInterval(() => {
      setTipIndex(i => (i + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [showTips]);

  if (!showTips) return null;

  const tip = TIPS[tipIndex];
  const TipIcon = tip.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tipIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3 }}
        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-ds-accent/5 border border-ds-accent/10"
      >
        <TipIcon className="w-3.5 h-3.5 text-ds-accent mt-0.5 shrink-0" />
        <p className="text-sm text-ds-text-muted leading-relaxed">{tip.text}</p>
      </motion.div>
    </AnimatePresence>
  );
}

export function WelcomeCard() {
  const flows = useFlowStore(s => s.flows);
  const [dismissed, setDismissed] = useState(false);

  if (flows.length > 0 || dismissed) return null;

  const steps = [
    { num: '1', icon: Globe, title: 'Navigate', desc: 'Open your dashboard in the browser panel' },
    { num: '2', icon: MousePointer2, title: 'Record', desc: 'Click elements and draw screenshot regions' },
    { num: '3', icon: Play, title: 'Run', desc: 'Auto-generate your PowerPoint deck' },
  ];

  return (
    <Card className="relative mx-1 mb-3 p-4 bg-gradient-to-br from-ds-accent/10 via-ds-surface to-ds-cyan/5 border-ds-accent/20">
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2 text-ds-text-dim"
        onClick={() => setDismissed(true)}
      >
        <X className="w-3.5 h-3.5" />
      </Button>

      <h3 className="text-sm font-bold text-ds-text mb-0.5">Welcome to DashSnap</h3>
      <p className="text-sm text-ds-text-muted mb-3">
        Turn any dashboard into a PowerPoint in 3 steps:
      </p>

      <div className="space-y-2.5">
        {steps.map((step) => (
          <div key={step.num} className="flex items-center gap-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-ds-accent/15 border border-ds-accent/25 shrink-0">
              <step.icon className="w-3.5 h-3.5 text-ds-accent" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ds-text leading-none">{step.title}</p>
              <p className="text-xs text-ds-text-dim leading-tight mt-0.5">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
