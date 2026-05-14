/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

interface BrandMarkProps {
  href?: string;
  className?: string;
  dark?: boolean;
}

export function BrandMark({
  href,
  className = "",
  dark = false,
}: BrandMarkProps) {
  const content = (
    <>
      <div className="relative size-5 overflow-hidden rounded-md">
        <img
          src="/icon-light.png"
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 size-full object-cover ${dark ? "hidden" : "dark:hidden"}`}
        />
        <img
          src="/icon-dark.png"
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 size-full object-cover ${dark ? "block" : "hidden dark:block"}`}
        />
      </div>
      <span>Branchback</span>
    </>
  );

  const classes = `inline-flex items-center gap-2 text-sm font-semibold tracking-tight ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <span className={classes}>{content}</span>;
}
