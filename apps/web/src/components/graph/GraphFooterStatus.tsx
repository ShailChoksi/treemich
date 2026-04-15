type Props = {
  status: string | null;
  busy: boolean;
};

export const GraphFooterStatus = ({ status, busy }: Props) => {
  return (
    <>
      {status ? <p>{status}</p> : null}
      {busy ? <p>Saving relationship...</p> : null}
    </>
  );
};
