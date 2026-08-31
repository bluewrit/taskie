// CSS 3D rotating cube — the Taskie brand mark.
import React from 'react';

export default function BrandCube({ size = 36 }) {
  return (
    <div className="cube-scene" style={{ width: size, height: size, '--cube-size': `${size}px` }} aria-hidden="true">
      <div className="cube">
        <div className="cube-face cube-front">✓</div>
        <div className="cube-face cube-back">✓</div>
        <div className="cube-face cube-right">✓</div>
        <div className="cube-face cube-left">✓</div>
        <div className="cube-face cube-top">✓</div>
        <div className="cube-face cube-bottom">✓</div>
      </div>
    </div>
  );
}
