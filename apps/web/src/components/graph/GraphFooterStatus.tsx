type Props = {
  status: string | null;
  busy: boolean;
};

export const GraphFooterStatus = ({ status, busy }: Props) => {
  return (
    <div aria-live="polite" role="status">
      {status ? <p>{status}</p> : null}
      {busy ? <p>Saving relationship...</p> : null}
    </div>
  );
};
