type ProgressProps = {
  value: number;
};

export function Progress({ value }: ProgressProps) {
  const width = `${Math.max(0, Math.min(100, value * 100))}%`;
  return (
    <div className="progress" aria-label="Progress">
      <span style={{ width }} />
    </div>
  );
}

