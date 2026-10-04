import { useLayoutEffect, useRef } from "react";

/**
 * Ref that always holds the value from the latest committed render.
 *
 * Lets an effect call a fresh callback (or read fresh props) without listing it as a dependency,
 * so the effect keeps re-running only on its real triggers. Call it before the effects that read it:
 * layout effects run in declaration order, so the ref is updated first.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
