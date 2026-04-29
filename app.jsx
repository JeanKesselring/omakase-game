// app.jsx — Omakase landing

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#E4525A",
  "startUrl": "game.html",
  "youtubeId": "dQw4w9WgXcQ",
  "shopUrl": "https://omakasegame.com"
} /*EDITMODE-END*/;

// IS-MCTS+ only — three difficulty tiers by simulation budget
const OPPONENTS = [
  { id: 'easy',     name: 'Easy',     jp: '初',  difficulty: 1, sims: 500  },
  { id: 'advanced', name: 'Advanced', jp: '中',  difficulty: 2, sims: 2000 },
  { id: 'expert',   name: 'Expert',   jp: '達',  difficulty: 3, sims: 6000 },
];

function DifficultyDots({ level, max = 3 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5 }}>
      {Array.from({ length: max }, (_, i) =>
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: i < level ? 'var(--salmon)' : 'rgba(27,30,46,0.15)'
        }} />
      )}
    </span>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selected, setSelected] = React.useState('advanced');

  React.useEffect(() => {
    document.documentElement.style.setProperty('--salmon', t.accent);
  }, [t.accent]);

  const handleStart = React.useCallback(() => {
    const op = OPPONENTS.find(o => o.id === selected);
    const url = `${t.startUrl}?opponent=${selected}&sims=${op.sims}`;
    if (t.startUrl && t.startUrl !== 'game.html') {
      window.location.href = url;
    } else {
      alert(`Starting match vs. ${op?.name} (${op?.sims} sims)\n→ ${url}`);
    }
  }, [t.startUrl, selected]);

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 32px 80px' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 56 }}>
        <img src="cards/favicon.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain', display: 'block' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.28em', color: 'var(--ink)' }}>OMAKASE</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Select, swap, sabotage
            <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
            <a href={t.shopUrl} target="_blank" rel="noreferrer" style={{
              color: 'var(--salmon)', fontWeight: 600, textDecoration: 'none',
              borderBottom: '1px solid currentColor', paddingBottom: 1
            }}>Get the physical game →</a>
          </div>
        </div>
      </header>

      {/* Title */}
      <h1 style={{
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 'clamp(72px, 12vw, 128px)',
        lineHeight: 0.9, letterSpacing: '-0.04em', fontWeight: 900,
        marginBottom: 40, color: 'var(--ink)'
      }}>
        Omakase
      </h1>

      {/* Play CTA — above opponent picker */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
        <button className="btn btn-salmon btn-lg" onClick={handleStart}>
          Play <span style={{ fontSize: 18 }}>→</span>
        </button>
        <a className="btn btn-ghost btn-lg" href="https://omakasegame.com/pages/rules" target="_blank" rel="noreferrer">
          Rules &amp; sets
        </a>
      </div>

      {/* Opponent picker */}
      <section style={{ marginBottom: 64 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)'
        }}>
          {OPPONENTS.map(op => {
            const active = op.id === selected;
            return (
              <button key={op.id} onClick={() => setSelected(op.id)} style={{
                position: 'relative', textAlign: 'left',
                background: active ? 'var(--cream-soft)' : 'var(--paper)',
                border: 0, padding: '20px 18px',
                fontFamily: 'inherit', color: 'inherit', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 12
              }}>
                {active && <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: 'var(--salmon)'
                }} />}

                <div style={{ marginTop: 'auto' }}>
                  <div style={{
                    fontFamily: "'Hiragino Mincho ProN', serif",
                    fontSize: 20, color: 'var(--peri-deep)', lineHeight: 1, marginBottom: 6
                  }}>{op.jp}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{op.name}</div>
                  <DifficultyDots level={op.difficulty} max={3} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

{/* Tutorial */}
      <section>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14
        }}>Tutorial</div>
        <div style={{
          position: 'relative', aspectRatio: '16 / 9',
          background: '#000', overflow: 'hidden', border: '1px solid var(--ink)'
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
        <TweakColor label="Accent" value={t.accent} onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Links" />
        <TweakText label="Start URL" value={t.startUrl} onChange={(v) => setTweak('startUrl', v)} />
        <TweakText label="Shop URL" value={t.shopUrl} onChange={(v) => setTweak('shopUrl', v)} />
        <TweakText label="YouTube ID" value={t.youtubeId} onChange={(v) => setTweak('youtubeId', v)} />
      </TweaksPanel>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
