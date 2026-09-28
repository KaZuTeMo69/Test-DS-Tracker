import { ReactNode, useState } from "react";

/** A button that asks for a second click before it acts, so a stray tap can't delete anything. */
export default function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
  title,
}: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`${className} ${armed ? "armed" : ""}`}
      title={title}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
