import { Billboard, Text, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { SRGBColorSpace, type Texture } from "three";
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
  onClick: () => void;
  onHover: (hovered: boolean) => void;
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

export const PersonNode = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  onClick,
  onHover
}: PersonNodeProps) => {
  const thumbnailUrl = useMemo(() => personThumbnailUrl(person.id), [person.id]);
  const texture = useTexture(thumbnailUrl);
  useEffect(() => {
    applyCoverCrop(texture);
  }, [texture]);

  return (
    <Billboard>
      {isSelected || isHighlighted ? (
        <mesh position={[0, 0, -0.04]} scale={1.16}>
          <circleGeometry args={[0.82, 28]} />
          <meshBasicMaterial color={isSelected ? "#22d3ee" : "#a78bfa"} transparent opacity={0.12} />
        </mesh>
      ) : null}
      <mesh
        onClick={onClick}
        onPointerOver={() => onHover(true)}
        onPointerOut={() => onHover(false)}
        scale={isSelected ? 1.08 : isHighlighted ? 0.9 : isHovered ? 0.86 : 0.82}
      >
        <circleGeometry args={[0.72, 20]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <ringGeometry args={[0.75, isSelected ? 0.88 : isHighlighted ? 0.86 : 0.82, 20]} />
        <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
      </mesh>
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

export const PersonNodeFallback = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  onClick,
  onHover
}: PersonNodeProps) => (
  <Billboard>
    {isSelected || isHighlighted ? (
      <mesh position={[0, 0, -0.04]} scale={1.16}>
        <circleGeometry args={[0.82, 20]} />
        <meshBasicMaterial color={isSelected ? "#22d3ee" : "#a78bfa"} transparent opacity={0.12} />
      </mesh>
    ) : null}
    <mesh
      onClick={onClick}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
      scale={isSelected ? 1.08 : isHighlighted ? 0.9 : isHovered ? 0.86 : 0.82}
    >
      <circleGeometry args={[0.72, 16]} />
      <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
    </mesh>
    <mesh position={[0, 0, -0.02]}>
      <ringGeometry args={[0.75, isSelected ? 0.88 : isHighlighted ? 0.86 : 0.82, 16]} />
      <meshBasicMaterial color={ringColor(isSelected, isHovered, isHighlighted)} />
    </mesh>
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
