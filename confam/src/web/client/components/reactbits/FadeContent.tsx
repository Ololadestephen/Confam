import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import "./FadeContent.css";

// Dependency-free adaptation of React Bits FadeContent; see THIRD_PARTY_NOTICES.md.
export interface FadeContentProps extends HTMLAttributes<HTMLDivElement> {
  blur?: boolean | number;
  duration?: number;
  delay?: number;
  threshold?: number;
  initialOpacity?: number;
}

export default function FadeContent({
  children,
  className = "",
  style,
  blur = false,
  duration = 500,
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  ...props
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: Math.min(1, Math.max(0, threshold)) },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  const customStyle = {
    "--fade-opacity": Math.min(1, Math.max(0, initialOpacity)),
    "--fade-blur": `${blur === true ? 10 : Math.max(0, Number(blur) || 0)}px`,
    "--fade-duration": `${Math.max(0, duration)}ms`,
    "--fade-delay": `${Math.max(0, delay)}ms`,
    ...style,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={`fade-content${visible ? " fade-content--visible" : ""} ${className}`}
      style={customStyle}
      {...props}
    >
      {children}
    </div>
  );
}
