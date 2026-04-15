import { Html } from "@react-three/drei";

export type AddRelativeSlot = "parent" | "siblingOrSpouse" | "child";

type Props = {
  onOpen: (slot: AddRelativeSlot) => void;
};

const stop = (event: { stopPropagation: () => void }) => {
  event.stopPropagation();
};

export const NodeActionButtons = ({ onOpen }: Props) => {
  return (
    <>
      <Html position={[0, 1.3, 0.1]} center zIndexRange={[20, 0]}>
        <button
          type="button"
          className="node-action-btn"
          title="Add parent"
          aria-label="Add parent"
          onMouseDown={stop}
          onClick={(event) => {
            stop(event);
            onOpen("parent");
          }}
        >
          +
        </button>
      </Html>
      <Html position={[1.3, 0, 0.1]} center zIndexRange={[20, 0]}>
        <button
          type="button"
          className="node-action-btn"
          title="Add sibling or spouse"
          aria-label="Add sibling or spouse"
          onMouseDown={stop}
          onClick={(event) => {
            stop(event);
            onOpen("siblingOrSpouse");
          }}
        >
          +
        </button>
      </Html>
      <Html position={[0, -1.5, 0.1]} center zIndexRange={[20, 0]}>
        <button
          type="button"
          className="node-action-btn"
          title="Add child"
          aria-label="Add child"
          onMouseDown={stop}
          onClick={(event) => {
            stop(event);
            onOpen("child");
          }}
        >
          +
        </button>
      </Html>
    </>
  );
};
