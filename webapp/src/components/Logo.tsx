import Image from "next/image";

/** Brand logo with a light-ink variant for the dark theme (CSS-switched, no flash). */
export default function Logo({ width, height, className = "", priority }: { width: number; height: number; className?: string; priority?: boolean }) {
  return (
    <>
      <Image src="/logo.svg" alt="Neo Nature" width={width} height={height} priority={priority} className={`${className} dark:hidden`} />
      <Image src="/logo-dark.svg" alt="Neo Nature" width={width} height={height} priority={priority} className={`${className} hidden dark:block`} />
    </>
  );
}
