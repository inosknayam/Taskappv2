const NAMES = { green: 'Green', yellow: 'Yellow', orange: 'Orange', red: 'Red', purple: 'Purple', blue: 'Blue' };

export function labelName(label) {
  return NAMES[label] || label;
}

// Labels are shown as colour + text, so colour is never the only way information is conveyed.
export function LabelDots({ labels }) {
  if (!labels.length) return null;
  return (
    <span className="labels">
      {labels.map((l) => <span key={l} className={`label label-${l}`}>{labelName(l)}</span>)}
    </span>
  );
}
