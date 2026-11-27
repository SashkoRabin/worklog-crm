"use client";

const snowflakes = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: `${(index * 37 + 11) % 100}%`,
  delay: `-${(index * 1.73) % 19}s`,
  duration: `${14 + ((index * 7) % 12)}s`,
  size: `${8 + ((index * 5) % 9)}px`,
  opacity: 0.28 + ((index * 13) % 48) / 100,
}));

const garlandBulbs = Array.from({ length: 13 }, (_, index) => index);

export function ChristmasDecor() {
  return (
    <div className="christmas-decor" aria-hidden="true">
      <div className="christmas-garland christmas-garland-left">
        <span className="christmas-garland-wire" />
        {garlandBulbs.map((bulb) => (
          <span className="christmas-bulb" key={bulb} />
        ))}
      </div>
      <div className="christmas-garland christmas-garland-right">
        <span className="christmas-garland-wire" />
        {garlandBulbs.map((bulb) => (
          <span className="christmas-bulb" key={bulb} />
        ))}
      </div>
      <div className="christmas-snow" role="presentation">
        {snowflakes.map((flake) => (
          <span
            className="christmas-snowflake"
            key={flake.id}
            style={{
              left: flake.left,
              animationDelay: flake.delay,
              animationDuration: flake.duration,
              fontSize: flake.size,
              opacity: flake.opacity,
            }}
          >
            ❄
          </span>
        ))}
      </div>
    </div>
  );
}
