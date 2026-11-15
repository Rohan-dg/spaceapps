/**
 * Help assistant: a chat panel backed by the on-device model in lib/assistant.ts (no network, no usage cost).
 * Answers are grounded in what is on screen (the selected site, its live Sun / Earth state and ratings, the time,
 * the tab, a second site picked for comparison), it "types" for a moment before replying, and "Talk to a person"
 * opens a support queue window (a placeholder: no live-agent backend is connected yet).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { answer, buildModel, type Action, type Reply, type SiteRef } from '../lib/assistant';
import { SUPPORT } from '../config/support';
import { ArrowRight, CircleHelp, X } from './Icons';

/** What the helper knows about the current screen. Every field is optional: the helper only uses what is there. */
export interface HelpContext {
  mode?: string;
  when?: string; // "2027-07-08 00:00 UTC"
  site?: { name: string; short: string; lat: number; lon: number; heightM: number } | null;
  now?: { sunUp: boolean; sunEl: number; sunNext: string; earthUp: boolean; earthEl: number; earthNext: string } | null;
  ratings?: { power: string; comms: string; sunPct: number; earthPct: number; longestDarkH: number } | null;
  partner?: string | null;
}

interface Msg { id: number; from: 'user' | 'bot'; text: string; actions?: Action[]; support?: boolean; follow?: string[] }
interface Props { sites: SiteRef[]; onAction: (a: Action) => void; context?: HelpContext }

const SUGGEST = ['What is this site?', 'Is it sunlit right now?', 'Can it talk to Earth?', 'How good is this site?', 'Best launch time', 'Talk to a person'];
const WELCOME = "Hi! I'm Sol, your guide to this site. Ask me anything in your own words: about the landing site you're looking at, what a number means, or where to find something. I can also take you places, like \"show me Apollo 15\".";

/** Friendly next questions after each kind of answer, so there is always an easy way to keep going. */
const FOLLOW: Record<string, string[]> = {
  sunlit: ['Can it talk to Earth?', 'How good is this site?', 'Best landing dates'],
  earth: ['Is it sunlit right now?', 'How good is this site?', 'Why is Earth never visible?'],
  ratings: ['Is it sunlit right now?', 'Compare two sites', 'Best landing dates'],
  what: ['What is this site?', 'How do I pick a site?', 'How do I use the 3D Moon?'],
  calendar: ['How good is this site?', 'Best launch time', 'How do I change the date?'],
  missions: ['Compare two sites', 'What do the ratings mean?', 'Show me Malapert'],
  launch: ['Best landing dates', 'How good is this site?', 'Talk to a person'],
  greet: ['What is this site?', 'Is it sunlit right now?', 'How do I use the 3D Moon?'],
  thanks: ['How good is this site?', 'Compare two sites', 'Talk to a person'],
};
const FOLLOW_DEFAULT = ['What is this site?', 'Is it sunlit right now?', 'How good is this site?'];
const SMALL_TALK: [RegExp, string][] = [
  [/\b(how are you|how's it going|how are things)\b/i, "I'm doing great, thanks for asking! What would you like to know about the Moon?"],
  [/\b(who are you|what are you|your name)\b/i, "I'm Sol, a small helper that runs right here in your browser. I know this website inside out, and nothing you type leaves your device."],
  [/\b(bye|goodbye|see you|that's all|that is all)\b/i, 'Happy exploring! Open me again any time from the Need help? button.'],
  [/^(ok|okay|cool|nice|great|awesome|got it)[.!]*$/i, 'Great! Anything else you would like to look at?'],
];
const latlon = (lat: number, lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${(l > 180 ? 360 - l : l).toFixed(2)}° ${l > 180 ? 'W' : 'E'}`;
};

/** Ground a reply in the current screen: add the live numbers for the site in view where the topic calls for them. */
function withContext(r: Reply, q: string, c?: HelpContext): string {
  if (!c) return r.text;
  const s = c.site, n = c.now, g = c.ratings;
  const here = s ? s.short || s.name : null;
  const ql = q.toLowerCase();
  const id = r.topic?.id ?? '';
  const asksSite = /\b(this|current|here|it)\b/.test(ql) || /what is this site|where am i/.test(ql);
  const parts: string[] = [];
  if (here && n && (id === 'sunlit' || /sun|light|power|dark/.test(ql))) {
    parts.push(`Right now (${c.when}) ${here} is ${n.sunUp ? 'in sunlight' : 'in shadow'}: the Sun is at ${n.sunEl.toFixed(1)}° and ${n.sunNext}.`);
  }
  if (here && n && (id === 'earth' || /earth|radio|comm|talk/.test(ql))) {
    parts.push(`Earth is ${n.earthUp ? 'in view' : 'hidden'} from ${here} (${n.earthEl.toFixed(1)}° elevation) and ${n.earthNext}.`);
  }
  if (here && g && (id === 'ratings' || /rating|good|viable|safe|how .*site|worth/.test(ql))) {
    parts.push(`For the next lunar day ${here} rates ${g.power} for power (${g.sunPct.toFixed(0)}% sunlit, longest dark spell ${Math.round(g.longestDarkH)} h) and ${g.comms} for radio (${g.earthPct.toFixed(0)}% Earth in view).`);
  }
  if (s && (asksSite || id === 'what') && !parts.length) {
    parts.push(`You are looking at ${s.name}, ${latlon(s.lat, s.lon)}, ${Math.round(s.heightM)} m above the reference sphere.`);
    if (n) parts.push(`It is ${n.sunUp ? 'sunlit' : 'in shadow'} and Earth is ${n.earthUp ? 'in view' : 'hidden'} at ${c.when}.`);
  }
  if (c.partner && here && /compar|versus|vs\b|better/.test(ql)) parts.push(`You have ${c.partner} and ${here} picked: press Compare in Review site to see them side by side.`);
  if (id === 'time' && c.when) parts.push(`The time shown now is ${c.when}.`);
  if (!parts.length) return r.text;
  // a live answer leads; the general explanation follows for questions about how things work
  return r.topic && !asksSite ? `${parts.join(' ')} ${r.text}` : parts.join(' ');
}

/** "Talk to a person": a queue window. Placeholder only: the position counts down but no agent is connected. */
function QueueWindow({ onLeave }: { onLeave: () => void }) {
  const [pos, setPos] = useState(3);
  useEffect(() => {
    if (pos <= 1) return;
    const id = setTimeout(() => setPos((p) => p - 1), 6000);
    return () => clearTimeout(id);
  }, [pos]);
  return (
    <div className="as-queue" role="dialog" aria-label="Support queue">
      <div className="as-queue-card">
        <span className="as-queue-pulse" aria-hidden />
        <b>You're in the queue</b>
        <p className="as-queue-pos"><span className="num">{pos}</span>{pos === 1 ? ' You are next' : ' people ahead of you'}</p>
        <p className="as-queue-eta">Estimated wait about <span className="num">{pos * 2}</span> min</p>
        <div className="as-queue-bar" aria-hidden><i style={{ width: `${((4 - pos) / 3) * 100}%` }} /></div>
        <p className="as-queue-note">Live chat with the team is not connected yet. Meanwhile you can leave a request and we will get back to you.</p>
        <a className="as-support-btn" href={SUPPORT.issuesUrl} target="_blank" rel="noreferrer">Leave a support request <ArrowRight size={14} /></a>
        <button className="as-queue-leave" onClick={onLeave}>Leave the queue</button>
      </div>
    </div>
  );
}

export default function AssistantChat({ sites, onAction, context }: Props) {
  const model = useMemo(() => buildModel(), []);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: 'bot', text: WELCOME }]);
  const [typing, setTyping] = useState(false);
  const [queue, setQueue] = useState(false);
  const [q, setQ] = useState('');
  const [misses, setMisses] = useState(0);
  const nextId = useRef(1);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ctx = useRef(context);
  ctx.current = context;

  useEffect(() => { if (open && !closing) input.current?.focus(); }, [open, closing]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [msgs, typing, open]);

  const show = () => { setClosing(false); setOpen(true); };
  const hide = () => { setClosing(true); setTimeout(() => { setOpen(false); setClosing(false); }, 260); };
  const push = (m: Omit<Msg, 'id'>) => setMsgs((list) => [...list, { ...m, id: nextId.current++ }]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || typing) return;
    setQ('');
    push({ from: 'user', text: t });
    if (/talk to (a )?(person|human|someone)|real person|agent/i.test(t)) { setTyping(true); setTimeout(() => { setTyping(false); push({ from: 'bot', text: 'Connecting you to the team queue.' }); setQueue(true); }, 600); return; }
    const small = SMALL_TALK.find(([re]) => re.test(t));
    if (small) {
      setTyping(true);
      setTimeout(() => { setTyping(false); push({ from: 'bot', text: small[1], follow: FOLLOW_DEFAULT }); }, 500);
      return;
    }
    const r = answer(model, t, sites);
    const miss = r.topic === null && !r.site;
    const n = miss ? misses + 1 : 0;
    setMisses(n);
    const support = r.support || n >= 2;
    const body = miss
      ? "Hmm, I didn't quite catch that. I know this website best, so try asking it another way, or tap one of these:"
      : withContext(r, t, ctx.current);
    const reply = n >= 2 && !r.support ? "I'm sorry, I'm not the right help for this one. A person from the team can help you instead." : body;
    const follow = miss ? FOLLOW_DEFAULT : FOLLOW[r.topic?.id ?? ''] ?? FOLLOW_DEFAULT;
    // a short, length-scaled pause so the reply reads as considered rather than instant
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      push({ from: 'bot', text: reply, actions: r.actions.filter((a) => a.type !== 'support'), support, follow: follow.filter((f) => f.toLowerCase() !== t.toLowerCase()) });
      if (r.site && r.actions[0]?.type === 'site' && r.topic === null) onAction(r.actions[0]);
    }, Math.min(1400, 450 + reply.length * 4));
  };

  const act = (a: Action) => {
    if (a.type === 'support') { setQueue(true); return; }
    onAction(a);
  };

  return (
    <>
      {(!open || closing) && (
        <button className={`as-launch${closing ? ' back' : ''}`} onClick={show} aria-label="Open help: ask a question or talk to a person">
          <CircleHelp size={18} /> <span>Need help?</span>
        </button>
      )}
      {open && (
        <section className={`as${closing ? ' closing' : ''}`} role="dialog" aria-label="Sol Teris help">
          <header className="as-head">
            <div>
              <b>Sol Teris help</b>
              <small>{context?.site ? `Looking at ${context.site.short || context.site.name}` : 'Runs on your device. Nothing you type is sent anywhere.'}</small>
            </div>
            <button className="as-close" onClick={hide} aria-label="Close help"><X size={16} /></button>
          </header>
          <button className="as-person" onClick={() => setQueue(true)}>Need a person? Talk to the team <ArrowRight size={14} /></button>
          <div className="as-log" ref={log} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={m.id} className={`as-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="as-actions">{m.actions.map((a, k) => <button key={k} onClick={() => act(a)}>{a.label}</button>)}</div>
                )}
                {m.support && <button className="as-support-btn" onClick={() => setQueue(true)}>Talk to a person <ArrowRight size={14} /></button>}
                {m.follow && i === msgs.length - 1 && !typing && (
                  <div className="as-chips as-follow" aria-label="Suggested next questions">{m.follow.map((f) => <button key={f} onClick={() => ask(f)}>{f}</button>)}</div>
                )}
              </div>
            ))}
            {typing && <div className="as-msg bot as-typing" aria-label="Helper is typing"><p><i /><i /><i /></p></div>}
            {msgs.length === 1 && !typing && (
              <div className="as-chips" aria-label="Suggestions">{SUGGEST.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
            )}
          </div>
          <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input id="as-input" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={context?.site ? `Ask anything about ${context.site.short || context.site.name}…` : 'Ask me anything, in your own words…'} autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (queue) setQueue(false); else hide(); } }} />
            <button type="submit" disabled={!q.trim() || typing} aria-label="Send">Ask</button>
          </form>
          {queue && <QueueWindow onLeave={() => setQueue(false)} />}
        </section>
      )}
    </>
  );
}
