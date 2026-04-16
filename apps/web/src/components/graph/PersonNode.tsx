import { Billboard, Text, useTexture } from "@react-three/drei";
import { memo, useEffect, useMemo } from "react";
import { CircleGeometry, RingGeometry, SRGBColorSpace, type BufferGeometry, type Texture } from "three";
import type { ImmichPerson } from "../../lib/api";
import { personThumbnailUrl } from "../../lib/api";

const applyCoverCrop = (texture: Texture) => {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;

  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  if (width > height) {
    const xRepeat = height / width;
    texture.repeat.set(xRepeat, 1);
    texture.offset.set((1 - xRepeat) / 2, 0);
  } else if (height > width) {
    const yRepeat = width / height;
    texture.repeat.set(1, yRepeat);
    texture.offset.set(0, (1 - yRepeat) / 2);
  }

  texture.needsUpdate = true;
};

export type PersonNodeProps = {
  person: ImmichPerson;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  onClick: (personId: string, event: { stopPropagation: () => void }) => void;
  onHover: (personId: string, hovered: boolean) => void;
};

const truncateName = (name: string, maxLength = 22) => {
  if (name.length <= maxLength) {
    return name;
  }
  return `${name.slice(0, maxLength - 1)}...`;
};

const ringColor = (isSelected: boolean, isHovered: boolean, isHighlighted: boolean) => {
  if (isSelected) return "#22d3ee";
  if (isHighlighted) return "#a78bfa";
  if (isHovered) return "#93c5fd";
  return "#64748b";
};

const nodeScale = (isSelected: boolean, isHovered: boolean, isHighlighted: boolean) => {
  if (isSelected) return 1.08;
  if (isHighlighted) return 0.9;
  if (isHovered) return 0.86;
  return 0.82;
};

const ringOuterRadius = (isSelected: boolean, isHighlighted: boolean) => {
  if (isSelected) return 0.84;
  if (isHighlighted) return 0.82;
  return 0.79;
};

const ringInnerRadius = 0.755;
const showRing = (isSelected: boolean, isHovered: boolean, isHighlighted: boolean) =>
  isSelected || isHovered || isHighlighted;
const hitAreaRadius = 0.92;

const selectedHaloGeometry20 = new CircleGeometry(0.82, 20);
const selectedHaloGeometry28 = new CircleGeometry(0.82, 28);
const hitAreaGeometry16 = new CircleGeometry(hitAreaRadius, 16);
const hitAreaGeometry20 = new CircleGeometry(hitAreaRadius, 20);
const avatarGeometry16 = new CircleGeometry(0.72, 16);
const avatarGeometry20 = new CircleGeometry(0.72, 20);
const ringGeometryByState20 = {
  selected: new RingGeometry(ringInnerRadius, ringOuterRadius(true, false), 20),
  highlighted: new RingGeometry(ringInnerRadius, ringOuterRadius(false, true), 20),
  default: new RingGeometry(ringInnerRadius, ringOuterRadius(false, false), 20)
} as const;
const ringGeometryByState16 = {
  selected: new RingGeometry(ringInnerRadius, ringOuterRadius(true, false), 16),
  highlighted: new RingGeometry(ringInnerRadius, ringOuterRadius(false, true), 16),
  default: new RingGeometry(ringInnerRadius, ringOuterRadius(false, false), 16)
} as const;

const ringGeometryForState = (
  isSelected: boolean,
  isHighlighted: boolean,
  variant: "segments16" | "segments20"
): BufferGeometry => {
  const ringGeometryByState = variant === "segments16" ? ringGeometryByState16 : ringGeometryByState20;
  if (isSelected) {
    return ringGeometryByState.selected;
  }
  if (isHighlighted) {
    return ringGeometryByState.highlighted;
  }
  return ringGeometryByState.default;
};

const PersonNodeComponent = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  onClick,
  onHover
}: PersonNodeProps) => {
  const thumbnailUrl = useMemo(() => personThumbnailUrl(person.id), [person.id]);
  const texture = useTexture(thumbnailUrl);
  const scale = nodeScale(isSelected, isHovered, isHighlighted);
  const ringGeometry = ringGeometryForState(isSelected, isHighlighted, "segments20");

  useEffect(() => {
    applyCoverCrop(texture);
  }, [texture]);

  return (
    <Billboard>
      {isSelected || isHighlighted ? (
        <mesh position={[0, 0, -0.04]} scale={1.16}>
          <primitive object={selectedHaloGeometry28} attach="geometry" />
          <meshBasicMaterial color={isSelected ? "#22d3ee" : "#a78bfa"} transparent opacity={0.12} />
        </mesh>
      ) : null}
      <mesh
        onClick={(event) => onClick(person.id, event)}
        onPointerOver={() => onHover(person.id, true)}
        onPointerOut={() => onHover(person.id, false)}
        scale={scale}
      >
        <primitive object={hitAreaGeometry20} attach="geometry" />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh scale={scale}>
        <primitive object={avatarGeometry20} attach="geometry" />
        <meshBasicMaterial map={texture} />
      </mesh>
      {showRing(isSelected, isHovered, isHighlighted) ? (
        <mesh position={[0, 0, -0.02]}>
          <primitive object={ringGeometry} attach="geometry" />
          <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
        </mesh>
      ) : null}
      <Text
        position={[0, -1.05, 0]}
        fontSize={isSelected ? 0.23 : 0.21}
        color={isSelected ? "#f8fafc" : isHighlighted ? "#c4b5fd" : "#e2e8f0"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#0f172a"
      >
        {truncateName(person.name)}
      </Text>
    </Billboard>
  );
};

export const PersonNode = memo(PersonNodeComponent);

const PersonNodeFallbackComponent = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  onClick,
  onHover
}: PersonNodeProps) => {
  const scale = nodeScale(isSelected, isHovered, isHighlighted);
  const ringGeometry = ringGeometryForState(isSelected, isHighlighted, "segments16");

  return (
    <Billboard>
      {isSelected || isHighlighted ? (
        <mesh position={[0, 0, -0.04]} scale={1.16}>
          <primitive object={selectedHaloGeometry20} attach="geometry" />
          <meshBasicMaterial color={isSelected ? "#22d3ee" : "#a78bfa"} transparent opacity={0.12} />
        </mesh>
      ) : null}
      <mesh
        onClick={(event) => onClick(person.id, event)}
        onPointerOver={() => onHover(person.id, true)}
        onPointerOut={() => onHover(person.id, false)}
        scale={scale}
      >
        <primitive object={hitAreaGeometry16} attach="geometry" />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh scale={scale}>
        <primitive object={avatarGeometry16} attach="geometry" />
        <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
      </mesh>
      {showRing(isSelected, isHovered, isHighlighted) ? (
        <mesh position={[0, 0, -0.02]}>
          <primitive object={ringGeometry} attach="geometry" />
          <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
        </mesh>
      ) : null}
      <Text
        position={[0, -1.05, 0]}
        fontSize={isSelected ? 0.23 : 0.21}
        color={isSelected ? "#f8fafc" : isHighlighted ? "#c4b5fd" : "#e2e8f0"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor="#0f172a"
      >
        {truncateName(person.name)}
      </Text>
    </Billboard>
  );
};

export const PersonNodeFallback = memo(PersonNodeFallbackComponent);
