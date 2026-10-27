import type { Briefing } from '@/day/useBriefing'
import { IconFood, IconShirt, IconSun, IconWind } from './Icons'
import { List, Row, RowIcon, Section, Sheet } from './Chrome'
import { num } from '@/lib/format'
import { useT } from '@/i18n/react'

/** Odprawa przed jazdą: pogoda w oknie treningu, uwagi, ubiór i jedzenie. */
export function BriefingSheet({ b, onClose, onIndoor }: { b: Briefing; onClose: () => void; onIndoor?: () => void }) {
  const s = b.summary
  const tx = useT().ios.briefing
  return (
    <Sheet title={tx.title} onClose={onClose}>
      <Section header={tx.weatherHeader} footer={s ? tx.weatherFooter(b.location ?? '', b.startLabel, !!b.stale) : undefined}>
        <List>
          {s ? (
            <>
              <Row icon={<RowIcon color="var(--orange)"><IconSun size={18} /></RowIcon>} title={tx.feelsLike} value={`${num(s.feels_c, 0)} °C`} subtitle={tx.thermometer(num(s.temp_min_c, 0), num(s.temp_max_c, 0), b.label ?? '')} />
              <Row icon={<RowIcon color="var(--teal)"><IconWind size={18} /></RowIcon>} title={tx.wind} value={`${s.wind_kmh} km/h`} subtitle={s.gust_kmh >= 40 ? tx.gusts(s.gust_kmh) : undefined} />
              <Row icon={<RowIcon color="var(--blue)"><IconWind size={18} /></RowIcon>} title={tx.rain} value={`${s.precip_prob} %`} subtitle={tx.sunset(s.sunset)} />
            </>
          ) : (
            <Row
              title={b.loading ? tx.loading : b.location === null ? tx.noLocation : tx.noForecast}
              subtitle={b.loading ? undefined : b.location === null ? tx.noLocationSub : tx.noForecastSub}
            />
          )}
        </List>
      </Section>

      {b.advice.length > 0 && (
        <Section header={tx.advice}>
          <List>
            {b.advice.map((a) => (
              <Row
                key={a.kind}
                wrap
                title={a.message}
                accessory={
                  a.action && onIndoor ? (
                    <button className="ios-btn ios-btn-tinted ios-btn-sm" onClick={onIndoor}>
                      {tx.indoor}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </List>
        </Section>
      )}

      {b.clothing && (
        <Section header={tx.clothing(b.clothing.label)}>
          <List>
            {b.clothing.items.map((i) => (
              <Row key={i} icon={<RowIcon color="var(--indigo)"><IconShirt size={18} /></RowIcon>} title={i} />
            ))}
          </List>
        </Section>
      )}

      {b.fuel && (
        <Section header={tx.fuel} footer={b.fuel.note}>
          <List>
            <Row
              icon={<RowIcon color="var(--green)"><IconFood size={18} /></RowIcon>}
              title={tx.carbs}
              value={b.fuel.carbs_g[1] > 0 ? `${b.fuel.carbs_g[0]}–${b.fuel.carbs_g[1]} g` : tx.carbsNone}
              subtitle={b.fuel.carbs_g[1] > 0 ? tx.portions(b.fuel.portions) : tx.shortRide}
            />
            <Row icon={<RowIcon color="var(--blue)"><IconFood size={18} /></RowIcon>} title={tx.fluids} value={`${b.fuel.fluid_ml[0]}–${b.fuel.fluid_ml[1]} ml`} subtitle={b.fuel.fluid_ml[1] > 1000 ? tx.twoBottles : tx.oneBottle} />
          </List>
        </Section>
      )}
    </Sheet>
  )
}
