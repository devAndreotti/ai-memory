// Shared circular layout + edge-path math for the project graph (nodes =
// projects) and the page graph (nodes = pages within one project). Both
// views place nodes on an alternating two-ring circle and connect them
// with a quadratic bezier that bends away from the straight line.

export const graphCanvasWidth = 1000;
export const graphCanvasHeight = 620;

export interface CircularNode<T> {
  item: T;
  key: string;
  x: number;
  y: number;
  radius: number;
  degree: number;
}

export function layoutCircular<T>(
  items: T[],
  keyOf: (item: T) => string,
  degreeByKey: Map<string, number>,
  radiusOf: (item: T, degree: number) => number,
): CircularNode<T>[] {
  return items.map((item, index) => {
    const angle = (index / items.length) * Math.PI * 2 - Math.PI / 2;
    const degree = degreeByKey.get(keyOf(item)) ?? 0;
    const ringX = index % 2 === 0 ? 315 : 390;
    const ringY = index % 2 === 0 ? 190 : 220;
    return {
      item,
      key: keyOf(item),
      degree,
      radius: radiusOf(item, degree),
      x: Math.round(graphCanvasWidth / 2 + Math.cos(angle) * ringX),
      y: Math.round(graphCanvasHeight / 2 + Math.sin(angle) * ringY),
    };
  });
}

export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = Math.min(80, distance * 0.14);
  const controlX = midX - (dy / distance) * bend;
  const controlY = midY + (dx / distance) * bend;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}
