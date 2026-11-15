/**
 * Help assistant: a chat panel backed by the on-device model in lib/assistant.ts (no network, no usage cost),
 * with a "Talk to a person" option that is always one click away.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { answer, buildModel, type Action, type SiteRef } from '../lib/assistant';
import { SUPPORT } from '../config/support';
import { ArrowRight, CircleHelp, X } from './Icons';

interface Msg { from: 'user' | 'bot'; text: string; actions?: Action[]; support?: boolean }
interface Props { sites: SiteRef[]; onAction: (a: Action) => void }

const SUGGEST = ['What is this site?', 'Compare two missions', 'Best launch time', 'Show me Malapert', 'How do I use the 3D Moon?', 'Talk to a person'];
const WELCOME: Msg = { from: 'bot', text: 'Hi, I am the Sol Teris helper. Ask me how anything on this site works, or tell me where to go ("show me Apollo 15", "open the launch planner").' };

function SupportCard() {
  const [copied, setCopied] = useState('');
  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => setCopied(v), () => setCopied(''));
  };
  return (
    <div className="as-support" role="group" aria-label="Talk to a person">
      <b>Talk to a person</b>
      <p>{SUPPORT.team[0].toUpperCase() + SUPPORT.team.slice(1)} reads every support request. Describe what you were trying to do and what happened.</p>
      <a className="as-support-btn" href={SUPPORT.issuesUrl} target="_blank" rel="noreferrer">Open a support request <ArrowRight size={14} /></a>
      {SUPPORT.email && <p className="as-contact">Email <span className="as-sel">{SUPPORT.email}</span> <button onClick={() => copy(SUPPORT.email)}>{copied === SUPPORT.email ? 'Copied' : 'Copy'}</button></p>}
      {SUPPORT.phone && <p className="as-contact">Phone <span className="as-sel">{SUPPORT.phone}</span> <button onClick={() => copy(SUPPORT.phone)}>{copied === SUPPORT.phone ? 'Copied' : 'Copy'}</button></p>}
      {SUPPORT.hours && <p className="as-contact">Hours {SUPPORT.hours}</p>}
    </div>
  );
}

export default function AssistantChat({ sites, onAction }: Props) {
  const model = useMemo(() => buildModel(), []);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [q, setQ] = useState('');
  const [misses, setMisses] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, open]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const r = answer(model, t, sites);
    const miss = r.topic === null && !r.site;
    const n = miss ? misses + 1 : 0;
    setMisses(n);
    // after two questions in a row it cannot answer, put the person option front and centre
    const support = r.support || n >= 2;
    setMsgs((m) => [...m, { from: 'user', text: t }, { from: 'bot', text: n >= 2 && !r.support ? `${r.text} It looks like I am not the right help here, so here is how to reach a person.` : r.text, actions: r.actions.filter((a) => a.type !== 'support'), support }]);
    setQ('');
    // a plain navigation request ("show me Malapert") acts straight away
    if (r.site && r.actions[0]?.type === 'site' && r.topic === null) onAction(r.actions[0]);
  };

  const act = (a: Action) => {
    if (a.type === 'support') { setMsgs((m) => [...m, { from: 'bot', text: 'Here is how to reach a person.', support: true }]); return; }
    onAction(a);
  };

  return (
    <>
      {!open && (
        <button className="as-launch" onClick={() => setOpen(true)} aria-label="Open help: ask a question or talk to a person">
          <CircleHelp size={18} /> <span>Need help?</span>
        </button>
      )}
      {open && (
        <section className="as" role="dialog" aria-label="Sol Teris help">
          <header className="as-head">
            <div>
              <b>Sol Teris help</b>
              <small>Runs on your device. Nothing you type is sent anywhere.</small>
            </div>
            <button className="as-close" onClick={() => setOpen(false)} aria-label="Close help"><X size={16} /></button>
          </header>
          <button className="as-person" onClick={() => act({ type: 'support', label: '' })}>Need a person? Talk to the team <ArrowRight size={14} /></button>
          <div className="as-log" ref={log} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`as-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="as-actions">{m.actions.map((a, k) => <button key={k} onClick={() => act(a)}>{a.label}</button>)}</div>
                )}
                {m.support && <SupportCard />}
              </div>
            ))}
            {msgs.length === 1 && (
              <div className="as-chips" aria-label="Suggestions">{SUGGEST.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
            )}
          </div>
          <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input id="as-input" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this site…" autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }} />
            <button type="submit" disabled={!q.trim()} aria-label="Send">Ask</button>
          </form>
        </section>
      )}
    </>
  );
}
