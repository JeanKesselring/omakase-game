// app.jsx — Omakase landing (minimal)
// Only the essentials: heading, opponent picker, rules link, tutorial, play CTA.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#E4525A",
  "startUrl": "game.html",
  "youtubeId": "dQw4w9WgXcQ",
  "rulesUrl": "uploads/RulesV.2.pdf"
} /*EDITMODE-END*/;

const OPPONENTS = [
{ id: 'apprentice', name: 'The Apprentice', jp: '見習い', tab: 'nori', difficulty: 1, model: 'Haiku' },
{ id: 'belt-watcher', name: 'The Belt Watcher', jp: '回し手', tab: 'peri', difficulty: 2, model: 'Haiku' },
{ id: 'set-collector', name: 'The Set Collector', jp: '揃え屋', tab: 'mustard', difficulty: 3, model: 'Sonnet' },
{ id: 'shoyu-shark', name: 'The Shoyu Shark', jp: '醤油鮫', tab: 'salmon', difficulty: 4, model: 'Opus' }];


function JpTab({ children, kind = '' }) {
  return <span className={`jp-tab ${kind}`}>{children}</span>;
}

function DifficultyDots({ level }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) =>
      <span key={i} style={{
        width: 6, height: 6, borderRadius: '50%',
        background: i <= level ? 'var(--salmon)' : 'rgba(27,30,46,0.18)'
      }} />
      )}
    </span>);

}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selected, setSelected] = React.useState('belt-watcher');

  React.useEffect(() => {
    document.documentElement.style.setProperty('--salmon', t.accent);
  }, [t.accent]);

  const handleStart = React.useCallback(() => {
    const url = `${t.startUrl}?opponent=${selected}`;
    if (t.startUrl && t.startUrl !== 'game.html') {
      window.location.href = url;
    } else {
      const op = OPPONENTS.find((o) => o.id === selected);
      alert(`Starting match against ${op?.name}\n→ ${url}`);
    }
  }, [t.startUrl, selected]);

  const sel = OPPONENTS.find((o) => o.id === selected);

  return (
    <main style={{
      maxWidth: 880, margin: '0 auto', padding: '64px 32px 80px'
    }}>
      {/* Heading */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 56
      }}>
        <img src="assets/logo.png" alt="" style={{
          width: 44, height: 44, objectFit: 'contain', display: 'block'
        }} />
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.28em',
            color: 'var(--ink)'
          }}>OMAKASE<span style={{ color: 'var(--salmon)' }}></span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>A sushi card game · 2–4 players · 30 min

          </div>
        </div>
      </header>

      {/* Title */}
      <h1 style={{
        fontSize: 'clamp(56px, 9vw, 104px)',
        lineHeight: 0.95, letterSpacing: '-0.04em', fontWeight: 800,
        marginBottom: 20, color: "rgb(0, 0, 0)"
      }}>
        Oma<span style={{ color: "rgb(0, 0, 0)" }}>k</span>ase<span style={{ color: 'var(--salmon)' }}></span>
      </h1>
      <p style={{
        fontSize: 18, lineHeight: 1.5, color: 'var(--body)',
        maxWidth: 560, marginBottom: 40
      }}>
        Collect sushi off the conveyor belt. Build the Omakase Set for ¥6,000 — or get there first and call the check.
      </p>

      {/* Opponent picker */}
      <section style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14
        }}>Opponent</div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1, background: 'var(--rule)',
          border: '1px solid var(--rule)'
        }}>
          {OPPONENTS.map((op) => {
            const active = op.id === selected;
            return (
              <button key={op.id}
              onClick={() => setSelected(op.id)}
              style={{
                position: 'relative',
                textAlign: 'left',
                background: active ? 'var(--cream-soft)' : 'var(--paper)',
                border: 0, padding: '18px 16px',
                fontFamily: 'inherit', color: 'inherit', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 10, minHeight: 150
              }}>
                {active &&
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: 'var(--salmon)'
                }} />
                }
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <JpTab kind={op.tab}>{op.jp.charAt(0)}</JpTab>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                    color: 'var(--muted)', textTransform: 'uppercase'
                  }}>{op.model}</span>
                </div>
                <div style={{
                  fontFamily: "'Hiragino Mincho ProN', serif",
                  fontSize: 22, color: 'var(--peri-deep)', lineHeight: 1
                }}>{op.jp}</div>
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                    {op.name}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <DifficultyDots level={op.difficulty} />
                  </div>
                </div>
              </button>);

          })}
        </div>
      </section>

      {/* Play CTA + rules link */}
      <div style={{
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        marginBottom: 64
      }}>
        <button className="btn btn-salmon btn-lg" onClick={handleStart}>
          Play vs. {sel.name} <span style={{ fontSize: 18 }}>→</span>
        </button>
        <a className="btn btn-ghost btn-lg" href={t.rulesUrl} target="_blank" rel="noreferrer">
          Read the rules
        </a>
      </div>

      {/* Tutorial */}
      <section>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14
        }}>Tutorial</div>
        <div style={{
          position: 'relative', aspectRatio: '16 / 9',
          background: '#000', overflow: 'hidden',
          border: '1px solid var(--ink)'
        }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${t.youtubeId}?rel=0&modestbranding=1`}
            title="Omakase tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
          
        </div>
      </section>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
        onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Links" />
        <TweakText label="Start URL" value={t.startUrl}
        onChange={(v) => setTweak('startUrl', v)} />
        <TweakText label="Rules URL" value={t.rulesUrl}
        onChange={(v) => setTweak('rulesUrl', v)} />
        <TweakText label="YouTube ID" value={t.youtubeId}
        onChange={(v) => setTweak('youtubeId', v)} />
      </TweaksPanel>
    </main>);

}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);