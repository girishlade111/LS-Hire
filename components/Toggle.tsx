type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 items-center rounded-full border border-border transition-colors duration-150 ${
        checked ? "bg-success" : "bg-panel-2"
      }${disabled ? " opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`ml-[2px] h-3.5 w-3.5 rounded-full bg-[#e8e8e8] transform transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : ""
        }`}
      />
    </button>
  );
}
