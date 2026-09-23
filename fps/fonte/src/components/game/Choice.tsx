import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface ChoiceOption { value: string; label: string; disabled?: boolean; hint?: string }

/* Linha de escolha única no visual do jogo (ToggleGroup do shadcn/Radix). */
export function Choice({ label, value, options, onChange, vertical }: {
  label?: string; value: string; options: ChoiceOption[]; onChange: (v: string) => void; vertical?: boolean
}) {
  return (
    <div className="lo-row">
      {label && <div className="diff-label">{label}</div>}
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={v => { if (v) onChange(v) }}
        className={'diff-row' + (vertical ? ' flex-col items-stretch' : '')}
      >
        {options.map(o => (
          <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} className="diff" title={o.hint}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/* Linha de múltipla escolha com limite (acessórios, vantagens). */
export function MultiChoice({ label, values, options, onToggle }: {
  label: string; values: string[]; options: ChoiceOption[]; onToggle: (v: string) => void
}) {
  return (
    <div className="lo-row">
      <div className="diff-label">{label}</div>
      <ToggleGroup type="multiple" value={values} className="diff-row">
        {options.map(o => (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>
              <span>
                <ToggleGroupItem value={o.value} disabled={o.disabled} className="diff tog"
                  onClick={() => onToggle(o.value)}>
                  {o.label}
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            {o.hint && <TooltipContent className="max-w-64 text-xs">{o.hint}</TooltipContent>}
          </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  )
}
