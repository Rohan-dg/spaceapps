import { Copy, Download } from 'lucide-react';
import { useState } from 'react';
import type { SiteData } from '../lib/data';
import { scenarioRecord, toCSV } from '../lib/export';
import type { ScenarioResult } from '../lib/useScenario';

/** Downloads where the browser allows; otherwise shows the text to copy (sandboxed previews block downloads). */
export default function Export({ d, r }: { d: SiteData; r: ScenarioResult }) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const go = (fmt: 'csv' | 'json') => {
    const rec = scenarioRecord(d, r);
    const body = fmt === 'csv' ? toCSV([rec]) : JSON.stringify(rec, null, 2);
    const name = `${rec.site_id}_${rec.time_utc.slice(0, 16).replace(/[:T]/g, '-')}.${fmt}`;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: fmt === 'csv' ? 'text/csv' : 'application/json' }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { /* ignore: fall back to the text box */ }
    setText(body); setCopied(false);
  };
  return (
    <div className="export">
      <span>Take these numbers with you</span>
      <button onClick={() => go('csv')}><Download size={14} aria-hidden /> CSV</button>
      <button onClick={() => go('json')}><Download size={14} aria-hidden /> JSON</button>
      {text && (
        <div className="export-box">
          <textarea id="export-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} aria-label="Exported data" />
          <div className="btn-group">
            <button onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}><Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy'}</button>
            <button onClick={() => setText(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
