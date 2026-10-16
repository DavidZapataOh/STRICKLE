/** A real fieldset of radio inputs drawn as large tap targets; the selected state is a shape and a border, not a color alone. */
export function ChoiceGroup<T extends string | number>({ name, legend, options, value, onChange, error }: { name: string; legend: string; options: { value: T; label: string; hint?: string }[]; value: T | null; onChange: (value: T) => void; error?: string }) {
  const errorId = `${name}-error`;
  return (
    <fieldset className="choices" aria-describedby={error ? errorId : undefined}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={String(option.value)} className="choice" data-selected={value === option.value}>
          <input type="radio" name={name} value={String(option.value)} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span className="choice-mark" aria-hidden />
          <span className="choice-text">
            <span className="choice-label">{option.label}</span>
            {option.hint ? <span className="choice-hint">{option.hint}</span> : null}
          </span>
        </label>
      ))}
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
