import type { Briefing } from '../useBriefing'
import { IconFood, IconShirt, IconSun, IconWind } from './Icons'
import { List, Row, RowIcon, Section, Sheet } from './Chrome'
import { num } from '@/lib/format'

/** Odprawa przed jazdą: pogoda w oknie treningu, uwagi, ubiór i jedzenie. */
export function BriefingSheet({ b, onClose, onIndoor }: { b: Briefing; onClose: () => void; onIndoor?: () => void }) {
  const s = b.summary
  return (
    <Sheet title="Odprawa" onClose={onClose}>
      <Section header="Pogoda na start" footer={s ? `${b.location}, start ${b.startLabel}${b.stale ? ' · prognoza z bufora (offline)' : ''}` : undefined}>
        <List>
          {s ? (
            <>
              <Row icon={<RowIcon color="var(--orange)"><IconSun size={18} /></RowIcon>} title="Odczuwalne" value={`${num(s.feels_c, 0)} °C`} subtitle={`termometr ${num(s.temp_min_c, 0)}–${num(s.temp_max_c, 0)} °C · ${b.label ?? ''}`} />
              <Row icon={<RowIcon color="var(--teal)"><IconWind size={18} /></RowIcon>} title="Wiatr" value={`${s.wind_kmh} km/h`} subtitle={s.gust_kmh >= 40 ? `porywy do ${s.gust_kmh} km/h` : undefined} />
              <Row icon={<RowIcon color="var(--blue)"><IconWind size={18} /></RowIcon>} title="Szansa na deszcz" value={`${s.precip_prob} %`} subtitle={`zachód słońca ${s.sunset}`} />
            </>
          ) : (
            <Row title={b.loading ? 'Pobieram prognozę…' : 'Brak prognozy na ten dzień'} subtitle={b.loading ? undefined : 'Ubiór i jedzenie liczę bez pogody.'} />
          )}
        </List>
      </Section>

      {b.advice.length > 0 && (
        <Section header="Uwagi">
          <List>
            {b.advice.map((a) => (
              <Row
                key={a.kind}
                wrap
                title={a.message}
                accessory={
                  a.action && onIndoor ? (
                    <button className="ios-btn ios-btn-tinted ios-btn-sm" onClick={onIndoor}>
                      Pod dachem
                    </button>
                  ) : undefined
                }
              />
            ))}
          </List>
        </Section>
      )}

      {b.clothing && (
        <Section header={`Ubiór · ${b.clothing.label.toLowerCase()}`}>
          <List>
            {b.clothing.items.map((i) => (
              <Row key={i} icon={<RowIcon color="var(--indigo)"><IconShirt size={18} /></RowIcon>} title={i} />
            ))}
          </List>
        </Section>
      )}

      {b.fuel && (
        <Section header="Jedzenie i picie" footer={b.fuel.note}>
          <List>
            <Row
              icon={<RowIcon color="var(--green)"><IconFood size={18} /></RowIcon>}
              title="Węglowodany"
              value={b.fuel.carbs_g[1] > 0 ? `${b.fuel.carbs_g[0]}–${b.fuel.carbs_g[1]} g` : 'bez'}
              subtitle={b.fuel.carbs_g[1] > 0 ? `≈ ${b.fuel.portions} porcje (żel, banan, 500 ml izotoniku ≈ 25 g)` : 'krótka jazda – nie trzeba jeść'}
            />
            <Row icon={<RowIcon color="var(--blue)"><IconFood size={18} /></RowIcon>} title="Płyny" value={`${b.fuel.fluid_ml[0]}–${b.fuel.fluid_ml[1]} ml`} subtitle={b.fuel.fluid_ml[1] > 1000 ? 'dwa bidony' : 'jeden bidon'} />
          </List>
        </Section>
      )}
    </Sheet>
  )
}
