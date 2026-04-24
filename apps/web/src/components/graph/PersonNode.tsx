/**
 * @file Single person sphere/mesh with selection and hover affordances.
 */

import { Billboard, Text } from "@react-three/drei";
import { memo, useEffect, useMemo, useState } from "react";
import {
  CircleGeometry,
  MeshBasicMaterial,
  RingGeometry,
  TextureLoader,
  type BufferGeometry,
  type Texture
} from "three";
import type { ImmichPerson } from "../../lib/api";
import { personThumbnailUrl } from "../../lib/api";
import { applyCoverCrop } from "./useThumbnailLoader";

export type PersonNodeProps = {
  person: ImmichPerson;
  isSelected: boolean;
  isHovered: boolean;
  isHighlighted: boolean;
  showLabel?: boolean;
  preloadedTexture?: Texture | null;
  onClick: (personId: string, event: { stopPropagation: () => void }) => void;
  onHover: (personId: string, hovered: boolean) => void;
};

const truncateName = (name: string, maxLength = 22) => {
  if (name.length <= maxLength) {
    return name;
  }
  return `${name.slice(0, maxLength - 1)}...`;
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
const ringGeometryLite = new RingGeometry(0.58, 0.64, 12);
const avatarGeometryLite = new CircleGeometry(0.56, 12);
const hitAreaGeometryLite = new CircleGeometry(hitAreaRadius, 12);
const invisibleHitAreaMaterial = new MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false
});
const haloMaterialSelected = new MeshBasicMaterial({
  color: "#22d3ee",
  transparent: true,
  opacity: 0.12
});
const haloMaterialHighlighted = new MeshBasicMaterial({
  color: "#a78bfa",
  transparent: true,
  opacity: 0.12
});
const ringMaterialByColor = {
  selected: new MeshBasicMaterial({ color: "#22d3ee" }),
  highlighted: new MeshBasicMaterial({ color: "#a78bfa" }),
  hovered: new MeshBasicMaterial({ color: "#93c5fd" }),
  default: new MeshBasicMaterial({ color: "#64748b" })
} as const;

const ringMaterialForState = (isSelected: boolean, isHovered: boolean, isHighlighted: boolean) => {
  if (isSelected) {
    return ringMaterialByColor.selected;
  }
  if (isHighlighted) {
    return ringMaterialByColor.highlighted;
  }
  if (isHovered) {
    return ringMaterialByColor.hovered;
  }
  return ringMaterialByColor.default;
};

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
  showLabel = true,
  preloadedTexture,
  onClick,
  onHover
}: PersonNodeProps) => {
  const thumbnailUrl = useMemo(() => personThumbnailUrl(person.id), [person.id]);
  const [localTexture, setLocalTexture] = useState<Texture | null>(null);
  const texture = preloadedTexture !== undefined ? preloadedTexture : localTexture;
  const scale = nodeScale(isSelected, isHovered, isHighlighted);
  const ringGeometry = ringGeometryForState(isSelected, isHighlighted, "segments20");
  const ringMaterial = ringMaterialForState(isSelected, isHovered, isHighlighted);
  const haloMaterial = isSelected ? haloMaterialSelected : haloMaterialHighlighted;

  // Fallback TextureLoader path: only runs when no preloadedTexture is provided.
  useEffect(() => {
    if (preloadedTexture !== undefined) {
      return;
    }
    let disposed = false;
    let loadedTexture: Texture | null = null;
    const loader = new TextureLoader();
    loader.setCrossOrigin("use-credentials");
    loader.load(
      thumbnailUrl,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        applyCoverCrop(tex);
        loadedTexture = tex;
        setLocalTexture(tex);
      },
      undefined,
      () => {
        if (disposed) {
          return;
        }
        setLocalTexture(null);
      }
    );
    return () => {
      disposed = true;
      if (loadedTexture) {
        loadedTexture.dispose();
        loadedTexture = null;
        setLocalTexture(null);
      }
    };
  }, [thumbnailUrl, preloadedTexture]);

  return (
    <Billboard>
      {isSelected || isHighlighted ? (
        <mesh position={[0, 0, -0.04]} scale={1.16}>
          <primitive object={selectedHaloGeometry28} attach="geometry" />
          <primitive object={haloMaterial} attach="material" />
        </mesh>
      ) : null}
      <mesh
        onClick={(event) => onClick(person.id, event)}
        onPointerOver={() => onHover(person.id, true)}
        onPointerOut={() => onHover(person.id, false)}
        scale={scale}
      >
        <primitive object={hitAreaGeometry20} attach="geometry" />
        <primitive object={invisibleHitAreaMaterial} attach="material" />
      </mesh>
      <mesh scale={scale}>
        <primitive object={avatarGeometry20} attach="geometry" />
        {texture ? <meshBasicMaterial map={texture} /> : <meshBasicMaterial color="#64748b" />}
      </mesh>
      {showRing(isSelected, isHovered, isHighlighted) ? (
        <mesh position={[0, 0, -0.02]}>
          <primitive object={ringGeometry} attach="geometry" />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      ) : null}
      {showLabel ? (
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
      ) : null}
    </Billboard>
  );
};

export const PersonNode = memo(PersonNodeComponent);

const PersonNodeFallbackComponent = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  showLabel = true,
  onClick,
  onHover
}: PersonNodeProps) => {
  const scale = nodeScale(isSelected, isHovered, isHighlighted);
  const ringGeometry = ringGeometryForState(isSelected, isHighlighted, "segments16");
  const ringMaterial = ringMaterialForState(isSelected, isHovered, isHighlighted);
  const haloMaterial = isSelected ? haloMaterialSelected : haloMaterialHighlighted;

  return (
    <Billboard>
      {isSelected || isHighlighted ? (
        <mesh position={[0, 0, -0.04]} scale={1.16}>
          <primitive object={selectedHaloGeometry20} attach="geometry" />
          <primitive object={haloMaterial} attach="material" />
        </mesh>
      ) : null}
      <mesh
        onClick={(event) => onClick(person.id, event)}
        onPointerOver={() => onHover(person.id, true)}
        onPointerOut={() => onHover(person.id, false)}
        scale={scale}
      >
        <primitive object={hitAreaGeometry16} attach="geometry" />
        <primitive object={invisibleHitAreaMaterial} attach="material" />
      </mesh>
      <mesh scale={scale}>
        <primitive object={avatarGeometry16} attach="geometry" />
        <primitive object={ringMaterial} attach="material" />
      </mesh>
      {showRing(isSelected, isHovered, isHighlighted) ? (
        <mesh position={[0, 0, -0.02]}>
          <primitive object={ringGeometry} attach="geometry" />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      ) : null}
      {showLabel ? (
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
      ) : null}
    </Billboard>
  );
};

export const PersonNodeFallback = memo(PersonNodeFallbackComponent);

const PersonNodeMinimalComponent = ({
  person,
  isSelected,
  isHovered,
  isHighlighted,
  onClick,
  onHover
}: PersonNodeProps) => {
  const ringMaterial = ringMaterialForState(isSelected, isHovered, isHighlighted);

  return (
    <Billboard>
      <mesh
        onClick={(event) => onClick(person.id, event)}
        onPointerOver={() => onHover(person.id, true)}
        onPointerOut={() => onHover(person.id, false)}
      >
        <primitive object={hitAreaGeometryLite} attach="geometry" />
        <primitive object={invisibleHitAreaMaterial} attach="material" />
      </mesh>
      <mesh>
        <primitive object={avatarGeometryLite} attach="geometry" />
        <primitive object={ringMaterial} attach="material" />
      </mesh>
      {showRing(isSelected, isHovered, isHighlighted) ? (
        <mesh position={[0, 0, -0.01]}>
          <primitive object={ringGeometryLite} attach="geometry" />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      ) : null}
    </Billboard>
  );
};

export const PersonNodeMinimal = memo(PersonNodeMinimalComponent);
