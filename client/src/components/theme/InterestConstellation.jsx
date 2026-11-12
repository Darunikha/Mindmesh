import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext.jsx';

/** Deterministic pseudo-random from a string, so layouts are stable between renders. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * A small radial map of the user's interests around their name.
 * It previews the knowledge graph using the user's real onboarding topics.
 */
export default function InterestConstellation({ name, interests = [], width = 420, height = 260 }) {
  const { theme } = useTheme();
  const cx = width / 2;
  const cy = height / 2;

  const nodes = useMemo(() => {
    const list = interests.slice(0, 10);
    return list.map((label, i) => {
      const angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2 + hash(label) * 0.5;
      const ring = 0.62 + hash(`${label}r`) * 0.32;
      return {
        label,
        x: cx + Math.cos(angle) * (width * 0.4) * ring,
        y: cy + Math.sin(angle) * (height * 0.4) * ring,
        tone: i % 3,
      };
    });
  }, [interests, cx, cy, width, height]);

  // A few neighbour links so the shape reads as a mesh, not a star.
  const links = nodes.length > 2 ? nodes.map((n, i) => [n, nodes[(i + 1) % nodes.length]]).filter((_, i) => i % 2 === 0) : [];
  const toneColor = ['var(--mm-accent)', 'var(--mm-accent-2)', 'var(--mm-accent-3)'];
  const label = theme === 'lab' ? (name || 'you').toUpperCase() : name || 'You';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label={`Your interests: ${interests.join(', ') || 'none yet'}`}>
      {theme === 'lab' && (
        <g stroke="var(--mm-line)" fill="none">
          <circle cx={cx} cy={cy} r={height * 0.22} />
          <circle cx={cx} cy={cy} r={height * 0.42} strokeDasharray="2 5" />
        </g>
      )}
      {theme === 'library' && (
        <circle cx={cx} cy={cy} r={height * 0.44} fill="none" stroke="var(--mm-line-strong)" strokeDasharray="1 4" />
      )}

      {nodes.map((n, i) => (
        <motion.line
          key={`s-${n.label}`}
          x1={cx}
          y1={cy}
          x2={n.x}
          y2={n.y}
          stroke={theme === 'studio' ? toneColor[n.tone] : 'var(--mm-line-strong)'}
          strokeOpacity={theme === 'studio' ? 0.35 : 1}
          strokeWidth={theme === 'studio' ? 2 : 1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }}
        />
      ))}
      {links.map(([a, b]) => (
        <line key={`l-${a.label}-${b.label}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--mm-line)" strokeDasharray={theme === 'lab' ? '3 3' : undefined} />
      ))}

      {nodes.map((n, i) => (
        <motion.g key={n.label} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 + i * 0.06 }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
          {theme === 'lab' && <circle cx={n.x} cy={n.y} r={9} fill={toneColor[n.tone]} opacity={0.12} />}
          <circle
            cx={n.x}
            cy={n.y}
            r={theme === 'studio' ? 7 : 4.5}
            fill={theme === 'library' ? 'var(--mm-surface)' : toneColor[n.tone]}
            stroke={theme === 'library' ? toneColor[n.tone] : 'none'}
            strokeWidth={1.5}
          />
          <text
            x={n.x}
            y={n.y + (n.y < cy ? -12 : 20)}
            textAnchor="middle"
            fill="var(--mm-ink-muted)"
            style={{
              fontFamily: theme === 'lab' ? 'var(--mm-font-mono)' : 'var(--mm-font-ui)',
              fontSize: theme === 'lab' ? 9.5 : 11.5,
              fontStyle: theme === 'library' ? 'italic' : 'normal',
              letterSpacing: theme === 'lab' ? '0.06em' : 0,
            }}
          >
            {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
          </text>
        </motion.g>
      ))}

      <g>
        <circle cx={cx} cy={cy} r={theme === 'studio' ? 26 : 22} fill="var(--mm-accent)" />
        {theme === 'lab' && <circle cx={cx} cy={cy} r={30} fill="none" stroke="var(--mm-accent)" strokeOpacity="0.35" />}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="var(--mm-accent-ink)"
          style={{
            fontFamily: theme === 'lab' ? 'var(--mm-font-mono)' : 'var(--mm-font-display)',
            fontSize: theme === 'lab' ? 8.5 : 12,
            fontWeight: 700,
            fontStyle: theme === 'library' ? 'italic' : 'normal',
          }}
        >
          {label.length > 8 ? `${label.slice(0, 7)}…` : label}
        </text>
      </g>
    </svg>
  );
}
